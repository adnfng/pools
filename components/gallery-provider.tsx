'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { GalleryEntry } from '@/lib/gallery';

type Submission = { id: string; name: string; message: string; status: 'uploading' | 'failed'; error?: string };
type GalleryContext = {
  pending: Submission | null;
  published: GalleryEntry[];
  submit: (message: string, name: string) => void;
  retry: () => void;
  dismiss: () => void;
};
const Context = createContext<GalleryContext | null>(null);

export function GalleryProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Submission | null>(null);
  const [published, setPublished] = useState<GalleryEntry[]>([]);
  const active = useRef<Submission | null>(null);
  const upload = useCallback(async (submission: Submission) => {
    if (active.current?.status === 'uploading') return;
    const next: Submission = { ...submission, status: 'uploading', error: undefined };
    active.current = next;
    setPending(next);
    try {
      const response = await fetch('/api/gallery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: next.id, name: next.name, message: next.message }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send your message. Try again.');
      setPublished((items) => [data.entry, ...items.filter((item) => item.id !== data.entry.id)]);
      active.current = null;
      setPending(null);
    } catch (error) {
      const failed: Submission = { ...next, status: 'failed', error: error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'That took too long. Try sending again.' };
      active.current = failed;
      setPending(failed);
    }
  }, []);

  return <Context.Provider value={{
    pending, published,
    submit: (message, name) => { void upload({ id: crypto.randomUUID(), message, name, status: 'uploading' }); },
    retry: () => { if (active.current?.status === 'failed') void upload(active.current); },
    dismiss: () => { if (active.current?.status !== 'uploading') { active.current = null; setPending(null); } },
  }}>{children}</Context.Provider>;
}

export function useGallery() {
  const value = useContext(Context);
  if (!value) throw new Error('GalleryProvider is missing');
  return value;
}
