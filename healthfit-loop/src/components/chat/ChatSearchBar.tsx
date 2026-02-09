'use client';

import React from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useChatContext } from './DashboardChat';

export function ChatSearchBar() {
  const { openChat } = useChatContext();
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-8 mt-4 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-4xl mx-auto">
        <button
          onClick={openChat}
          className="w-full flex items-center gap-3 px-5 py-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200 group"
        >
          <div className="flex items-center text-gray-400 group-hover:text-red-500 transition-colors">
            <MagnifyingGlass size={20} weight="regular" />
          </div>
          <span className="flex-1 text-left text-gray-500 group-hover:text-gray-700 transition-colors ml-3">
            Ask anything about your meals, workouts, or health...
          </span>
        </button>
      </div>
    </motion.div>
  );
}