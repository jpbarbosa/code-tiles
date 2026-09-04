// Pure geometry: no DOM, no Electron, nothing measured from a window. Main is the only thing
// that decides where a tile is, and this is the only thing that decides how big.

export const METRICS = { strip: 36, gap: 8, min: 180 };

// The grid a count makes. Two counts can make the same one - three projects and four are both
// 2x2 - which is what lets a drag survive closing a project.
export function gridShape(count) {
  const cols = Math.ceil(Math.sqrt(count));
  return { cols, rows: Math.ceil(count / cols) };
}

// What a grid's proportions are remembered against. The shape rather than the count, so the
// 2x2 you dragged is the 2x2 you get back.
export function shapeKey(count) {
  const { cols, rows } = gridShape(count);
  return `${cols}x${rows}`;
}

// Each column's or row's share of its axis, summing to one. Absent, and left over from a grid
// of another shape, are the same answer: equal shares.
function shares(given, parts) {
  const usable = Array.isArray(given) && given.length === parts && given.every((share) => share > 0);
  if (!usable) return Array.from({ length: parts }, () => 1 / parts);
  const total = given.reduce((sum, share) => sum + share, 0);
  return given.map((share) => share / total);
}

// Edges first, then widths: a column runs from its edge to the next one, less a gap, which is
// why the far edge sits a gap past the area. Rounding each edge against the exact fraction keeps
// every gap the same integer and stops the last column drifting a pixel wider than the first.
// The far edge is set rather than accumulated, because shares that sum to one in decimal do not
// in binary.
function edges(start, span, parts, gap) {
  const inner = span - gap * (parts.length - 1);
  const out = [start];
  let taken = 0;
  for (let i = 0; i < parts.length; i += 1) {
    taken += parts[i];
    out.push(start + Math.round(inner * taken) + gap * (i + 1));
  }
  out[parts.length] = start + inner + gap * parts.length;
  return out;
}

function grid({ width, height, count, sizes = {}, strip, gap }) {
  const area = {
    x: gap,
    y: strip,
    width: Math.max(0, width - gap * 2),
    height: Math.max(0, height - strip - gap),
  };
  const { cols, rows } = gridShape(count);
  return {
    area,
    cols,
    rows,
    xs: edges(area.x, area.width, shares(sizes.cols, cols), gap),
    ys: edges(area.y, area.height, shares(sizes.rows, rows), gap),
  };
}

export function tileRects({
  width, height, count, mode = 'grid', focusedIndex = 0, sizes,
  strip = METRICS.strip, gap = METRICS.gap,
}) {
  if (count <= 0) return [];
  const { area, cols, xs, ys } = grid({ width, height, count, sizes, strip, gap });
  const hidden = { visible: false, x: 0, y: 0, width: 0, height: 0 };

  if (mode === 'single') {
    return Array.from({ length: count }, (_, i) => (
      i === focusedIndex ? { visible: true, ...area } : { ...hidden }
    ));
  }

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

// The gutters a drag can take hold of. A vertical one exists only where two tiles actually
// meet: the last tile stretches over the empty cells after it, and a handle drawn there would
// be a handle under a view, which swallows every press inside its own rect. Row gutters run the
// full width, because every row spans it.
export function gridSplitters({
  width, height, count, mode = 'grid', sizes,
  strip = METRICS.strip, gap = METRICS.gap,
}) {
  if (mode !== 'grid' || count < 2) return [];
  const { area, cols, rows, xs, ys } = grid({ width, height, count, sizes, strip, gap });
  const out = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      // The tile that would START at this column. No tile, no gutter.
      if (row * cols + col >= count) continue;
      out.push({
        axis: 'cols', index: col,
        x: xs[col] - gap, y: ys[row], width: gap, height: ys[row + 1] - ys[row] - gap,
      });
    }
  }
  for (let row = 1; row < rows; row += 1) {
    out.push({
      axis: 'rows', index: row,
      x: area.x, y: ys[row] - gap, width: area.width, height: gap,
    });
  }
  return out;
}

// A gutter dragged to `position`: the pointer's own x or y, in the window's coordinates, which
// is the space the rects are already in. Only the two shares either side of the gutter change,
// so the rest of the grid stays exactly where the eye left it.
export function gridResize({
  width, height, count, sizes = {}, axis, index, position,
  strip = METRICS.strip, gap = METRICS.gap, min = METRICS.min,
}) {
  const { area, cols, rows } = grid({ width, height, count, sizes, strip, gap });
  const parts = axis === 'cols' ? cols : axis === 'rows' ? rows : 0;
  if (!parts || !(index >= 1) || index > parts - 1) return sizes;

  const start = axis === 'cols' ? area.x : area.y;
  const span = axis === 'cols' ? area.width : area.height;
  const inner = span - gap * (parts - 1);
  if (inner <= 0) return sizes;

  const current = shares(sizes[axis], parts);
  const before = current.slice(0, index - 1).reduce((sum, share) => sum + share, 0);
  const pair = current[index - 1] + current[index];
  // A tile can be dragged small but never to nothing. On a window too narrow to hold two of
  // them the floor gives way rather than making the clamp impossible.
  const floor = Math.min(min / inner, pair / 2);
  // The gutter's centre is what follows the pointer, which is where the eye says it is.
  const wanted = (position + gap / 2 - start - gap * index) / inner;
  const cut = Math.min(Math.max(wanted, before + floor), before + pair - floor);

  const next = [...current];
  next[index - 1] = cut - before;
  next[index] = before + pair - cut;
  return { ...sizes, [axis]: next };
}
