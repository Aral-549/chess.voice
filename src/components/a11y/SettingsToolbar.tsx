"use client";

import type { A11ySettings, AppTheme } from "@/hooks/useA11ySettings";
import type { Difficulty } from "@/types";
import { cn } from "@/lib/utils";

interface SettingsToolbarProps {
  settings: A11ySettings;
  onToggleHighContrast: () => void;
  onToggleSoundCues: () => void;
  onToggleAnnounceCaptions: () => void;
  onCycleFontScale: (dir: 1 | -1) => void;
  onOpenShortcuts: () => void;
  onOpenIBCAGuide?: () => void;
  difficulty?: Difficulty;
  onSelectDifficulty?: (diff: Difficulty) => void;
  onSetTheme?: (theme: AppTheme) => void;
  playMode?: "normal" | "blindfold" | "handsfree";
  onSelectPlayMode?: (mode: "normal" | "blindfold" | "handsfree") => void;
}

export function SettingsToolbar({
  settings,
  onToggleHighContrast,
  onToggleSoundCues,
  onToggleAnnounceCaptions,
  onCycleFontScale,
  onOpenShortcuts,
  onOpenIBCAGuide,
  difficulty,
  onSelectDifficulty,
  onSetTheme,
  playMode = "normal",
  onSelectPlayMode,
}: SettingsToolbarProps) {
  const themes: { id: AppTheme; label: string }[] = [
    { id: "walnut", label: "Walnut" },
    { id: "green", label: "Green" },
    { id: "slate", label: "Slate" },
    { id: "high-contrast", label: "High Contrast" },
  ];

  const modes: { id: "normal" | "blindfold" | "handsfree"; label: string; hint: string }[] = [
    { id: "normal", label: "Normal", hint: "Board visible, hold J to speak" },
    { id: "blindfold", label: "Blindfold", hint: "Board hidden — train holding the position in your head" },
    { id: "handsfree", label: "Hands-free", hint: "Listens continuously and confirms every move" },
  ];

  const difficulties: { id: Difficulty; label: string; rating: string; key: string }[] = [
    { id: "beginner", label: "Beginner", rating: "800", key: "1" },
    { id: "intermediate", label: "Intermediate", rating: "1400", key: "2" },
    { id: "advanced", label: "Advanced", rating: "1800", key: "3" },
    { id: "master", label: "Master", rating: "2200", key: "4" },
  ];

  return (
    <div className="flex flex-col gap-2.5 w-full pt-1">
      {/* Top row: Difficulty & Theme Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
        {/* Difficulty Radios */}
        {onSelectDifficulty && difficulty && (
          <div
            role="radiogroup"
            aria-label="Coach Difficulty"
            className="flex items-center gap-1 p-1 rounded-lg border border-border bg-bg-raised"
          >
            <span className="font-mono text-[11px] text-fg-muted px-1.5 uppercase tracking-wider font-semibold">
              Level:
            </span>
            {difficulties.map(({ id, label, rating, key }) => {
              const active = difficulty === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSelectDifficulty(id)}
                  title={`${label} (${rating}) — Shortcut: ${key}`}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-semibold transition-all cursor-pointer",
                    active
                      ? "bg-accent text-bg shadow-xs"
                      : "text-fg-muted hover:text-fg hover:bg-bg",
                  )}
                >
                  {label}
                  <span className="ml-1 opacity-70 font-mono text-[10px]">({key})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Play mode — the clickable path to blindfold and hands-free, so they
            are not voice-only. Every feature needs a keyboard path. */}
        {onSelectPlayMode && (
          <div
            className="flex items-center gap-1 p-1 rounded-lg border border-border bg-bg-raised"
            role="radiogroup"
            aria-label="Play mode"
          >
            <span className="font-mono text-[11px] text-fg-muted px-1.5 uppercase tracking-wider font-semibold">
              Mode:
            </span>
            {modes.map(({ id, label, hint }) => {
              const active = playMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSelectPlayMode(id)}
                  title={hint}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-semibold transition-all cursor-pointer",
                    active
                      ? "bg-accent text-bg shadow-xs"
                      : "text-fg-muted hover:text-fg hover:bg-bg",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Theme Picker */}
        {onSetTheme && (
          <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-bg-raised">
            <span className="font-mono text-[11px] text-fg-muted px-1.5 uppercase tracking-wider font-semibold">
              Theme:
            </span>
            {themes.map(({ id, label }) => {
              const active = settings.theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSetTheme(id)}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer",
                    active
                      ? "bg-accent text-bg font-bold shadow-xs"
                      : "text-fg-muted hover:text-fg hover:bg-bg",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom row: Accessibility & Audio Toggles */}
      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        <ToggleButton
          pressed={settings.highContrast}
          onClick={onToggleHighContrast}
          label="High contrast"
          shortcut="C"
        />

        <ToggleButton
          pressed={settings.soundCues}
          onClick={onToggleSoundCues}
          label="Sound cues"
        />

        <ToggleButton
          pressed={settings.announceCaptions}
          onClick={onToggleAnnounceCaptions}
          label="Screen reader captions"
        />

        {/* Text Scaling Controls */}
        <div className="flex items-center gap-1 rounded-md border border-border px-1 py-0.5 bg-bg-raised">
          <button
            type="button"
            onClick={() => onCycleFontScale(-1)}
            aria-label="Decrease text size"
            className="h-7 w-7 rounded font-bold hover:bg-bg text-fg cursor-pointer"
          >
            A-
          </button>
          <span className="text-[11px] font-mono text-fg-muted px-1">
            {Math.round(settings.fontScale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onCycleFontScale(1)}
            aria-label="Increase text size"
            className="h-7 w-7 rounded font-bold hover:bg-bg text-fg cursor-pointer"
          >
            A+
          </button>
        </div>

        {/* IBCA Guide Button */}
        {onOpenIBCAGuide && (
          <button
            type="button"
            onClick={onOpenIBCAGuide}
            className="rounded-md border border-border bg-bg-raised px-3 py-1.5 font-medium hover:border-accent hover:text-accent transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>📜</span> IBCA Guide <span className="font-mono text-[11px]">(I)</span>
          </button>
        )}

        {/* Shortcuts Button */}
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="rounded-md border border-border bg-bg-raised px-3 py-1.5 font-medium hover:border-accent hover:text-accent transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span>⌨️</span> Shortcuts <span className="font-mono text-[11px]">(?)</span>
        </button>
      </div>
    </div>
  );
}

function ToggleButton({
  pressed,
  onClick,
  label,
  shortcut,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`rounded-md border px-3 py-1.5 font-medium transition-colors cursor-pointer text-xs ${
        pressed
          ? "border-accent bg-accent text-bg shadow-xs"
          : "border-border bg-bg-raised text-fg-muted hover:border-accent hover:text-accent"
      }`}
    >
      {label}
      {shortcut && <span className="ml-1.5 font-mono opacity-70">({shortcut})</span>}
    </button>
  );
}
