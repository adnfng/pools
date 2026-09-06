import { graphemes } from './text';

function charWidth(char: string, step: number) {
  return /\s/u.test(char) ? step * .55 : step;
}

function isWordChar(char: string) {
  return char !== '\n' && !/\s/u.test(char);
}

export function messageLayout(text: string, width: number, height: number, maximumSize = 64) {
  const chars = graphemes(text);
  const available = Math.max(1, Math.min(width - 48, 900));
  function arrange(size: number) {
    const gap = size * .075;
    const step = size + gap;
    const rows: { indices: number[]; width: number; x: number; y: number }[] = [{ indices: [], width: 0, x: 0, y: 0 }];
    const breaks: number[] = [];

    function add(index: number) {
      const row = rows[rows.length - 1];
      row.indices.push(index);
      row.width += charWidth(chars[index], step);
    }

    function wordStart(row: { indices: number[] }) {
      let start = row.indices.length;
      while (start > 0 && isWordChar(chars[row.indices[start - 1]])) start--;
      return start;
    }

    for (let index = 0; index < chars.length; index++) {
      const char = chars[index];
      if (char === '\n') {
        rows.push({ indices: [], width: 0, x: 0, y: 0 });
        breaks[index] = rows.length - 1;
        continue;
      }
      const row = rows[rows.length - 1];
      const nextWidth = charWidth(char, step);
      if (row.indices.length && row.width + nextWidth > available) {
        if (isWordChar(char)) {
          const start = wordStart(row);
          if (start > 0 && start < row.indices.length) {
            const moved = row.indices.splice(start);
            row.width = row.indices.reduce((sum, item) => sum + charWidth(chars[item], step), 0);
            rows.push({ indices: [], width: 0, x: 0, y: 0 });
            for (const item of moved) add(item);
          } else {
            rows.push({ indices: [], width: 0, x: 0, y: 0 });
          }
        } else {
          rows.push({ indices: [], width: 0, x: 0, y: 0 });
        }
      }
      add(index);
    }

    const positions: { x: number; y: number }[] = [];
    const rowHeight = size * 1.16;
    const totalHeight = rows.length * rowHeight;
    const top = (height - totalHeight) / 2;
    rows.forEach((row, rowIndex) => {
      row.x = (width - Math.max(0, row.width - gap)) / 2;
      row.y = top + rowHeight * (rowIndex + .5);
      let x = 0;
      for (const index of row.indices) {
        positions[index] = { x: row.x + x + size / 2, y: row.y };
        x += charWidth(chars[index], step);
      }
    });
    breaks.forEach((rowIndex, index) => {
      const row = rows[rowIndex];
      positions[index] = { x: row.x, y: row.y };
    });

    function caret(index: number) {
      if (index < chars.length && positions[index]) {
        const inset = chars[index] === '\n' ? 0 : size / 2;
        return { x: positions[index].x - inset - gap / 2, y: positions[index].y };
      }
      const last = rows[rows.length - 1];
      return { x: last.x + Math.max(0, last.width - gap / 2), y: last.y };
    }

    return { chars, positions, size, totalHeight, caret };
  }
  let result = arrange(Math.min(maximumSize, Math.max(4, width / 4), Math.max(4, height / 4)));
  while (result.totalHeight > height - result.size * 2 && result.size > 4) result = arrange(Math.max(4, result.size * .9));
  return result;
}
