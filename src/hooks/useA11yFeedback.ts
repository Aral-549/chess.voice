"use client";

import { useEffect, useRef } from "react";
import type { CoachStatus } from "./useVoiceChessCoach";
import { playStatusEarcon } from "@/lib/earcon";
import { announce } from "@/lib/announce";

interface A11yFeedbackOptions {
  soundCues: boolean;
  announceCaptions: boolean;
}

export function useA11yFeedback(
  status: CoachStatus,
  caption: string,
  options: A11yFeedbackOptions,
) {
  const prevStatusRef = useRef<CoachStatus>(status);

  useEffect(() => {
    if (prevStatusRef.current !== status) {
      if (options.soundCues) {
        playStatusEarcon(status);
      }
      prevStatusRef.current = status;
    }
  }, [status, options.soundCues]);

  useEffect(() => {
    if (caption && options.announceCaptions) {
      announce(caption, "polite");
    }
  }, [caption, options.announceCaptions]);
}
