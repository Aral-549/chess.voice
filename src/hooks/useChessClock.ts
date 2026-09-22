"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { announce } from "@/lib/announce";

export type TimeControlMode =
  | "casual"
  | "bullet_1_0"
  | "blitz_3_0"
  | "blitz_3_2"
  | "blitz_5_0"
  | "rapid_10_0"
  | "custom";

export interface TimeControlConfig {
  mode: TimeControlMode;
  label: string;
  initialSeconds: number;
  increment: number;
}

export const TIME_CONTROLS: Record<TimeControlMode, TimeControlConfig> = {
  casual: { mode: "casual", label: "Casual (No Clock)", initialSeconds: 0, increment: 0 },
  bullet_1_0: { mode: "bullet_1_0", label: "Bullet 1m", initialSeconds: 60, increment: 0 },
  blitz_3_0: { mode: "blitz_3_0", label: "Blitz 3m", initialSeconds: 180, increment: 0 },
  blitz_3_2: { mode: "blitz_3_2", label: "Blitz 3|2", initialSeconds: 180, increment: 2 },
  blitz_5_0: { mode: "blitz_5_0", label: "Blitz 5m", initialSeconds: 300, increment: 0 },
  rapid_10_0: { mode: "rapid_10_0", label: "Rapid 10m", initialSeconds: 600, increment: 0 },
  custom: { mode: "custom", label: "Custom", initialSeconds: 300, increment: 0 },
};

export function formatClock(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function useChessClock(initialMode: TimeControlMode = "blitz_5_0") {
  const [mode, setMode] = useState<TimeControlMode>(initialMode);
  const [initialSeconds, setInitialSeconds] = useState<number>(() => TIME_CONTROLS[initialMode].initialSeconds);
  const [increment, setIncrement] = useState<number>(() => TIME_CONTROLS[initialMode].increment);

  const [whiteSeconds, setWhiteSeconds] = useState<number>(() => TIME_CONTROLS[initialMode].initialSeconds);
  const [blackSeconds, setBlackSeconds] = useState<number>(() => TIME_CONTROLS[initialMode].initialSeconds);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeColor, setActiveColor] = useState<"w" | "b" | null>(null);
  const [flagFell, setFlagFell] = useState<"w" | "b" | null>(null);

  const lowTimeWarningGivenRef = useRef<{ w: boolean; b: boolean }>({ w: false, b: false });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ticking effect: 1-second interval when running
  useEffect(() => {
    if (!isRunning || mode === "casual" || !activeColor || flagFell) return;

    timerRef.current = setInterval(() => {
      if (activeColor === "w") {
        setWhiteSeconds((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsRunning(false);
            setFlagFell("w");
            announce("Time out! White's flag fell. Black wins on time.");
            return 0;
          }
          if (prev === 30 && !lowTimeWarningGivenRef.current.w) {
            lowTimeWarningGivenRef.current.w = true;
            announce("30 seconds remaining for White.");
          }
          if (prev === 10) {
            announce("10 seconds remaining for White.");
          }
          return prev - 1;
        });
      } else {
        setBlackSeconds((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsRunning(false);
            setFlagFell("b");
            announce("Time out! Black's flag fell. White wins on time.");
            return 0;
          }
          if (prev === 30 && !lowTimeWarningGivenRef.current.b) {
            lowTimeWarningGivenRef.current.b = true;
            announce("30 seconds remaining for Black.");
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, mode, activeColor, flagFell]);

  const setTimeControl = useCallback((newMode: TimeControlMode, customMinutes?: number, customInc?: number) => {
    setMode(newMode);
    let initSec = TIME_CONTROLS[newMode]?.initialSeconds ?? 300;
    let inc = TIME_CONTROLS[newMode]?.increment ?? 0;

    if (newMode === "custom" && customMinutes !== undefined) {
      initSec = Math.max(1, Math.round(customMinutes * 60));
      inc = customInc ?? 0;
    }

    setInitialSeconds(initSec);
    setIncrement(inc);
    setWhiteSeconds(initSec);
    setBlackSeconds(initSec);
    setIsRunning(false);
    setActiveColor(null);
    setFlagFell(null);
    lowTimeWarningGivenRef.current = { w: false, b: false };

    if (newMode === "casual") {
      announce("Switched to casual untimed mode. Clock disabled.");
    } else {
      announce(`Timer set to ${Math.round(initSec / 60)} minutes${inc > 0 ? ` with ${inc} second increment` : ""}.`);
    }
  }, []);

  const adjustTime = useCallback((secondsDelta: number, targetColor: "w" | "b" = "w") => {
    if (targetColor === "w") {
      setWhiteSeconds((prev) => Math.max(1, prev + secondsDelta));
    } else {
      setBlackSeconds((prev) => Math.max(1, prev + secondsDelta));
    }
    announce(`Adjusted ${targetColor === "w" ? "your" : "opponent's"} time by ${secondsDelta} seconds.`);
  }, []);

  const switchTurn = useCallback(
    (nextTurn: "w" | "b") => {
      if (mode === "casual" || flagFell) return;

      // Add increment to the player who just finished their turn
      if (nextTurn === "b") {
        // White just moved -> add increment to White
        if (increment > 0) {
          setWhiteSeconds((prev) => prev + increment);
        }
      } else {
        // Black just moved -> add increment to Black
        if (increment > 0) {
          setBlackSeconds((prev) => prev + increment);
        }
      }

      setActiveColor(nextTurn);
      setIsRunning(true);
    },
    [mode, increment, flagFell],
  );

  const pauseClock = useCallback(() => {
    setIsRunning(false);
    announce("Chess clock paused.");
  }, []);

  const resumeClock = useCallback(() => {
    if (mode === "casual" || flagFell) return;
    setIsRunning(true);
    announce("Chess clock resumed.");
  }, [mode, flagFell]);

  const resetClock = useCallback(() => {
    setWhiteSeconds(initialSeconds);
    setBlackSeconds(initialSeconds);
    setIsRunning(false);
    setActiveColor(null);
    setFlagFell(null);
    lowTimeWarningGivenRef.current = { w: false, b: false };
    announce("Chess clock reset.");
  }, [initialSeconds]);

  return {
    mode,
    initialSeconds,
    increment,
    whiteSeconds,
    blackSeconds,
    whiteFormatted: formatClock(whiteSeconds),
    blackFormatted: formatClock(blackSeconds),
    isRunning,
    activeColor,
    flagFell,
    isLowTimeWhite: mode !== "casual" && whiteSeconds > 0 && whiteSeconds <= 30,
    isLowTimeBlack: mode !== "casual" && blackSeconds > 0 && blackSeconds <= 30,
    isUrgentWhite: mode !== "casual" && whiteSeconds > 0 && whiteSeconds <= 10,
    isUrgentBlack: mode !== "casual" && blackSeconds > 0 && blackSeconds <= 10,
    setTimeControl,
    adjustTime,
    switchTurn,
    pauseClock,
    resumeClock,
    resetClock,
  };
}
