// ============================================================
// VoiceChessmate — Modern Difficulty Selection Component
// Accessible difficulty controls with keyboard hotkeys (1-4)
// and tournament Elo approximations
// ============================================================

'use client';

import type { Difficulty } from '@/types';

interface DifficultySelectorProps {
  currentDifficulty: Difficulty;
  onSelectDifficulty: (difficulty: Difficulty) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const DIFFICULTIES: {
  level: Difficulty;
  label: string;
  rating: string;
  shortcut: string;
  desc: string;
}[] = [
  { level: 'beginner', label: 'Beginner', rating: '800', shortcut: '1', desc: 'Relaxed play, exploration' },
  { level: 'intermediate', label: 'Intermediate', rating: '1400', shortcut: '2', desc: 'Tactical captures & checks' },
  { level: 'advanced', label: 'Advanced', rating: '1800', shortcut: '3', desc: 'Positional strategy & tactics' },
  { level: 'master', label: 'Master', rating: '2200', shortcut: '4', desc: 'High-depth tactical evaluation' },
];

export function DifficultySelector({
  currentDifficulty,
  onSelectDifficulty,
  disabled = false,
  compact = false,
}: DifficultySelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Engine Difficulty Level"
      className={`flex flex-wrap items-center gap-1.5 p-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl ${
        compact ? '' : 'w-full justify-between'
      }`}
    >
      {!compact && (
        <span className="text-xs text-gray-400 font-semibold px-2 py-1 select-none" id="diff-label">
          Engine Level:
        </span>
      )}
      <div className="flex flex-wrap items-center gap-1 flex-1">
        {DIFFICULTIES.map(({ level, label, rating, shortcut, desc }) => {
          const isSelected = currentDifficulty === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${label} difficulty, rating ${rating}. Shortcut: key ${shortcut}. ${desc}`}
              tabIndex={0}
              disabled={disabled}
              onClick={() => onSelectDifficulty(level)}
              className={`flex-1 min-w-[70px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-1 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                isSelected
                  ? 'bg-[#81b64c] text-white shadow-md shadow-green-950/40 font-bold'
                  : 'bg-[var(--surface-3)] hover:bg-[var(--surface-4)] text-gray-300 hover:text-white border border-transparent'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={`${label} (${rating}) — Shortcut: ${shortcut}`}
            >
              <div className="flex items-center gap-1">
                <span>{label}</span>
                <span className={`text-[10px] ${isSelected ? 'text-green-100' : 'text-gray-400'}`}>
                  {rating}
                </span>
              </div>
              <kbd
                className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                  isSelected ? 'bg-[#5c8336] text-white' : 'bg-[var(--surface-2)] text-gray-400'
                }`}
              >
                {shortcut}
              </kbd>
            </button>
          );
        })}
      </div>
    </div>
  );
}

