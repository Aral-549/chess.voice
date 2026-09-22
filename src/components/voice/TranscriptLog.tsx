"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TranscriptEntry } from "@/hooks/useVoiceChessCoach";

interface TranscriptLogProps {
  entries: TranscriptEntry[];
  onClear?: () => void;
}

export function TranscriptLog({ entries, onClear }: TranscriptLogProps) {
  const scrollRef = useRef<HTMLOListElement>(null);
  const [filter, setFilter] = useState<"all" | "coach" | "you">("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      const lastChild = node.lastElementChild;
      lastChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [entries.length]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (filter === "coach" && entry.speaker !== "coach") return false;
      if (filter === "you" && entry.speaker !== "you") return false;
      if (search && !entry.text.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entries, filter, search]);

  const handleCopyTranscript = () => {
    const fullText = entries
      .map((e) => `[${e.speaker.toUpperCase()}]: ${e.text}`)
      .join("\n\n");
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTranscript = () => {
    const fullText = entries
      .map((e) => `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.speaker.toUpperCase()}: ${e.text}`)
      .join("\n\n");
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `voice-chess-transcript-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="panel flex flex-col w-full border-border/80 shadow-md shrink-0">
      {/* Header with Title & Action Tools */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5 bg-bg-raised">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base sm:text-lg">Conversation</h2>
          <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-bg text-fg-muted">
            {entries.length}
          </span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyTranscript}
            className="px-2 py-1 rounded text-xs text-fg-muted hover:text-accent hover:bg-bg transition-colors"
            title="Copy full transcript"
            aria-label="Copy full transcript"
          >
            {copied ? <span className="text-accent font-mono">Copied!</span> : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleDownloadTranscript}
            className="px-2 py-1 rounded text-xs text-fg-muted hover:text-accent hover:bg-bg transition-colors"
            title="Download transcript as text file"
            aria-label="Download transcript"
          >
            Download
          </button>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="px-2 py-1 rounded text-xs text-fg-muted hover:text-danger hover:bg-bg transition-colors"
              title="Clear conversation log"
              aria-label="Clear conversation"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border/50 bg-bg/40 text-xs">
        <div className="flex items-center gap-1" role="tablist" aria-label="Filter transcript">
          {(["all", "coach", "you"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={filter === tab}
              onClick={() => setFilter(tab)}
              className={cn(
                "px-2.5 py-1 rounded-md capitalize font-medium transition-colors",
                filter === tab
                  ? "bg-accent text-bg font-bold shadow-xs"
                  : "text-fg-muted hover:text-fg hover:bg-bg-raised",
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter text…"
          className="w-28 sm:w-36 px-2 py-1 rounded border border-border bg-bg text-xs outline-none focus:border-accent text-fg"
          aria-label="Search conversation messages"
        />
      </div>

      {/* Message List */}
      <ol ref={scrollRef} className="space-y-3 p-3 sm:p-4">
        {filteredEntries.length === 0 ? (
          <li className="flex items-center justify-center h-full text-xs text-fg-muted italic">
            No matching messages.
          </li>
        ) : (
          filteredEntries.map((entry) => {
            const isYou = entry.speaker === "you";
            const isCoach = entry.speaker === "coach";
            const isSystem = entry.speaker === "system";

            return (
              <li
                key={entry.id}
                className={cn(
                  "flex gap-2.5 text-sm",
                  isYou ? "flex-row-reverse" : "flex-row",
                  isSystem && "justify-center",
                )}
              >
                {/* Avatar */}
                {!isSystem && (
                  <div
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 select-none",
                      isYou ? "bg-accent text-bg font-bold" : "bg-accent-2 text-white font-bold",
                    )}
                    aria-hidden="true"
                  >
                    {isYou ? "👤" : "🎓"}
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-relaxed shadow-xs",
                    isYou && "bg-accent/15 border border-accent/30 text-fg rounded-tr-none",
                    isCoach && "bg-bg-raised border border-border text-fg rounded-tl-none",
                    isSystem && "mx-auto max-w-full text-center text-fg-muted italic text-xs bg-bg/50 px-4 py-1.5 border border-border/40",
                  )}
                >
                  {!isSystem && (
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="font-mono text-[10px] uppercase font-bold tracking-wider opacity-70">
                        {isYou ? "You" : "Voice Coach"}
                      </span>
                      <span className="font-mono text-[10px] text-fg-muted">
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{entry.text}</p>
                </div>
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
