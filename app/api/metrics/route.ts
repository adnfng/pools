import { Redis } from '@upstash/redis';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.POOLS_METRICS_KEY ?? 'pools:letters';
const file = path.join(process.cwd(), 'data', 'metrics.json');

type Metrics = { letters: number };

function normalize(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function readFileMetrics(): Promise<Metrics> {
  try {
    const data = JSON.parse(await readFile(file, 'utf8')) as { letters?: unknown };
    return { letters: normalize(data.letters) };
  } catch {
    return { letters: 0 };
  }
}

let queue = Promise.resolve();

function locked<T>(work: () => Promise<T>) {
  const next = queue.then(work, work);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function readMetrics(): Promise<Metrics> {
  const store = redis();
  if (store) return { letters: normalize(await store.get<number>(KEY)) };
  return readFileMetrics();
}

async function addMetrics(add: number): Promise<Metrics> {
  const store = redis();
  if (store) {
    const letters = add ? normalize(await store.incrby(KEY, add)) : normalize(await store.get<number>(KEY));
    return { letters };
  }
  return locked(async () => {
    const current = await readFileMetrics();
    const metrics = { letters: current.letters + add };
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(metrics));
    return metrics;
  });
}

export async function GET() {
  return Response.json(await readMetrics());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { letters?: unknown };
  const add = normalize(body.letters);
  return Response.json(await addMetrics(add));
}
