'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import type { GalleryEntry } from '@/lib/gallery';
import { renderMessage } from '@/lib/render-message';
import { BallLetters } from './ball-letters';

const formats = [
  { label: '1:1', width: 3200, height: 3200, ratio: 1 },
  { label: '3:4', width: 2400, height: 3200, ratio: .75 },
  { label: '9:16', width: 1800, height: 3200, ratio: .5625 },
] as const;

export function DownloadDialog({ entry, onClose, onError }: { entry: GalleryEntry; onClose: () => void; onError: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(false);
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function download(format: typeof formats[number]) {
    if (active.current) return;
    active.current = true;
    dialog.current?.close();
    onClose();
    const canvas = document.createElement('canvas');
    try {
      // Let the closed overlay paint before starting the high-resolution render.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await document.fonts.ready;
      renderMessage(canvas, entry.message, format.width, format.height, entry.name);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', .98));
      if (!blob || blob.type !== 'image/webp') throw new Error('This browser could not create the download. Please try again.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `imsend.ing-${entry.name.replace(/[^\p{L}\p{N}._-]/gu, '-')}-${format.label.replace(':', 'x')}.webp`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      onError('Could not create the download. Please try again.');
    } finally {
      canvas.width = canvas.height = 1;
      active.current = false;
    }
  }

  return <dialog ref={dialog} className="save-dialog download-dialog" aria-label="Choose a download format" onCancel={onClose}>
    <button className="pool-reset ball-button table-gallery" type="button" aria-label="Back to gallery" onClick={onClose}><BallLetters text="BACK" /></button>
    <div className="download-chooser">
      <div className="download-options">
        {formats.map((format, index) => <button key={format.label} className="download-format" style={{ '--format-rotation': `${[-2, 1, -1][index]}deg` } as CSSProperties} type="button" aria-label={`Download ${format.label}`} onClick={() => void download(format)}>
          <span className="format-shape" style={{ '--format-ratio': format.ratio } as CSSProperties} aria-hidden="true" />
          <span>{format.label}</span>
        </button>)}
      </div>
    </div>
  </dialog>;
}
