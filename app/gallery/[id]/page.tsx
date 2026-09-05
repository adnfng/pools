import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PoolTable } from '@/components/pool-table';
import { normalizePlaybackId, playbackPath } from '@/lib/gallery';
import { getEntry } from '@/lib/gallery-store';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

async function loadEntry(id: string) {
  const key = normalizePlaybackId(id);
  if (!key) return null;
  try { return await getEntry(key); }
  catch { return null; }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = await loadEntry((await params).id);
  if (!entry) return { title: 'imsend.ing' };
  const snippet = entry.message.trim().slice(0, 80);
  return {
    title: `${entry.name} — imsend.ing`,
    description: snippet,
    openGraph: { title: `${entry.name} — imsend.ing`, description: snippet },
  };
}

export default async function Playback({ params }: Props) {
  const requested = normalizePlaybackId((await params).id);
  const entry = await loadEntry(requested);
  if (!entry) notFound();
  if (entry.id !== requested) redirect(playbackPath(entry.id));
  return <PoolTable entry={entry} />;
}
