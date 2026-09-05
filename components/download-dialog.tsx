'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GalleryEntry } from '@/lib/gallery';
import { renderMessage } from '@/lib/render-message';
import { BallLetters } from './ball-letters';

const formats = [
  { label: '1:1', width: 3200, height: 3200, ratio: 1 },
  { label: '3:4', width: 2400, height: 3200, ratio: .75 },
  { label: '9:16', width: 1800, height: 3200, ratio: .5625 },
] as const;

function appleTouch() {
  return /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && window.matchMedia('(pointer: coarse)').matches);
}

function exportSize(width: number, height: number) {
  const max = appleTouch() ? 2048 : Math.max(width, height);
  const scale = Math.min(1, max / width, max / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function canShare(file: File) {
  try { return !!navigator.canShare?.({ files: [file] }); }
  catch { return false; }
}

async function deliver(file: File) {
  if (appleTouch() && canShare(file)) {
    try {
      await navigator.share({ files: [file] });
      return 'shared' as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared' as const;
    }
  }
  if (appleTouch()) return 'hold' as const;
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'saved' as const;
}

export function DownloadDialog({ entry, onClose, onError }: { entry: GalleryEntry; onClose: () => void; onError: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [holdUrl, setHoldUrl] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => () => { if (holdUrl) URL.revokeObjectURL(holdUrl); }, [holdUrl]);

  async function download(format: typeof formats[number]) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    const canvas = document.createElement('canvas');
    try {
      await document.fonts.ready;
      const size = exportSize(format.width, format.height);
      renderMessage(canvas, entry.message, size.width, size.height, entry.name);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob?.size) throw new Error('encode');
      const file = new File([blob], `imsend.ing-${entry.name.replace(/[^\p{L}\p{N}._-]/gu, '-')}-${format.label.replace(':', 'x')}.png`, { type: blob.type });
      const result = await deliver(file);
      if (result === 'hold') {
        setHoldUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(file);
        });
      } else {
        dialog.current?.close();
        onClose();
      }
    } catch {
      onError('Could not create the download. Please try again.');
    } finally {
      canvas.width = canvas.height = 1;
      active.current = false;
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="save-dialog download-dialog" aria-label={holdUrl ? 'Hold to save the image' : 'Choose a download format'} aria-busy={busy} onCancel={onClose}>
    <button className="pool-reset ball-button table-gallery" type="button" aria-label="Back to gallery" onClick={onClose}><BallLetters text="BACK" /></button>
    {holdUrl ? <div className="download-hold">
      <img src={holdUrl} alt={`Message by ${entry.name}`} />
      <p>hold the image to save it</p>
    </div> : <div className="download-chooser">
      <div className="download-options">
        {formats.map((format, index) => <button key={format.label} className="download-format" style={{ '--format-rotation': `${[-2, 1, -1][index]}deg` } as CSSProperties} type="button" aria-label={`Download ${format.label}`} disabled={busy} onClick={() => void download(format)}>
          <span className="format-shape" style={{ '--format-ratio': format.ratio } as CSSProperties} aria-hidden="true" />
          <span>{format.label}</span>
        </button>)}
      </div>
    </div>}
  </dialog>;
}
