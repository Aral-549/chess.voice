// ============================================================
// VoiceChessmate — Live Transcript Panel
// Shows real-time conversation with streaming text effect
// Fully accessible for screen readers with ARIA log & live regions
// ============================================================

'use client';

import { useEffect, useRef } from 'react';
import type { TranscriptEntry } from '@/types';

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
}

export function TranscriptPanel({ entries }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <section
      role="region"
      aria-label="Conversation and Game Action Transcript"
      className="flex flex-col h-full"
    >
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 border-b border-gray-700 flex items-center gap-2">
        💬 Live Transcript
        {entries.length > 0 && !entries[entries.length - 1].isFinal && (
          <span
            className="inline-block w-1.5 h-4 bg-green-400 rounded-full animate-pulse"
            aria-hidden="true"
          />
        )}
      </h2>
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        className="flex-1 overflow-y-auto p-4 space-y-3 focus:outline-none"
        tabIndex={0}
        aria-label="Transcript entries list. Use up and down arrow keys to scroll."
      >
        {entries.length === 0 && (
          <p className="text-gray-500 text-sm italic">
            Start speaking to see the conversation here...
          </p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`flex ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                entry.speaker === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-gray-700 text-gray-100 rounded-bl-md'
              } ${!entry.isFinal ? 'opacity-70 border border-dashed border-gray-500' : ''}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-medium opacity-60">
                  {entry.speaker === 'user' ? '🎤 You' : '♔ Agent'}
                </span>
                {!entry.isFinal && (
                  <span className="text-[10px] text-yellow-400 font-medium" aria-hidden="true">
                    streaming...
                  </span>
                )}
              </div>
              <p className="leading-relaxed">
                {entry.text}
                {!entry.isFinal && (
                  <span
                    className="inline-block w-1 h-3.5 bg-current ml-0.5 animate-pulse rounded-sm"
                    aria-hidden="true"
                  />
                )}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}

