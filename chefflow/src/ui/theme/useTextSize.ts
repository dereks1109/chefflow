import { useCallback, useEffect, useState } from 'react';

// Three-step text-size preference. Every Tailwind font-size class in
// tailwind.config.ts is defined in rem, so scaling the html element's
// root font-size proportionally scales every screen in the app —
// single-knob typography.

type TextSize = 'small' | 'medium' | 'large';

const STORAGE_KEY = 'chefflow-text-size';
const SIZE_TO_PX: Record<TextSize, number> = {
  small: 14,
  medium: 16,
  large: 18,
};

function applyTextSize(size: TextSize) {
  document.documentElement.style.fontSize = `${SIZE_TO_PX[size]}px`;
}

function getInitialTextSize(): TextSize {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'small' || stored === 'medium' || stored === 'large') return stored;
  } catch {
    // localStorage unavailable (e.g., private browsing edge case)
  }
  return 'medium';
}

// Apply text size immediately before first render to avoid a flash
// of the wrong size on cold load.
applyTextSize(getInitialTextSize());

export function useTextSize() {
  const [textSize, setTextSizeState] = useState<TextSize>(getInitialTextSize);

  useEffect(() => {
    applyTextSize(textSize);
    try {
      localStorage.setItem(STORAGE_KEY, textSize);
    } catch {
      // ignore
    }
  }, [textSize]);

  const setTextSize = useCallback((next: TextSize) => {
    setTextSizeState(next);
  }, []);

  return { textSize, setTextSize };
}
