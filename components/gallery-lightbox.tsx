'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { GalleryEntry } from '@/lib/gallery';
import { PoolTable } from './pool-table';

export type LightboxSelection = { entry: GalleryEntry };

export function GalleryLightbox({ selection, onClose }: { selection: LightboxSelection; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const closing = useRef(false);
  const mounted = useRef(true);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;

  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    animation.current = stage.current!.animate([
      { opacity: 0, transform: reduced ? 'none' : 'scale(.97)' },
      { opacity: 1, transform: 'none' },
    ], { duration: reduced ? 100 : 240, easing: 'cubic-bezier(.23, 1, .32, 1)', fill: 'both' });
    return () => { mounted.current = false; animation.current?.cancel(); };
  }, []);

  const close = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    const current = getComputedStyle(stage.current!);
    const from = { opacity: current.opacity, transform: current.transform };
    animation.current?.cancel();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    animation.current = stage.current!.animate([from, { opacity: 0, transform: reduced ? 'none' : 'scale(.97)' }], {
      duration: reduced ? 100 : 180, easing: 'ease-out', fill: 'both',
    });
    await animation.current.finished.catch(() => undefined);
    if (mounted.current) { dialog.current?.close(); closeCallback.current(); }
  }, []);

  return <dialog ref={dialog} className="gallery-lightbox" aria-label={`Play the message by ${selection.entry.name}`}
    onCancel={(event) => { event.preventDefault(); void close(); }}>
    <div ref={stage} className="playback-stage"><PoolTable entry={selection.entry} /></div>
  </dialog>;
}
