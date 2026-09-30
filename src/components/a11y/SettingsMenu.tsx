"use client";

// ============================================================
// VoiceChessmate — settings dropdown
//
// Everything that used to sit permanently across the header and above the
// board, folded into one menu. The header was a wall of thirty-odd controls
// competing with the game; none of them is needed mid-move.
//
// Keyboard contract, because this is the app's settings surface and the
// primary input here is a keyboard:
//   - the trigger is a real <button> with aria-expanded / aria-haspopup
//   - every control inside is reachable by Tab in reading order
//   - Escape closes and returns focus to the trigger
//   - focus is trapped while open, so Tab cannot wander behind the menu
//   - each group is a labelled radiogroup, so a screen reader announces
//     "Difficulty, radio group, Intermediate, 2 of 4"
//   - every option also keeps its existing single-key shortcut, shown in the
//     row, so the menu is a discovery surface and never the only route
// ============================================================

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { A11ySettings, AppTheme } from "@/hooks/useA11ySettings";
import type { Difficulty } from "@/types";
import type { TimeControlMode } from "@/hooks/useChessClock";

export type PlayMode = "normal" | "blindfold" | "handsfree";

interface SettingsMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  settings: A11ySettings;
  onToggleHighContrast: () => void;
  onToggleSoundCues: () => void;
  onToggleAnnounceCaptions: () => void;
  onCycleFontScale: (dir: 1 | -1) => void;
  onSetTheme?: (theme: AppTheme) => void;

  difficulty?: Difficulty;
  onSelectDifficulty?: (d: Difficulty) => void;

  timeControl?: TimeControlMode;
  onSelectTimeControl?: (mode: TimeControlMode) => void;

  playMode?: PlayMode;
  onSelectPlayMode?: (mode: PlayMode) => void;

  onOpenShortcuts: () => void;
  onOpenIBCAGuide?: () => void;
  onReplayIntro?: () => void;
}

const DIFFICULTIES: { id: Difficulty; label: string; rating: string; key: string }[] = [
  { id: "beginner", label: "Beginner", rating: "800", key: "1" },
  { id: "intermediate", label: "Intermediate", rating: "1400", key: "2" },
  { id: "advanced", label: "Advanced", rating: "1800", key: "3" },
  { id: "master", label: "Master", rating: "2200", key: "4" },
];

const TIME_CONTROLS: { id: TimeControlMode; label: string; hint: string }[] = [
  { id: "casual", label: "Casual", hint: "No clock" },
  { id: "bullet_1_0", label: "Bullet", hint: "1 min" },
  { id: "blitz_3_0", label: "Blitz", hint: "3 min" },
  { id: "blitz_5_0", label: "Blitz", hint: "5 min" },
  { id: "rapid_10_0", label: "Rapid", hint: "10 min" },
];

const MODES: { id: PlayMode; label: string; hint: string }[] = [
  { id: "normal", label: "Normal", hint: "Board visible, hold J to speak" },
  { id: "blindfold", label: "Blindfold", hint: "Board hidden — train your memory" },
  { id: "handsfree", label: "Hands-free", hint: "Always listening, confirms each move" },
];

const THEMES: { id: AppTheme; label: string }[] = [
  { id: "walnut", label: "Walnut" },
  { id: "green", label: "Green" },
  { id: "slate", label: "Slate" },
  { id: "high-contrast", label: "High contrast" },
];

export function SettingsMenu(props: SettingsMenuProps) {
  const { open, onOpenChange } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    onOpenChange(false);
    triggerRef.current?.focus();
  }, [onOpenChange]);

  // Escape closes; Tab is trapped inside. Without the trap, Tab from the last
  // control lands on the page behind an open menu, which is disorienting for
  // anyone who cannot see that the menu is still there.
  useEffect(() => {
    if (!open) return;
    const node = menuRef.current;
    if (!node) return;

    const focusable = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);

    focusable()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (!node.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, close, onOpenChange]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="settings-menu"
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Settings
      </button>

      {open && (
        <div
          ref={menuRef}
          id="settings-menu"
          role="dialog"
          aria-label="Settings"
          aria-modal="false"
          className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,360px)] max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-bg-raised p-4 shadow-2xl"
        >
          <div className="space-y-5">
            <Group label="Difficulty">
              {DIFFICULTIES.map((d) => (
                <Row
                  key={d.id}
                  selected={props.difficulty === d.id}
                  onSelect={() => props.onSelectDifficulty?.(d.id)}
                  label={d.label}
                  hint={`${d.rating} rating`}
                  shortcut={d.key}
                />
              ))}
            </Group>

            <Group label="Time control">
              {TIME_CONTROLS.map((t) => (
                <Row
                  key={t.id}
                  selected={props.timeControl === t.id}
                  onSelect={() => props.onSelectTimeControl?.(t.id)}
                  label={t.label}
                  hint={t.hint}
                />
              ))}
            </Group>

            <Group label="Play mode">
              {MODES.map((m) => (
                <Row
                  key={m.id}
                  selected={props.playMode === m.id}
                  onSelect={() => props.onSelectPlayMode?.(m.id)}
                  label={m.label}
                  hint={m.hint}
                />
              ))}
            </Group>

            {props.onSetTheme && (
              <Group label="Board theme">
                {THEMES.map((t) => (
                  <Row
                    key={t.id}
                    selected={props.settings.theme === t.id}
                    onSelect={() => props.onSetTheme?.(t.id)}
                    label={t.label}
                  />
                ))}
              </Group>
            )}

            <Group label="Accessibility" radio={false}>
              <Toggle
                label="High contrast"
                shortcut="C"
                checked={props.settings.highContrast}
                onChange={props.onToggleHighContrast}
              />
              <Toggle
                label="Sound cues"
                checked={props.settings.soundCues}
                onChange={props.onToggleSoundCues}
              />
              <Toggle
                label="Screen reader captions"
                checked={props.settings.announceCaptions}
                onChange={props.onToggleAnnounceCaptions}
              />

              <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                <span className="text-sm text-fg">Text size</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => props.onCycleFontScale(-1)}
                    aria-label="Decrease text size"
                    className="h-7 w-7 rounded border border-border text-sm text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2"
                  >
                    A-
                  </button>
                  <span className="w-12 text-center font-mono text-xs text-fg-muted tabular-nums">
                    {Math.round(props.settings.fontScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => props.onCycleFontScale(1)}
                    aria-label="Increase text size"
                    className="h-7 w-7 rounded border border-border text-sm text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2"
                  >
                    A+
                  </button>
                </div>
              </div>
            </Group>

            <Group label="Help" radio={false}>
              <MenuButton label="Keyboard shortcuts" shortcut="?" onClick={props.onOpenShortcuts} />
              {props.onOpenIBCAGuide && (
                <MenuButton label="IBCA phonetic guide" shortcut="I" onClick={props.onOpenIBCAGuide} />
              )}
              {props.onReplayIntro && (
                <MenuButton label="Show the intro again" onClick={props.onReplayIntro} />
              )}
            </Group>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- internals */

function Group({
  label,
  children,
  radio = true,
}: {
  label: string;
  children: React.ReactNode;
  radio?: boolean;
}) {
  return (
    <section aria-label={label}>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
        {label}
      </h3>
      <div className="space-y-0.5" role={radio ? "radiogroup" : undefined} aria-label={label}>
        {children}
      </div>
    </section>
  );
}

/** One selectable option. A full-width row rather than a pill, so the label,
 *  the hint and the shortcut all line up in a column down the menu. */
function Row({
  selected,
  onSelect,
  label,
  hint,
  shortcut,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint?: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1",
        selected ? "bg-accent/12 text-fg" : "text-fg-muted hover:bg-bg-raised hover:text-fg",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          selected ? "bg-accent" : "bg-transparent",
        )}
      />
      <span className="flex-1 text-sm">{label}</span>
      {hint && <span className="shrink-0 text-[11px] text-fg-muted">{hint}</span>}
      {shortcut && (
        <kbd className="shrink-0 rounded border border-border px-1 font-mono text-[10px] text-fg-muted">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  shortcut,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-4 w-7 shrink-0 items-center rounded-full border px-0.5 transition-colors",
          checked ? "border-accent bg-accent/30" : "border-border bg-bg",
        )}
      >
        <span
          className={cn(
            "h-3 w-3 rounded-full transition-transform",
            checked ? "translate-x-3 bg-accent" : "translate-x-0 bg-fg-muted/50",
          )}
        />
      </span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="shrink-0 rounded border border-border px-1 font-mono text-[10px] text-fg-muted">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

function MenuButton({
  label,
  onClick,
  shortcut,
}: {
  label: string;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
    >
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="shrink-0 rounded border border-border px-1 font-mono text-[10px] text-fg-muted">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
