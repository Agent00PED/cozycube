import { useEffect, useRef, useState } from "react";

/** Rolls a displayed integer toward `value` over `ms`, so a balance change is seen counting. */
export function useAnimatedNumber(value: number, ms = 650): number {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef(0);
  useEffect(() => {
    const from = shown;
    fromRef.current = from;
    startRef.current = performance.now();
    if (from === value) return;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / ms);
      const ease = 1 - Math.pow(1 - t, 3);
      const next = Math.round(fromRef.current + (value - fromRef.current) * ease);
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms]);
  return shown;
}
