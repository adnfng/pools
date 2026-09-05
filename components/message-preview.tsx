'use client';

import { useEffect, useRef, useState } from 'react';
import { renderMessage } from '@/lib/render-message';


export function MessagePreview({ message, onReady }: { message: string; onReady?: (canvas: HTMLCanvasElement) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    setReady(false);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void document.fonts.ready.then(() => {
        if (disposed || !canvas.current) return;
        renderMessage(canvas.current, message);
        setReady(true);
        readyCallback.current?.(canvas.current);
      });
    }, { rootMargin: '250px' });
    observer.observe(canvas.current!);
    return () => { disposed = true; observer.disconnect(); };
  }, [message]);
  return <canvas ref={canvas} className={`message-preview${ready ? ' is-ready' : ' skeleton'}`} aria-hidden="true" />;
}
