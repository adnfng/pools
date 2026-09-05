'use client';

import Link from 'next/link';
import { Download } from 'lucide-react';
import { DownloadDialog } from '@/components/download-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BallLetters } from '@/components/ball-letters';
import { ColoredName } from '@/components/colored-name';
import { MessagePreview } from '@/components/message-preview';
import { GalleryLightbox, type LightboxSelection } from '@/components/gallery-lightbox';
import { useGallery } from '@/components/gallery-provider';
import type { GalleryEntry, GalleryPage } from '@/lib/gallery';

export default function Gallery() {
  const { pending, published, retry, dismiss } = useGallery();
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [downloadError, setDownloadError] = useState('');
  const [downloadEntry, setDownloadEntry] = useState<GalleryEntry | null>(null);
  const [lightbox, setLightbox] = useState<LightboxSelection | null>(null);
  const cursor = useRef<string | null>(null);
  const busy = useRef(false);
  const end = useRef(false);
  const scroll = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);

  const loadMore = useCallback(async () => {
    if (busy.current || end.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch(`/api/gallery${cursor.current ? `?cursor=${encodeURIComponent(cursor.current)}` : ''}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]) });
      const data = await response.json() as GalleryPage & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not load the gallery.');
      if (abort.signal.aborted) return;
      setEntries((items) => {
        const seen = new Set(items.map((item) => item.id));
        return [...items, ...data.entries.filter((item) => !seen.has(item.id))];
      });
      cursor.current = data.cursor;
      end.current = data.cursor === null;
      setHasMore(!end.current);
    } catch (error) {
      if (!abort.signal.aborted) setError(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The gallery took too long to load. Try again.');
    } finally {
      if (controller.current === abort) { busy.current = false; if (!abort.signal.aborted) setLoading(false); }
    }
  }, []);

  useEffect(() => {
    void loadMore();
    return () => { controller.current?.abort(); busy.current = false; };
  }, [loadMore]);

  useEffect(() => {
    if (!hasMore || error || loading) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void loadMore(); }, { root: scroll.current, rootMargin: '500px' });
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, error, loading, loadMore]);

  const publishedIds = new Set(published.map((entry) => entry.id));
  const all = [...published, ...entries.filter((entry) => !publishedIds.has(entry.id))];

  return <main className="gallery-page" ref={scroll} style={lightbox || downloadEntry ? { overflow: 'hidden' } : undefined}>
    <header className="gallery-header">
      <Link href="/" className="pool-reset ball-button back-link" aria-label="Back to pools"><BallLetters text="BACK" /></Link>
    </header>
    <div className="gallery-grid">
      {pending && <article className="gallery-card pending-card" aria-label={`Message by ${pending.name}`} aria-busy={pending.status === 'uploading'}>
        <div className={`gallery-image-placeholder${pending.status === 'uploading' ? ' skeleton' : ''}`} />
        <div className="pending-message" role={pending.status === 'failed' ? 'alert' : 'status'}>
          {pending.status === 'uploading' ? 'sending your message…' : <>
            <p>{pending.error}</p>
            <button className="text-button" onClick={retry}>try again</button>
            <button className="text-button muted" onClick={dismiss}>dismiss</button>
          </>}
        </div>
        <div className="gallery-name"><ColoredName name={pending.name} /></div>
      </article>}
      {all.map((entry) => <GalleryCard key={entry.id} entry={entry} onOpen={() => setLightbox({ entry })} onDownload={() => { setDownloadError(''); setDownloadEntry(entry); }} />)}
      {loading && Array.from({ length: all.length ? 5 : 10 }, (_, index) => <div className="gallery-card skeleton-card" aria-hidden="true" key={`skeleton-${index}`}><div className="gallery-image-placeholder skeleton" /><div className="skeleton-name skeleton" /></div>)}
    </div>
    {!loading && !error && !pending && !all.length && <div className="gallery-empty"><p>the first shot is yours.</p><Link className="pool-reset ball-button" href="/" aria-label="Make pool balls"><BallLetters text="PLAY" /></Link></div>}
    <div ref={sentinel} className="gallery-sentinel">
      {error ? <div role="alert"><p>{error}</p><button className="text-button" onClick={() => void loadMore()}>try again</button></div>
        : loading ? <p role="status">loading the gallery…</p>
          : hasMore ? <button className="text-button" onClick={() => void loadMore()}>load more</button> : all.length > 0 ? <p className="gallery-end" aria-label="You've seen every shot"><ColoredName name="you’ve seen every shot" /></p> : null}
    </div>
    {downloadError && <p className="download-status" role="alert">{downloadError}</p>}
    {downloadEntry && <DownloadDialog entry={downloadEntry} onClose={() => setDownloadEntry(null)} onError={setDownloadError} />}
    {lightbox && <GalleryLightbox selection={lightbox} onClose={() => setLightbox(null)} />}
  </main>;
}

function GalleryCard({ entry, onOpen, onDownload }: { entry: GalleryEntry; onOpen: () => void; onDownload: () => void }) {
  return <article className="gallery-card" aria-label={`Pool balls by ${entry.name}`}>
    <button className="gallery-open" type="button" aria-label={`Play message by ${entry.name}: ${entry.message}`} onClick={onOpen}>
      <MessagePreview message={entry.message} />
    </button>
    <div className="gallery-footer"><div className="gallery-name"><ColoredName name={entry.name} /></div>
    <button type="button" className="gallery-download" aria-label={`Download message by ${entry.name}`} onClick={onDownload}>
      <Download size={14} strokeWidth={3} absoluteStrokeWidth aria-hidden="true" />
    </button></div>
  </article>;
}
