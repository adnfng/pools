import { graphemes } from './text';

export const NAME_LIMIT = 20;
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_REQUEST_BYTES = 32 * 1024;
export const BALL_COLORS = ['#6797FF', '#FFA01A', '#52ED6A', '#333333', '#FE5CF9', '#4AF4F4', '#A073FF', '#FFE658', '#FF3636'];

export function cleanName(value: string) {
  return graphemes(value.normalize('NFC').replace(/[^\p{L}\p{N}\p{M} @._'-]/gu, '')).slice(0, NAME_LIMIT).join('');
}
export function validName(value: string) {
  return value === cleanName(value) && value === value.trim() && value.length > 0;
}
export function validMessage(value: string) {
  return value.trim().length > 0 && value.length <= 16_000 && graphemes(value).length <= MAX_MESSAGE_LENGTH && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff]/u.test(value);
}
export type GalleryEntry = {
  id: string;
  name: string;
  message: string;
  createdAt: number;
  order: string;
};
export type GalleryPage = { entries: GalleryEntry[]; cursor: string | null };

const ID_BODY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
const ID_HEAD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ID_LENGTH = 8;

export function encodeIdBytes(bytes: Uint8Array) {
  let id = ID_HEAD[bytes[0] % ID_HEAD.length];
  for (let index = 1; index < ID_LENGTH; index++) id += ID_BODY[bytes[index] % ID_BODY.length];
  return id;
}

export function newPlaybackId() {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  return encodeIdBytes(bytes);
}

export const validShortId = (id: string) => /^[A-Z0-9][A-Z0-9_-]{6,8}$/.test(id);
export const validLegacyId = (id: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);

export function normalizePlaybackId(id: string) {
  const short = id.toUpperCase();
  if (validShortId(short)) return short;
  const legacy = id.toLowerCase();
  return validLegacyId(legacy) ? legacy : '';
}

export const validId = (id: string) => !!normalizePlaybackId(id);
export const validCursor = (cursor: string) => /^\d{13}-/.test(cursor) && validId(cursor.slice(14));
export const playbackPath = (id: string) => `/gallery/${id}`;
