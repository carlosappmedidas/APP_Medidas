// app/hooks/useElementSize.ts
// ← Paso 10: extraído de GraficosSection.tsx — código idéntico, solo movido de sitio
"use client";

import { useEffect, useRef, useState } from "react";

type ElementSize = { width: number; height: number };

export default function useElementSize(): [React.MutableRefObject<HTMLDivElement | null>, ElementSize] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const nextWidth  = Math.floor(rect.width);
      const nextHeight = Math.floor(rect.height);
      setSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      );
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
