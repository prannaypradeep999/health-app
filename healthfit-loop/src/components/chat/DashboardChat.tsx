'use client';

import React, { useState, createContext, useContext } from 'react';
import { ChatPopup } from './ChatPopup';

interface DashboardChatProps {
  children: React.ReactNode;
  userName?: string;
}

interface ChatContextType {
  isChatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within DashboardChat');
  }
  return context;
};

export function DashboardChat({ children, userName }: DashboardChatProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);

  const openChat = () => {
    setIsChatOpen(true);
  };

  const closeChat = () => {
    setIsChatOpen(false);
  };

  const chatContextValue: ChatContextType = {
    isChatOpen,
    openChat,
    closeChat
  };

  return (
    <ChatContext.Provider value={chatContextValue}>
      <div className="min-h-screen bg-gray-50">
        {/* Main dashboard content */}
        {children}
      </div>

      {/* Chat Popup */}
      <ChatPopup
        isOpen={isChatOpen}
        onClose={closeChat}
        userName={userName}
      />
    </ChatContext.Provider>
  );
}