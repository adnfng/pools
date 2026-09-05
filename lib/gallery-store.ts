import { Redis } from '@upstash/redis';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { GalleryEntry, GalleryPage } from './gallery';

const PREFIX = `${process.env.POOLS_GALLERY_KEY ?? 'pools'}:messages:v1`;
const DIRECTORY = path.join(process.cwd(), 'data', 'messages');
const PAGE_SIZE = 25;
export const localGallery = !process.env.VERCEL && process.env.GALLERY_STORAGE !== 'cloud';
export const validId = (id: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
export const validCursor = (cursor: string) => /^\d{13}-[a-f0-9-]{36}$/.test(cursor) && validId(cursor.slice(14));

export class GalleryError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new GalleryError('The gallery is not ready to accept messages yet. Please try again later.');
  }
  return new Redis({ url, token });
}

export async function getEntry(id: string): Promise<GalleryEntry | null> {
  if (!validId(id)) return null;
  if (!localGallery) return redis().get<GalleryEntry>(`${PREFIX}:entry:${id}`);
  try { return JSON.parse(await readFile(path.join(DIRECTORY, `${id}.json`), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

export async function listEntries(cursor: string | null): Promise<GalleryPage> {
  let entries: GalleryEntry[];
  if (localGallery) {
    let files: string[];
    try { files = await readdir(DIRECTORY); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], cursor: null }; throw error; }
    entries = (await Promise.all(files.filter((file) => file.endsWith('.json')).map((file) => getEntry(file.slice(0, -5)))))
      .filter((entry): entry is GalleryEntry => !!entry && (!cursor || entry.order < cursor))
      .sort((a, b) => b.order.localeCompare(a.order)).slice(0, PAGE_SIZE + 1);
  } else {
    const store = redis();
    // Equal scores make the timestamp + UUID a stable lexicographic cursor,
    // including when several submissions arrive in the same millisecond.
    const orders = await store.zrange<string[]>(`${PREFIX}:index`, cursor ? `(${cursor}` : '+', '-', {
      byLex: true, rev: true, offset: 0, count: PAGE_SIZE + 1,
    });
    if (!orders.length) return { entries: [], cursor: null };
    entries = (await store.mget<(GalleryEntry | null)[]>(...orders.map((order) => `${PREFIX}:entry:${order.slice(14)}`)))
      .filter((entry): entry is GalleryEntry => !!entry);
  }
  const more = entries.length > PAGE_SIZE;
  entries = entries.slice(0, PAGE_SIZE);
  return { entries, cursor: more ? entries[entries.length - 1].order : null };
}

const localLocks = new Set<string>();
const localRates = new Map<string, { count: number; expires: number }>();

async function checkRate(address: string) {
  const now = Date.now();
  const bucket = Math.floor(now / 3_600_000);
  const hash = createHash('sha256').update(`${bucket}:${address}`).digest('hex');
  let count: number;
  if (localGallery) {
    for (const [key, value] of localRates) if (value.expires < now) localRates.delete(key);
    const rate = localRates.get(hash) ?? { count: 0, expires: now + 3_600_000 };
    count = ++rate.count;
    localRates.set(hash, rate);
  } else {
    count = Number(await redis().eval(
      "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 3600) end; return n",
      [`${PREFIX}:rate:${hash}`], [],
    ));
  }
  if (count > 20) throw new GalleryError('You have sent lots of messages. Please try again in an hour.', 429);
}

export async function saveEntry(id: string, name: string, message: string, address: string): Promise<GalleryEntry> {
  const existing = await getEntry(id);
  if (existing) return existing;
  const lockKey = `${PREFIX}:lock:${id}`;
  const lockToken = randomUUID();
  const store = localGallery ? null : redis();
  if (store) {
    if (!await store.set(lockKey, lockToken, { nx: true, ex: 90 })) throw new GalleryError('Your message is still being sent. Try again in a moment.', 409);
  } else {
    if (localLocks.has(id)) throw new GalleryError('Your message is still being sent. Try again in a moment.', 409);
    localLocks.add(id);
  }
  try {
    const completed = await getEntry(id);
    if (completed) return completed;
    await checkRate(address);
    const createdAt = Date.now();
    const entry: GalleryEntry = { id, name, createdAt, order: `${createdAt}-${id}`, message };
    if (localGallery) {
      await mkdir(DIRECTORY, { recursive: true });
      const temporary = path.join(DIRECTORY, `${id}.${lockToken}.tmp`);
      await writeFile(temporary, JSON.stringify(entry));
      await rename(temporary, path.join(DIRECTORY, `${id}.json`));
    } else {
      await store!.multi().set(`${PREFIX}:entry:${id}`, entry).zadd(`${PREFIX}:index`, { score: 0, member: entry.order }).exec();
    }
    return entry;
  } finally {
    if (store) await store.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end; return 0", [lockKey], [lockToken]).catch(() => undefined);
    else localLocks.delete(id);
  }
}

