"use client";

import { useEffect, useRef } from "react";

export type KeyHandler = (e: KeyboardEvent) => void;

export type KeyAction =
  | KeyHandler
  | {
      onDown?: KeyHandler;
      onUp?: KeyHandler;
    };

export type KeyMap = Record<string, KeyAction>;

export function useHotkeys(keyMap: KeyMap, enabled = true) {
  const keyMapRef = useRef<KeyMap>(keyMap);

  // Writing a ref during render is not safe under concurrent rendering (a
  // render can be thrown away, leaving the ref ahead of the committed tree).
  // Keydown events can only arrive after commit, so syncing here is enough to
  // keep handlers fresh without re-subscribing the listeners on every render.
  useEffect(() => {
    keyMapRef.current = keyMap;
  });

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const key = e.key.toLowerCase();
      const currentMap = keyMapRef.current;

      if (key === "escape") {
        if (isInput) {
          (target as HTMLElement)?.blur();
        }
        const escAction = currentMap.escape;
        if (escAction) {
          e.preventDefault();
          if (typeof escAction === "function") {
            if (!e.repeat) escAction(e);
          } else if (escAction.onDown && !e.repeat) {
            escAction.onDown(e);
          }
          return;
        }
      }

      if (isInput) return;

      const action = currentMap[key] ?? currentMap[e.key];
      if (action) {
        e.preventDefault();
        if (typeof action === "function") {
          if (!e.repeat) action(e);
        } else if (action.onDown && !e.repeat) {
          action.onDown(e);
        }
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (isInput) return;

      const key = e.key.toLowerCase();
      const currentMap = keyMapRef.current;
      const action = currentMap[key] ?? currentMap[e.key];
      if (action && typeof action === "object" && action.onUp) {
        e.preventDefault();
        action.onUp(e);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enabled]);
}

