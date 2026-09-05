'use client';

import { useId, type CSSProperties } from 'react';
import { BALL_COLORS } from '@/lib/gallery';
import { graphemes } from '@/lib/text';

export function BallLetters({ text }: { text: string }) {
  const id = useId();
  const seed = Array.from(text + id).reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0;
  const colors = text === 'RESET' ? [BALL_COLORS[0], BALL_COLORS[5], BALL_COLORS[2], BALL_COLORS[8], BALL_COLORS[4]] : BALL_COLORS;
  return <span className="ball-letters" aria-hidden="true">{graphemes(text).map((char, index) => char === ' '
    ? <span className="letter-space" key={index} />
    : <span className="letter-ball" key={index} style={{
      '--ball-color': colors[index % colors.length],
      '--ball-rotation': `${[-8, 4, -8, 4][(seed + index * 19) % 40]}deg`,
    } as CSSProperties}><span>{char}</span></span>)}</span>;
}
