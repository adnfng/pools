'use client';

import { useId, type CSSProperties } from 'react';
import { BALL_COLORS } from '@/lib/gallery';
import { graphemes } from '@/lib/text';

function pick(seed: number, index: number, min: number, max: number, salt: number) {
  return min + ((seed + index * 67 + salt * 131) * 1103515245 + 12345 >>> 0) % (max - min + 1);
}

function signed(seed: number, index: number, min: number, max: number, salt: number) {
  const value = pick(seed, index, min, max, salt);
  return ((seed + index * 53 + salt * 97) >>> 0) % 2 ? value : -value;
}

export function BallLetters({ text }: { text: string }) {
  const id = useId();
  const seed = Array.from(text + id).reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0;
  const colors = text === 'RESET' ? [BALL_COLORS[0], BALL_COLORS[5], BALL_COLORS[2], BALL_COLORS[8], BALL_COLORS[4]] : BALL_COLORS;
  return <span className="ball-letters" aria-hidden="true">{graphemes(text).map((char, index) => char === ' '
    ? <span className="letter-space" key={index} />
    : <span className="letter-ball" key={index} style={{
      '--ball-color': colors[index % colors.length],
      '--ball-rotation': `${signed(seed, index, 8, 16, 0)}deg`,
      '--ball-hover-y': `${signed(seed, index, 2, 4, 2)}px`,
    } as CSSProperties}><span>{char}</span></span>)}</span>;
}
