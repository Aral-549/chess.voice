"use client";

// ============================================================
// chess.voice — resizable divider between the conversation and the board
//
// A drag handle would be the obvious thing, but a drag handle alone is a
// mouse-only control, and this project's rule is that every feature has a
// keyboard path. So this is the ARIA separator pattern: focusable, with arrow
// keys, Home/End, and a spoken value.
//
// Nothing depends on it — it only changes how wide the conversation is — but
// "sighted users get a nicer layout and keyboard users get nothing" is exactly
// the trade this codebase exists to refuse.
// ============================================================

import { useCallback, useEffect, useRef } from "react";

interface PanelSplitterProps {
  /** Current width of the left column, in pixels. */
  width: number;
  onWidthChange: (width: number) => void;
  min?: number;
  max?: number;
  /** Pixels moved per arrow press. Shift multiplies by 4. */
  step?: number;
}

export function PanelSplitter({
  width,
  onWidthChange,
  min = 320,
  max = 760,
  step = 24,
}: PanelSplitterProps) {
  const draggingRef = useRef(false);
  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  });

  const clamp = useCallback(
    (next: number) => Math.min(max, Math.max(min, Math.round(next))),
    [min, max],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const multiplier = e.shiftKey ? 4 : 1;
      let next: number | null = null;

      if (e.key === "ArrowLeft") next = widthRef.current - step * multiplier;
      else if (e.key === "ArrowRight") next = widthRef.current + step * multiplier;
      else if (e.key === "Home") next = min;
      else if (e.key === "End") next = max;
      else if (e.key === "Enter" || e.key === " ") next = widthRef.current === min ? max : min;

      if (next === null) return;
      e.preventDefault();
      // Stop the game hotkeys seeing these — arrows and Home/End are not bound
      // today, but a splitter that silently fires a game action later would be
      // a nasty surprise.
      e.stopPropagation();
      onWidthChange(clamp(next));
    },
    [clamp, min, max, step, onWidthChange],
  );

  // Pointer drag. Listeners go on the document so the drag survives the cursor
  // leaving the 6px handle, which it immediately does.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      onWidthChange(clamp(e.clientX));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [clamp, onWidthChange]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Conversation width"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`Conversation ${width} pixels wide`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onWidthChange(clamp(440))}
      onMouseDown={(e) => {
        e.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      title="Drag, or focus and use arrow keys, to resize the conversation. Double-click to reset."
      className="group hidden lg:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center border-x border-transparent transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
    >
      {/* The grip is decorative; the separator role carries the meaning. */}
      <span
        aria-hidden="true"
        className="h-10 w-0.5 rounded-full bg-border transition-colors group-hover:bg-accent/60 group-focus-visible:bg-accent"
      />
    </div>
  );
}
