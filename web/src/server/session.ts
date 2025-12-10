/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session Manager
 * Manages the chat session using @google/gemini-cli-core
 */

import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  Config,
  GeminiEventType,
  AuthType,
  CoreToolScheduler,
  ToolConfirmationOutcome,
  type ServerGeminiStreamEvent,
  type ToolCallRequestInfo,
  type CompletedToolCall,
  type ToolCallConfirmationDetails,
} from '@google/gemini-cli-core';
import type { Content, Part } from '@google/genai';

const GEMINI_DIR = '.gemini';

// Model fallback chain for quota exhaustion
const MODEL_FALLBACK_CHAIN = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

// Logger utility
function log(category: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${category}]`;
  if (data !== undefined) {
    console.log(prefix, message, JSON.stringify(data, null, 2));
  } else {
    console.log(prefix, message);
  }
}

function logError(category: string, message: string, error?: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${category}] ERROR:`;
  console.error(prefix, message, error);
}

export interface WebSession {
  id: string;
  projectPath: string;
  config: Config;
  abortController: AbortController | null;
  currentModelIndex: number; // Index in MODEL_FALLBACK_CHAIN
}

export interface ToolConfirmation {
  toolName: string;
  args: Record<string, unknown>;
  details: ToolCallConfirmationDetails;
  onConfirm: (outcome: ToolConfirmationOutcome) => void;
}

export class SessionManager {
  private session: WebSession | null = null;
  private pendingToolConfirmation: ToolConfirmation | null = null;

  async createSession(projectPath: string): Promise<string> {
    log('Session', `Creating session for project: ${projectPath}`);

    // Close existing session if any
    if (this.session) {
      log('Session', 'Closing existing session');
      await this.closeSession();
    }

    const sessionId = randomUUID();
    log('Session', `New session ID: ${sessionId}`);

    // Ensure .gemini directory exists for settings and configuration
    const geminiDir = path.join(projectPath, GEMINI_DIR);
    try {
      await mkdir(geminiDir, { recursive: true });
      log('Session', `Created .gemini directory: ${geminiDir}`);
    } catch (err) {
      log('Session', `Note: Could not create .gemini directory: ${err}`);
    }

    // Create Config with required parameters
    const config = new Config({
      sessionId,
      cwd: projectPath,
      targetDir: projectPath,
      model: MODEL_FALLBACK_CHAIN[0], // Start with first model in fallback chain
      debugMode: false,
      interactive: true, // Enable interactive mode for tool confirmations
      trustedFolder: true, // Trust the folder to allow tool execution
    });

    log('Session', 'Initializing config...');
    await config.initialize();
    log('Session', 'Config initialized');

    // Set up authentication
    const authType = this.detectAuthType();
    log('Session', `Using auth type: ${authType}`);
    await config.refreshAuth(authType);
    log('Session', 'Auth refreshed');

    // Start with first model in fallback chain
    const initialModelIndex = 0;

    this.session = {
      id: sessionId,
      projectPath,
      config,
      abortController: null,
      currentModelIndex: initialModelIndex,
    };

    log('Session', 'Session created successfully');
    return sessionId;
  }

  private detectAuthType(): AuthType {
    if (process.env['GEMINI_API_KEY']) {
      return AuthType.USE_GEMINI;
    }
    if (process.env['GOOGLE_GENAI_USE_VERTEXAI'] === 'true') {
      return AuthType.USE_VERTEX_AI;
    }
    if (process.env['GOOGLE_GENAI_USE_GCA'] === 'true') {
      return AuthType.LOGIN_WITH_GOOGLE;
    }
    return AuthType.USE_GEMINI;
  }

  getSession(): WebSession | null {
    return this.session;
  }

  isSessionActive(): boolean {
    return this.session !== null;
  }

  getProjectPath(): string | null {
    return this.session?.projectPath ?? null;
  }

  getCurrentModel(): string {
    if (!this.session) return MODEL_FALLBACK_CHAIN[0];
    return MODEL_FALLBACK_CHAIN[this.session.currentModelIndex];
  }

  /**
   * Check if error is a quota exhaustion error
   */
  private isQuotaError(error: unknown): boolean {
    const errorStr = String(error);
    return (
      errorStr.includes('exhausted your capacity') ||
      errorStr.includes('quota') ||
      errorStr.includes('rate limit') ||
      errorStr.includes('RESOURCE_EXHAUSTED')
    );
  }

  /**
   * Switch to next model in fallback chain
   * Returns true if switched, false if no more models available
   */
  private async switchToNextModel(): Promise<boolean> {
    if (!this.session) return false;

    const nextIndex = this.session.currentModelIndex + 1;
    if (nextIndex >= MODEL_FALLBACK_CHAIN.length) {
      log('Model', 'No more fallback models available');
      return false;
    }

    const nextModel = MODEL_FALLBACK_CHAIN[nextIndex];
    log('Model', `Switching from ${this.getCurrentModel()} to ${nextModel}`);

    // Recreate config with new model
    const { projectPath, id: sessionId } = this.session;

    const config = new Config({
      sessionId,
      cwd: projectPath,
      targetDir: projectPath,
      model: nextModel,
      debugMode: false,
      interactive: true,
      trustedFolder: true,
    });

    await config.initialize();
    const authType = this.detectAuthType();
    await config.refreshAuth(authType);

    this.session.config = config;
    this.session.currentModelIndex = nextIndex;

    log('Model', `Successfully switched to ${nextModel}`);
    return true;
  }

  async sendMessage(
    message: string,
    onEvent: (event: WebStreamEvent) => void,
  ): Promise<void> {
    log('Message', `sendMessage called, length: ${message.length}`);
    log('Message', `Message preview: ${message.substring(0, 100)}...`);

    if (!this.session) {
      logError('Message', 'No active session');
      throw new Error('No active session');
    }

    const { config } = this.session;
    log('Message', 'Getting GeminiClient...');
    const client = config.getGeminiClient();
    const promptId = randomUUID();
    log('Message', `Prompt ID: ${promptId}`);

    // Create abort controller for this message
    this.session.abortController = new AbortController();
    const signal = this.session.abortController.signal;

    // Current message to send (starts with user input, then tool results)
    let currentMessage: Part[] = [{ text: message }];
    let turnCount = 0;
    const maxTurns = 50;

    try {
      // Main loop
      while (turnCount < maxTurns) {
        await new Promise((resolve) => setImmediate(resolve));

        turnCount++;
        const toolCallRequests: ToolCallRequestInfo[] = [];

        log('Turn', `=== Turn ${turnCount} starting ===`);
        log('Turn', `Sending ${currentMessage.length} part(s) to Gemini`);

        const stream = client.sendMessageStream(
          currentMessage,
          signal,
          promptId,
        );
        let eventCount = 0;
        let contentLength = 0;

        for await (const event of stream) {
          eventCount++;

          if (signal.aborted) {
            log('Turn', 'Signal aborted, cancelling');
            onEvent({ type: 'cancelled' });
            return;
          }

          // Log ALL raw events from Gemini with full details
          log(
            'RawEvent',
            `[${eventCount}] RAW Gemini event type=${event.type}`,
            {
              type: event.type,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              value: event.type === GeminiEventType.Content
                ? { text: event.value, length: (event.value ?? '').length }
                : (event as any).value,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              fullEvent: JSON.stringify(event).substring(0, 500),
            }
          );

          // Log event details
          if (event.type === GeminiEventType.Content) {
            contentLength += (event.value ?? '').length;
            log('Content', `Content chunk received`, {
              chunkLength: (event.value ?? '').length,
              totalContentSoFar: contentLength,
              textPreview: (event.value ?? '').substring(0, 200),
            });
          } else {
            log(
              'Event',
              `[${eventCount}] type=${event.type}`,
              event.type === GeminiEventType.ToolCallRequest
                ? { name: event.value.name, callId: event.value.callId }
                : undefined,
            );
          }

          // Collect tool call requests
          if (event.type === GeminiEventType.ToolCallRequest) {
            toolCallRequests.push(event.value);
            log('Tool', `Tool request: ${event.value.name}`, {
              callId: event.value.callId,
              args: event.value.args,
            });
          }

          // Transform and emit event to frontend
          const webEvent = this.transformEvent(event);
          if (webEvent) {
            log(
              'WebEvent',
              `>>> Sending to frontend: ${webEvent.type}`,
              webEvent.type === 'content'
                ? { length: webEvent.text.length, textPreview: webEvent.text.substring(0, 100) }
                : webEvent.type === 'tool_call'
                  ? { tool: webEvent.toolName }
                  : webEvent.type === 'thought'
                    ? { text: webEvent.text.substring(0, 100) }
                    : webEvent,
            );
            onEvent(webEvent);
          } else {
            log('WebEvent', `Event type ${event.type} not transformed (returned null)`);
          }

          // Handle errors
          if (event.type === GeminiEventType.Error) {
            const errorMsg = event.value.error.message || String(event.value.error);
            logError('Event', 'Gemini error', event.value.error);

            // Check if this is a quota error
            if (this.isQuotaError(errorMsg)) {
              const currentModel = this.getCurrentModel();
              log('Model', `Quota error in stream for ${currentModel}, attempting fallback...`);

              const switched = await this.switchToNextModel();
              if (switched) {
                const newModel = this.getCurrentModel();
                onEvent({
                  type: 'content',
                  text: `\n\n⚠️ **${currentModel} 配额已用尽，已自动切换到 ${newModel}**\n\n`,
                });

                // Retry with new model
                this.session!.abortController = null;
                return this.sendMessage(message, onEvent);
              }
            }

            onEvent({
              type: 'error',
              message: errorMsg,
            });
            return;
          }
        }

        log('Turn', `=== Turn ${turnCount} stream completed ===`, {
          eventCount,
          contentLength,
          toolCallCount: toolCallRequests.length,
        });
        log('Turn', `SUMMARY: Received ${eventCount} events, ${contentLength} chars of content, ${toolCallRequests.length} tool calls`);

        // If there are tool calls, execute them
        if (toolCallRequests.length > 0) {
          log('Tool', `Processing ${toolCallRequests.length} tool call(s)...`);

          const completedCalls = await this.executeToolsWithScheduler(
            config,
            toolCallRequests,
            signal,
            onEvent,
          );

          log('Tool', `All tools completed`, {
            count: completedCalls.length,
            statuses: completedCalls.map((c) => ({
              name: c.request.name,
              status: c.status,
            })),
          });

          // Build response parts from completed calls
          // IMPORTANT: Gemini API requires exactly one function response for each function call
          const toolResponseParts: Part[] = [];
          for (const completedCall of completedCalls) {
            if (completedCall.response?.responseParts?.length) {
              toolResponseParts.push(...completedCall.response.responseParts);
              log(
                'Tool',
                `Tool ${completedCall.request.name} response parts: ${completedCall.response.responseParts.length}`,
              );
            } else {
              // Generate fallback response for tools without response parts
              const fallbackResponse: Part = {
                functionResponse: {
                  name: completedCall.request.name,
                  response: {
                    error:
                      completedCall.status === 'cancelled'
                        ? 'Tool execution was cancelled'
                        : 'Tool execution failed or returned no response',
                  },
                },
              };
              toolResponseParts.push(fallbackResponse);
              log(
                'Tool',
                `Tool ${completedCall.request.name} generated fallback response (status: ${completedCall.status})`,
              );
            }
          }

          // Ensure we have exactly as many response parts as there were tool call requests
          if (toolResponseParts.length !== toolCallRequests.length) {
            log(
              'Tool',
              `WARNING: Response parts count (${toolResponseParts.length}) != request count (${toolCallRequests.length})`,
            );
          }

          currentMessage = toolResponseParts;
        } else {
          log('Turn', '=== No more tool calls, finishing conversation ===');
          log('Turn', `Final stats: ${turnCount} turn(s), ${contentLength} total content chars`);
          log('WebEvent', '>>> Sending "finished" event to frontend NOW');
          onEvent({ type: 'finished' });
          log('WebEvent', '"finished" event sent successfully');
          return;
        }
      }

      logError('Turn', `Max turns (${maxTurns}) reached`);
      onEvent({
        type: 'error',
        message: 'Maximum conversation turns exceeded',
      });
    } catch (error) {
      logError('Message', 'sendMessage error', error);

      // Check if this is a quota error and try to switch models
      if (this.isQuotaError(error)) {
        const currentModel = this.getCurrentModel();
        log('Model', `Quota error detected for ${currentModel}, attempting fallback...`);

        const switched = await this.switchToNextModel();
        if (switched) {
          const newModel = this.getCurrentModel();
          onEvent({
            type: 'content',
            text: `\n\n⚠️ **${currentModel} 配额已用尽，已自动切换到 ${newModel}**\n\n`,
          });

          // Retry with new model
          this.session!.abortController = null;
          return this.sendMessage(message, onEvent);
        } else {
          onEvent({
            type: 'error',
            message: `所有模型配额已用尽，请稍后再试。(${MODEL_FALLBACK_CHAIN.join(' → ')} 均不可用)`,
          });
        }
      } else if (signal.aborted) {
        onEvent({ type: 'cancelled' });
      } else {
        onEvent({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } finally {
      this.session.abortController = null;
      log('Message', 'sendMessage completed');
    }
  }

  private transformEvent(
    event: ServerGeminiStreamEvent,
  ): WebStreamEvent | null {
    switch (event.type) {
      case GeminiEventType.Content:
        return {
          type: 'content',
          text: event.value ?? '',
        };

      case GeminiEventType.Thought:
        return {
          type: 'thought',
          text: `${event.value.subject}: ${event.value.description}`,
        };

      case GeminiEventType.ToolCallRequest:
        return {
          type: 'tool_call',
          toolName: event.value.name,
          args: event.value.args,
        };

      case GeminiEventType.ToolCallResponse:
        return {
          type: 'tool_result',
          toolName: event.value.callId,
          result: event.value.resultDisplay,
        };

      case GeminiEventType.ToolCallConfirmation:
        return {
          type: 'tool_confirm_request',
          toolName: event.value.request.name,
          args: event.value.request.args,
          details: event.value.details,
        };

      case GeminiEventType.Error:
        return {
          type: 'error',
          message: event.value.error.message,
        };

      case GeminiEventType.ChatCompressed:
        return {
          type: 'chat_compressed',
        };

      default:
        return null;
    }
  }

  /**
   * Execute tools using CoreToolScheduler with proper confirmation handling
   */
  private executeToolsWithScheduler(
    config: Config,
    toolCallRequests: ToolCallRequestInfo[],
    signal: AbortSignal,
    onEvent: (event: WebStreamEvent) => void,
  ): Promise<CompletedToolCall[]> {
    return new Promise((resolve, reject) => {
      const reportedSuccess = new Set<string>();
      const reportedCancelled = new Set<string>();

      log(
        'Scheduler',
        `Creating scheduler for ${toolCallRequests.length} tool(s)`,
      );

      const scheduler = new CoreToolScheduler({
        config,
        getPreferredEditor: () => undefined,
        onAllToolCallsComplete: async (completedToolCalls) => {
          log('Scheduler', `onAllToolCallsComplete called`, {
            count: completedToolCalls.length,
            tools: completedToolCalls.map((c) => ({
              name: c.request.name,
              status: c.status,
              hasResponse: !!c.response,
              hasResultDisplay: !!c.response?.resultDisplay,
            })),
          });

          // Send results for any tools not yet reported
          for (const call of completedToolCalls) {
            const callId = call.request.callId;
            log(
              'Scheduler',
              `Processing completed call: ${call.request.name}`,
              {
                callId,
                status: call.status,
                alreadyReported: reportedSuccess.has(callId),
                hasResponse: !!call.response,
                responseKeys: call.response ? Object.keys(call.response) : [],
              },
            );
            if (call.status === 'success' && !reportedSuccess.has(callId)) {
              reportedSuccess.add(callId);
              // Try to get result from various fields
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const resp = call.response as any;
              const result =
                resp?.resultDisplay ??
                resp?.result ??
                resp?.output ??
                (resp ? JSON.stringify(resp) : 'Tool completed successfully');
              log('Scheduler', `Reporting success for ${call.request.name}`, {
                hasResult: !!result,
                resultType: typeof result,
                resultPreview:
                  typeof result === 'string'
                    ? result.substring(0, 200)
                    : JSON.stringify(result).substring(0, 200),
              });
              onEvent({
                type: 'tool_result',
                toolName: call.request.name,
                result,
              });
            }
          }

          resolve(completedToolCalls);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onToolCallsUpdate: (toolCalls: any[]) => {
          for (const toolCall of toolCalls) {
            const callId = toolCall.request.callId;
            log('Scheduler', `Tool update: ${toolCall.request.name}`, {
              callId,
              status: toolCall.status,
              hasConfirmationDetails: !!toolCall.confirmationDetails,
              hasResponse: !!toolCall.response,
            });

            // Handle awaiting_approval status
            if (
              toolCall.status === 'awaiting_approval' &&
              !this.pendingToolConfirmation
            ) {
              const confirmDetails =
                toolCall.confirmationDetails as ToolCallConfirmationDetails;
              log(
                'Scheduler',
                `Tool needs confirmation: ${toolCall.request.name}`,
                {
                  type: confirmDetails.type,
                },
              );

              this.pendingToolConfirmation = {
                toolName: toolCall.request.name,
                args: toolCall.request.args,
                details: confirmDetails,
                onConfirm: confirmDetails.onConfirm,
              };

              onEvent({
                type: 'tool_confirm_request',
                toolName: toolCall.request.name,
                args: toolCall.request.args,
                details: {
                  type: confirmDetails.type,
                  description:
                    confirmDetails.type === 'edit'
                      ? `Edit file: ${(confirmDetails as { fileName?: string }).fileName}`
                      : `Execute: ${toolCall.request.name}`,
                },
              });
            }

            // Emit result when completed
            if (toolCall.status === 'success' && !reportedSuccess.has(callId)) {
              reportedSuccess.add(callId);
              // Try to get result from various fields
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const resp = toolCall.response as any;
              const result =
                resp?.resultDisplay ??
                resp?.result ??
                resp?.output ??
                (resp ? JSON.stringify(resp) : 'Tool completed successfully');
              log(
                'Scheduler',
                `Tool success (from update): ${toolCall.request.name}`,
                {
                  hasResponse: !!toolCall.response,
                  responseKeys: toolCall.response
                    ? Object.keys(toolCall.response)
                    : [],
                  resultPreview:
                    typeof result === 'string'
                      ? result.substring(0, 200)
                      : typeof result,
                },
              );
              onEvent({
                type: 'tool_result',
                toolName: toolCall.request.name,
                result,
              });
            }

            // Handle cancelled
            if (
              toolCall.status === 'cancelled' &&
              !reportedCancelled.has(callId)
            ) {
              reportedCancelled.add(callId);
              log('Scheduler', `Tool cancelled: ${toolCall.request.name}`);
              onEvent({
                type: 'tool_cancelled',
                toolName: toolCall.request.name,
              });
            }
          }
        },
      });

      // Schedule all tool calls
      for (const request of toolCallRequests) {
        log('Scheduler', `Scheduling tool: ${request.name}`, {
          callId: request.callId,
        });
        scheduler.schedule(request, signal).catch((error) => {
          logError(
            'Scheduler',
            `Tool schedule error for ${request.name}`,
            error,
          );
          reject(error);
        });
      }
    });
  }

  confirmTool(confirmed: boolean): void {
    log('Confirm', `confirmTool called`, {
      confirmed,
      hasPending: !!this.pendingToolConfirmation,
      toolName: this.pendingToolConfirmation?.toolName,
      pendingArgs: this.pendingToolConfirmation?.args,
    });

    if (this.pendingToolConfirmation) {
      const outcome = confirmed
        ? ToolConfirmationOutcome.ProceedOnce
        : ToolConfirmationOutcome.Cancel;
      log('Confirm', `Calling onConfirm with outcome: ${outcome}`);
      try {
        this.pendingToolConfirmation.onConfirm(outcome);
        log('Confirm', 'onConfirm called successfully');
      } catch (err) {
        log('Confirm', `onConfirm error: ${err}`);
      }
      this.pendingToolConfirmation = null;
    } else {
      log('Confirm', 'WARNING: No pending confirmation to confirm!');
    }
  }

  hasPendingConfirmation(): boolean {
    return this.pendingToolConfirmation !== null;
  }

  getPendingConfirmation(): ToolConfirmation | null {
    return this.pendingToolConfirmation;
  }

  cancelCurrentRequest(): void {
    log('Session', 'cancelCurrentRequest called');
    if (this.session?.abortController) {
      this.session.abortController.abort();
    }
  }

  getHistory(): Content[] {
    if (!this.session) {
      return [];
    }
    return this.session.config.getGeminiClient().getHistory();
  }

  async resetChat(): Promise<void> {
    log('Session', 'resetChat called');
    if (this.session) {
      await this.session.config.getGeminiClient().resetChat();
    }
  }

  async closeSession(): Promise<void> {
    log('Session', 'closeSession called');
    if (this.session) {
      this.cancelCurrentRequest();
      this.session = null;
    }
  }
}

// Web-specific event types
export type WebStreamEvent =
  | { type: 'content'; text: string }
  | { type: 'thought'; text: string }
  | { type: 'tool_call'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; result: unknown }
  | {
      type: 'tool_confirm_request';
      toolName: string;
      args: Record<string, unknown>;
      details: unknown;
    }
  | { type: 'tool_cancelled'; toolName: string }
  | { type: 'chat_compressed' }
  | { type: 'error'; message: string }
  | { type: 'cancelled' }
  | { type: 'finished' };
