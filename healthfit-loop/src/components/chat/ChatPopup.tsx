'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Robot, User, PaperPlaneTilt, Spinner } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import Logo from '@/components/logo';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatPopupProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

const suggestions = [
  "What should I eat today?",
  "How's my nutrition this week?",
  "Explain my workout plan",
  "General health tips"
];

export function ChatPopup({ isOpen, onClose, userName }: ChatPopupProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setStreamingContent('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream');
      }

      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              // Stream finished
              const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: assistantContent,
                timestamp: new Date()
              };
              setMessages(prev => [...prev, assistantMessage]);
              setStreamingContent('');
              break;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                assistantContent += parsed.content;
                setStreamingContent(assistantContent);
              }
            } catch (e) {
              // Invalid JSON, skip
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, I encountered an error. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const welcomeMessage = `Hi ${userName || 'there'}! I'm your AI health assistant. I can help you with questions about your meal plans, workouts, nutrition, and general health advice. What would you like to know?`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/10 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Chat Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:transform sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[600px] sm:h-[500px] bg-white rounded-lg shadow-xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <Logo variant="icon" width={24} height={24} href="#" />
                <h3 className="font-medium text-gray-900">FYTR Assistant</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} weight="regular" className="text-gray-500" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="space-y-4">
                  {/* Welcome message */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 border border-gray-100 prose prose-sm max-w-none prose-headings:text-gray-900 prose-strong:text-gray-900 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm">
                        <ReactMarkdown
                          components={{
                            img: () => null, // Strip images
                            h1: ({children}) => <h3 className="text-sm font-semibold text-gray-900 mb-2">{children}</h3>,
                            h2: ({children}) => <h4 className="text-sm font-medium text-gray-900 mb-1">{children}</h4>,
                            h3: ({children}) => <h5 className="text-sm font-medium text-gray-900 mb-1">{children}</h5>,
                            p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({children}) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                            ol: ({children}) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                            li: ({children}) => <li className="text-sm">{children}</li>,
                            code: ({children, className}) =>
                              className?.includes('language-')
                                ? <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto"><code>{children}</code></pre>
                                : <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{children}</code>,
                            strong: ({children}) => <strong className="font-semibold text-gray-900">{children}</strong>,
                            em: ({children}) => <em className="italic">{children}</em>
                          }}
                        >
                          {welcomeMessage}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>

                  {/* Suggestion chips */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Quick suggestions:</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:border-[#c1272d] hover:bg-red-50 hover:text-[#c1272d] transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Chat messages */}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className="flex-1 space-y-1">
                    <div className={`rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-red-50 text-gray-900 ml-12 border border-red-100'
                        : 'bg-white text-gray-900 mr-12 border border-gray-200 prose prose-sm max-w-none prose-headings:text-gray-900 prose-strong:text-gray-900 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm'
                    }`}>
                      {message.role === 'assistant' ? (
                        <ReactMarkdown
                          components={{
                            img: () => null, // Strip images
                            h1: ({children}) => <h3 className="text-sm font-semibold text-gray-900 mb-2">{children}</h3>,
                            h2: ({children}) => <h4 className="text-sm font-medium text-gray-900 mb-1">{children}</h4>,
                            h3: ({children}) => <h5 className="text-sm font-medium text-gray-900 mb-1">{children}</h5>,
                            p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({children}) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                            ol: ({children}) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                            li: ({children}) => <li className="text-sm">{children}</li>,
                            code: ({children, className}) =>
                              className?.includes('language-')
                                ? <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto"><code>{children}</code></pre>
                                : <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{children}</code>,
                            strong: ({children}) => <strong className="font-semibold text-gray-900">{children}</strong>,
                            em: ({children}) => <em className="italic">{children}</em>
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      ) : (
                        message.content
                      )}
                    </div>
                    <div className={`text-xs text-gray-400 ${
                      message.role === 'user' ? 'text-right mr-12' : 'ml-0'
                    }`}>
                      {message.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              ))}

              {/* Streaming message */}
              {streamingContent && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <div className="bg-white rounded-lg px-3 py-2 text-sm mr-12 border border-gray-200 prose prose-sm max-w-none prose-headings:text-gray-900 prose-strong:text-gray-900 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm">
                      <ReactMarkdown
                        components={{
                          img: () => null,
                          h1: ({children}) => <h3 className="text-sm font-semibold text-gray-900 mb-2">{children}</h3>,
                          h2: ({children}) => <h4 className="text-sm font-medium text-gray-900 mb-1">{children}</h4>,
                          h3: ({children}) => <h5 className="text-sm font-medium text-gray-900 mb-1">{children}</h5>,
                          p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({children}) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                          ol: ({children}) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                          li: ({children}) => <li className="text-sm">{children}</li>,
                          code: ({children, className}) =>
                            className?.includes('language-')
                              ? <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto"><code>{children}</code></pre>
                              : <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{children}</code>,
                          strong: ({children}) => <strong className="font-semibold text-gray-900">{children}</strong>,
                          em: ({children}) => <em className="italic">{children}</em>
                        }}
                      >
                        {streamingContent}
                      </ReactMarkdown>
                      <span className="inline-block w-0.5 h-4 bg-gray-400 ml-1 animate-pulse" />
                    </div>
                  </div>
                </div>
              )}

              {/* Typing indicator */}
              {isLoading && !streamingContent && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <div className="bg-white rounded-lg px-3 py-2 text-sm mr-12 border border-gray-200">
                      <div className="flex items-center gap-1">
                        <Spinner size={14} className="animate-spin text-gray-500" />
                        <span className="text-gray-500">Thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Type your question..."
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c1272d] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="px-4 py-2 bg-[#c1272d] text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-[#c1272d] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <PaperPlaneTilt size={16} weight="regular" />
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}