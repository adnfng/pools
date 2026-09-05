import type { CSSProperties } from 'react';
import { graphemes } from '@/lib/text';

export function ColoredName({ name }: { name: string }) {
  return <span className="colored-name" aria-label={name}>{graphemes(name).map((char, index) => {
    const seed = (char.codePointAt(0) ?? 0) * 31 + index * 17;
    return <span key={index} aria-hidden="true" style={{
      transform: `rotate(${[-2, 1, -1, 2][Math.floor(seed / 7) % 4]}deg)`,
    } as CSSProperties}>{char === ' ' ? '\u00a0' : char}</span>;
  })}</span>;
}
