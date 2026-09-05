import { graphemes } from './text';

export function messageLayout(text: string, width: number, height: number, maximumSize = 64) {
  const chars = graphemes(text);
  const available = Math.max(1, Math.min(width - 48, 900));
  function arrange(size: number) {
    const gap = size * .075;
    const step = size + gap;
    const rows: { indices: number[]; width: number }[] = [{ indices: [], width: 0 }];
    const positions: { x: number; y: number }[] = [];
    for (let index = 0; index < chars.length; index++) {
      let row = rows[rows.length - 1];
      if (chars[index] !== '\n' && row.width + step > available && row.indices.length) { rows.push({ indices: [], width: 0 }); row = rows[rows.length - 1]; }
      if (chars[index] === '\n') { rows.push({ indices: [], width: 0 }); continue; }
      positions[index] = { x: row.width, y: rows.length - 1 };
      row.indices.push(index);
      row.width += /\s/u.test(chars[index]) ? step * .55 : step;
    }
    const totalHeight = rows.length * size * 1.16;
    rows.forEach((row, rowIndex) => row.indices.forEach((index) => {
      positions[index] = { x: (width - Math.max(0, row.width - gap)) / 2 + positions[index].x + size / 2, y: (height - totalHeight) / 2 + size * 1.16 * (rowIndex + .5) };
    }));
    return { chars, positions, size, totalHeight };
  }
  let result = arrange(Math.min(maximumSize, Math.max(4, width / 4), Math.max(4, height / 4)));
  while (result.totalHeight > height - result.size * 2 && result.size > 4) result = arrange(Math.max(4, result.size * .9));
  return result;
}
