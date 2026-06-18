// src/ui/hooks/useTerminalWidth.ts
//
// Centralised, debounced terminal-width hook.
// Every component that needs the column count should import this
// instead of reading process.stdout.columns directly.
// This prevents Ink from thrashing re-renders on resize events.

import { useState, useEffect, useRef } from "react";
import { useStdout } from "ink";

const DEBOUNCE_MS = 150;

/**
 * Returns the current terminal width, debounced so rapid resize events
 * (like dragging a window edge) only trigger a single re-render.
 *
 * Also caps the value at `maxWidth` (default 100) so horizontal rules
 * and boxes don't overflow.
 */
export function useTerminalWidth(maxWidth = 100): number {
  const { stdout } = useStdout();
  const [width, setWidth] = useState(() =>
    Math.min(stdout?.columns ?? 80, maxWidth)
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const target = stdout ?? process.stdout;
    if (!target || typeof target.on !== "function") return;

    const handleResize = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setWidth(Math.min(target.columns ?? 80, maxWidth));
      }, DEBOUNCE_MS);
    };

    target.on("resize", handleResize);
    return () => {
      target.off("resize", handleResize);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [stdout, maxWidth]);

  return width;
}
