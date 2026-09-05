import { MAX_REQUEST_BYTES, validMessage, validName } from '@/lib/gallery';
import { GalleryError, listEntries, saveEntry, validCursor, validId } from '@/lib/gallery-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (error instanceof GalleryError) return Response.json({ error: error.message }, { status: error.status });
  console.error('Gallery request failed:', error instanceof Error ? error.message : 'Unknown error');
  return Response.json({ error: 'The gallery is temporarily unavailable. Please try again.' }, { status: 503 });
}
export async function GET(request: Request) {
  const cursor = new URL(request.url).searchParams.get('cursor');
  if (cursor && !validCursor(cursor)) return Response.json({ error: 'Invalid gallery cursor.' }, { status: 400 });
  try { return Response.json(await listEntries(cursor), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Please send messages from this site.' }, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'A message and name are required.' }, { status: 400 });
  if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) return Response.json({ error: 'Message is too large.' }, { status: 413 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new GalleryError('A message is required.', 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) { await reader.cancel(); throw new GalleryError('Message is too large.', 413); }
      chunks.push(value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new GalleryError('Could not read your message.', 400); }
    if (!body || typeof body !== 'object') throw new GalleryError('A message and name are required.', 400);
    const { name, id, message } = body;
    if (typeof name !== 'string' || !validName(name)) throw new GalleryError('Use a name of 1–20 letters, numbers, spaces, or @ . _ \' -', 400);
    if (typeof id !== 'string' || !validId(id)) throw new GalleryError('Invalid submission. Please save again.', 400);
    if (typeof message !== 'string' || !validMessage(message)) throw new GalleryError('Enter a message of 1–500 characters.', 400);
    const address = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
    return Response.json({ entry: await saveEntry(id, name, message, address) }, { status: 201 });
  } catch (error) { return failure(error); }
}
