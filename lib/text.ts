const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), (part) => part.segment);
}

export function graphemeIndex(value: string, offset: number) {
  let count = 0;
  for (const part of segmenter.segment(value)) {
    if (part.index >= offset) break;
    count++;
  }
  return count;
}

export function deletionRange(value: string, offset: number, backwards: boolean): [number, number] {
  const parts = Array.from(segmenter.segment(value));
  if (backwards) {
    const previous = parts.findLast((part) => part.index < offset);
    return previous ? [previous.index, Math.max(offset, previous.index + previous.segment.length)] : [offset, offset];
  }
  const next = parts.find((part) => part.index + part.segment.length > offset);
  return next ? [Math.min(offset, next.index), next.index + next.segment.length] : [offset, offset];
}
