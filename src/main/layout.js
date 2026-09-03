// Pure geometry: no DOM, no Electron, nothing measured from a window. Main is the only thing
// that decides where a tile is, and this is the only thing that decides how big.

export const METRICS = { strip: 36, gap: 8 };

// Edges first, then widths. Rounding each edge against the exact fraction keeps every gap the
// same integer and stops the last column drifting a pixel wider than the first.
function edges(start, span, parts, gap) {
  const inner = span - gap * (parts - 1);
  const out = [];
  for (let i = 0; i <= parts; i += 1) out.push(start + Math.round((inner * i) / parts) + gap * i);
  return out;
}

export function tileRects({
  width, height, count, mode = 'grid', focusedIndex = 0,
  strip = METRICS.strip, gap = METRICS.gap,
}) {
  if (count <= 0) return [];
  const area = {
    x: gap,
    y: strip,
    width: Math.max(0, width - gap * 2),
    height: Math.max(0, height - strip - gap),
  };
  const hidden = { visible: false, x: 0, y: 0, width: 0, height: 0 };

  if (mode === 'single') {
    return Array.from({ length: count }, (_, i) => (
      i === focusedIndex ? { visible: true, ...area } : { ...hidden }
    ));
  }

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const xs = edges(area.x, area.width, cols, gap);
  const ys = edges(area.y, area.height, rows, gap);

  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // The last tile takes the empty cells after it, so the grid never shows a hole.
    const lastInRow = i === count - 1 ? cols - 1 : col;
    return {
      visible: true,
      x: xs[col],
      y: ys[row],
      width: xs[lastInRow + 1] - xs[col] - gap,
      height: ys[row + 1] - ys[row] - gap,
    };
  });
}
