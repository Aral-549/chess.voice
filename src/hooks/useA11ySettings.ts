"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "voice-chess-a11y-settings-v1";

export type AppTheme = "walnut" | "green" | "slate" | "high-contrast";
export type BoardTheme = "walnut" | "green" | "slate" | "monochrome";

export type A11ySettings = {
  highContrast: boolean;
  theme: AppTheme;
  boardTheme: BoardTheme;
  fontScale: number; // 1 | 1.15 | 1.3 | 1.5
  boardVisible: boolean;
  soundCues: boolean;
  /**
   * Off by default: the coach's synthesized voice is the primary audio
   * channel, so captions/transcript entries are plain (non-live) text —
   * turning this on pipes them into an aria-live region too, for players
   * who'd rather have their own screen reader voice everything instead of,
   * or in addition to, the app's TTS. Never fight a user's assistive tech.
   */
  announceCaptions: boolean;
  showIBCACoordinates: boolean;
  showEvaluationBar: boolean;
};

const DEFAULTS: A11ySettings = {
  highContrast: false,
  theme: "walnut",
  boardTheme: "walnut",
  fontScale: 1,
  boardVisible: true,
  soundCues: true,
  announceCaptions: false,
  showIBCACoordinates: true,
  showEvaluationBar: true,
};

function load(): A11ySettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

/** Persisted accessibility preferences — real settings a returning user shouldn't have to redo every visit. */
export function useA11ySettings() {
  const [settings, setSettings] = useState<A11ySettings>(DEFAULTS);

  // Load from localStorage only after mount — deliberately a second render
  // pass, not a lazy useState initializer: reading localStorage during the
  // first (server-matching) render would cause a hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(load());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // best-effort only — private browsing / storage disabled is fine
    }
  }, [settings]);

  useEffect(() => {
    document.documentElement.dataset.contrast = settings.highContrast ? "high" : "normal";
    document.documentElement.dataset.theme = settings.highContrast ? "high-contrast" : settings.theme;
    document.documentElement.style.fontSize = `${settings.fontScale * 100}%`;
  }, [settings.highContrast, settings.theme, settings.fontScale]);

  const toggleHighContrast = useCallback(() => {
    setSettings((s) => ({ ...s, highContrast: !s.highContrast }));
  }, []);

  const setTheme = useCallback((theme: AppTheme) => {
    setSettings((s) => ({ ...s, theme, highContrast: theme === "high-contrast" }));
  }, []);

  const setBoardTheme = useCallback((boardTheme: BoardTheme) => {
    setSettings((s) => ({ ...s, boardTheme }));
  }, []);

  const toggleBoardVisible = useCallback(() => {
    setSettings((s) => ({ ...s, boardVisible: !s.boardVisible }));
  }, []);

  const toggleSoundCues = useCallback(() => {
    setSettings((s) => ({ ...s, soundCues: !s.soundCues }));
  }, []);

  const toggleAnnounceCaptions = useCallback(() => {
    setSettings((s) => ({ ...s, announceCaptions: !s.announceCaptions }));
  }, []);

  const toggleIBCACoordinates = useCallback(() => {
    setSettings((s) => ({ ...s, showIBCACoordinates: !s.showIBCACoordinates }));
  }, []);

  const toggleEvaluationBar = useCallback(() => {
    setSettings((s) => ({ ...s, showEvaluationBar: !s.showEvaluationBar }));
  }, []);

  const cycleFontScale = useCallback((direction: 1 | -1) => {
    const steps = [1, 1.15, 1.3, 1.5];
    setSettings((s) => {
      const idx = steps.indexOf(s.fontScale);
      const nextIdx = Math.min(steps.length - 1, Math.max(0, (idx === -1 ? 0 : idx) + direction));
      return { ...s, fontScale: steps[nextIdx] };
    });
  }, []);

  return {
    settings,
    toggleHighContrast,
    setTheme,
    setBoardTheme,
    toggleBoardVisible,
    toggleSoundCues,
    toggleAnnounceCaptions,
    toggleIBCACoordinates,
    toggleEvaluationBar,
    cycleFontScale,
  };
}

