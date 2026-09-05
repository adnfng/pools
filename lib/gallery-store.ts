import { Redis } from '@upstash/redis';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  encodeIdBytes, normalizePlaybackId, validCursor, validId, validShortId,
  type GalleryEntry, type GalleryPage,
} from './gallery';

export { validCursor, validId };

const PREFIX = `${process.env.POOLS_GALLERY_KEY ?? 'pools'}:messages:v1`;
const DIRECTORY = path.join(process.cwd(), 'data', 'messages');
const PAGE_SIZE = 25;
export const localGallery = !process.env.VERCEL && process.env.GALLERY_STORAGE !== 'cloud';

export class GalleryError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new GalleryError('The gallery is not ready to accept messages yet. Please try again later.');
  return new Redis({ url, token });
}

function entryKey(id: string) { return `${PREFIX}:entry:${id}`; }
function shortIdFromSeed(seed: string, attempt = 0) {
  return encodeIdBytes(createHash('sha256').update(`imsend:${seed}:${attempt}`).digest().subarray(0, 8));
}

async function readRaw(id: string): Promise<GalleryEntry | null> {
  const key = normalizePlaybackId(id);
  if (!key) return null;
  if (!localGallery) return redis().get<GalleryEntry>(entryKey(key));
  try { return JSON.parse(await readFile(path.join(DIRECTORY, `${key}.json`), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

async function writeRecord(entry: GalleryEntry, alias?: string) {
  if (localGallery) {
    await mkdir(DIRECTORY, { recursive: true });
    const temporary = path.join(DIRECTORY, `${entry.id}.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(entry));
    await rename(temporary, path.join(DIRECTORY, `${entry.id}.json`));
    if (alias && alias !== entry.id) await writeFile(path.join(DIRECTORY, `${alias}.json`), JSON.stringify(entry));
    return;
  }
  const tx = redis().multi().set(entryKey(entry.id), entry).zadd(`${PREFIX}:index`, { score: 0, member: entry.order });
  if (alias && alias !== entry.id) tx.set(entryKey(alias), entry);
  await tx.exec();
}

async function uniqueShort(seed: string) {
  for (let attempt = 0; attempt < 32; attempt++) {
    const id = shortIdFromSeed(seed, attempt);
    if (!await readRaw(id)) return id;
  }
  throw new GalleryError('Could not create a short link for this message.');
}

async function canonicalEntry(entry: GalleryEntry): Promise<GalleryEntry> {
  if (validShortId(entry.id)) return entry;
  const id = await uniqueShort(entry.id);
  const next: GalleryEntry = { ...entry, id, order: `${entry.createdAt}-${id}` };
  await writeRecord(next, entry.id);
  if (!localGallery && entry.order !== next.order) await redis().zrem(`${PREFIX}:index`, entry.order);
  return next;
}

export async function getEntry(id: string): Promise<GalleryEntry | null> {
  const raw = await readRaw(id);
  return raw ? canonicalEntry(raw) : null;
}

export async function listEntries(cursor: string | null): Promise<GalleryPage> {
  let raw: (GalleryEntry | null)[];
  if (localGallery) {
    let files: string[];
    try { files = await readdir(DIRECTORY); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], cursor: null }; throw error; }
    raw = await Promise.all(files.filter((file) => file.endsWith('.json')).map((file) => readRaw(file.slice(0, -5))));
  } else {
    const orders = await redis().zrange<string[]>(`${PREFIX}:index`, cursor ? `(${cursor}` : '+', '-', {
      byLex: true, rev: true, offset: 0, count: PAGE_SIZE + 1,
    });
    if (!orders.length) return { entries: [], cursor: null };
    raw = await redis().mget<(GalleryEntry | null)[]>(...orders.map((order) => entryKey(normalizePlaybackId(order.slice(14)))));
  }
  const seen = new Set<string>();
  const entries: GalleryEntry[] = [];
  for (const entry of raw) {
    if (!entry) continue;
    const next = await canonicalEntry(entry);
    if (seen.has(next.id) || (localGallery && cursor && next.order >= cursor)) continue;
    seen.add(next.id);
    entries.push(next);
  }
  entries.sort((a, b) => b.order.localeCompare(a.order));
  const page = entries.slice(0, PAGE_SIZE + 1);
  const more = page.length > PAGE_SIZE;
  const listed = page.slice(0, PAGE_SIZE);
  return { entries: listed, cursor: more ? listed[listed.length - 1].order : null };
}

const localLocks = new Set<string>();
const localRates = new Map<string, { count: number; expires: number }>();

async function checkRate(address: string) {
  const now = Date.now();
  const hash = createHash('sha256').update(`${Math.floor(now / 3_600_000)}:${address}`).digest('hex');
  let count: number;
  if (localGallery) {
    for (const [key, value] of localRates) if (value.expires < now) localRates.delete(key);
    const rate = localRates.get(hash) ?? { count: 0, expires: now + 3_600_000 };
    localRates.set(hash, rate);
    count = ++rate.count;
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
  if (existing) {
    if (existing.name === name && existing.message === message) return existing;
    throw new GalleryError('Invalid submission. Please save again.', 409);
  }
  const incoming = normalizePlaybackId(id);
  const short = validShortId(incoming) ? incoming : await uniqueShort(id);
  const lockKey = `${PREFIX}:lock:${short}`;
  const lockToken = randomUUID();
  const store = localGallery ? null : redis();
  if (store) {
    if (!await store.set(lockKey, lockToken, { nx: true, ex: 90 })) throw new GalleryError('Your message is still being sent. Try again in a moment.', 409);
  } else if (localLocks.has(short)) {
    throw new GalleryError('Your message is still being sent. Try again in a moment.', 409);
  } else localLocks.add(short);
  try {
    const completed = await getEntry(short);
    if (completed) {
      if (completed.name === name && completed.message === message) return completed;
      throw new GalleryError('Invalid submission. Please save again.', 409);
    }
    await checkRate(address);
    const createdAt = Date.now();
    const entry: GalleryEntry = { id: short, name, createdAt, order: `${createdAt}-${short}`, message };
    const alias = normalizePlaybackId(id);
    await writeRecord(entry, alias !== short ? alias : undefined);
    return entry;
  } finally {
    if (store) await store.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end; return 0", [lockKey], [lockToken]).catch(() => undefined);
    else localLocks.delete(short);
  }
}
