/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { ChatView } from './components/Chat/ChatView';
import { Header } from './components/Layout/Header';
import { ProjectSelector } from './components/Layout/ProjectSelector';
import { FilePanel } from './components/Files';
import { LoginPage } from './components/Auth';
import { useWebSocket } from './hooks/useWebSocket';
import { useChat } from './hooks/useChat';
import { useAuth, getAuthHeaders } from './hooks/useAuth';

function App() {
  const { token, isAuthenticated, checking, login } = useAuth();
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  const {
    connected,
    sessionInfo,
    sendMessage: wsSend,
    subscribe,
  } = useWebSocket(token);
  const {
    messages,
    isLoading,
    pendingConfirmation,
    sendMessage,
    confirmTool,
    cancelRequest,
  } = useChat(wsSend, subscribe);

  // Sync projectPath from session - MUST be before any conditional returns
  useEffect(() => {
    if (sessionInfo?.projectPath) {
      setProjectPath(sessionInfo.projectPath);
    }
  }, [sessionInfo]);

  // Show loading while checking auth
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLogin={login} />;
  }

  const handleSelectProject = async (path: string) => {
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ projectPath: path }),
      });

      if (response.ok) {
        setProjectPath(path);
        setShowProjectSelector(false);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to set project');
      }
    } catch (_error) {
      alert('Failed to connect to server');
    }
  };

  if (!projectPath || showProjectSelector) {
    return (
      <div className="h-full flex flex-col">
        <Header
          projectPath={projectPath}
          connected={connected}
          onChangeProject={() => setShowProjectSelector(true)}
        />
        <ProjectSelector
          onSelect={handleSelectProject}
          currentPath={projectPath}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <Header
        projectPath={projectPath}
        connected={connected}
        onChangeProject={() => setShowProjectSelector(true)}
        onToggleFiles={() => setShowFiles(!showFiles)}
        showFiles={showFiles}
      />
      <div className="flex-1 flex overflow-hidden">
        {/* File Panel - Mobile: full screen overlay, Desktop: side panel */}
        {showFiles && (
          <div className="w-full sm:w-80 sm:flex-shrink-0 absolute sm:relative inset-0 top-auto h-[calc(100%-60px)] sm:h-auto z-40 sm:z-auto bg-white sm:border-r sm:border-gray-200">
            <FilePanel onClose={() => setShowFiles(false)} />
          </div>
        )}
        {/* Chat View */}
        <div
          className={`flex-1 min-w-0 ${showFiles ? 'hidden sm:flex' : 'flex'}`}
        >
          <ChatView
            messages={messages}
            isLoading={isLoading}
            pendingConfirmation={pendingConfirmation}
            onSendMessage={sendMessage}
            onConfirmTool={confirmTool}
            onCancel={cancelRequest}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
