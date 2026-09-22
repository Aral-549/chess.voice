"use client";

interface QuickCommandChipsProps {
  onSelectCommand: (command: string) => void;
  disabled?: boolean;
}

const COMMAND_CHIPS = [
  { label: "Eva 4", command: "pawn to e4", icon: "♟️" },
  { label: "Knight Felix 3", command: "knight to f3", icon: "♞" },
  { label: "Threats?", command: "what are my threats", icon: "🛡️" },
  { label: "Scan Board", command: "scan board", icon: "🧭" },
  { label: "Get Hint", command: "get hint", icon: "💡" },
  { label: "Take Back", command: "undo", icon: "↩️" },
];

/**
 * Interactive voice suggestion pills.
 * Allows sighted evaluators, screen reader users, and testers to quickly try
 * out typical moves and queries with one click or keyboard activation.
 */
export function QuickCommandChips({ onSelectCommand, disabled = false }: QuickCommandChipsProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs text-fg-muted uppercase tracking-wider flex items-center gap-1.5">
          <span>💬</span> Quick Voice Prompts
        </span>
        <span className="text-[11px] text-fg-muted">Click or speak aloud</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {COMMAND_CHIPS.map(({ label, command, icon }) => (
          <button
            key={command}
            type="button"
            disabled={disabled}
            onClick={() => onSelectCommand(command)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-bg-raised text-xs font-medium text-fg-muted hover:border-accent hover:text-accent hover:bg-bg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <span aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
