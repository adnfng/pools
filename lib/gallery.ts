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
