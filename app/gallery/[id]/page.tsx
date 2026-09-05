import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PoolTable } from '@/components/pool-table';
import { getEntry, validId } from '@/lib/gallery-store';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

async function loadEntry(id: string) {
  if (!validId(id)) return null;
  try { return await getEntry(id); }
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
  const entry = await loadEntry((await params).id);
  if (!entry) notFound();
  return <PoolTable entry={entry} />;
}
