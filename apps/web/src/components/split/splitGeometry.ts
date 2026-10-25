/** The space between panes, in CSS pixels; the resize handles live in it. */
export const SPLIT_GAP = 8;
/** The narrowest or shortest a pane may be dragged to. */
export const MIN_PANE_SIZE = 220;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const weightOr = (value: number | undefined) => (value && value > 0 ? value : 1);

/**
 * Where each chat of a split sits inside `area`, the way the grid lays it out:
 * rows share the height by row weight, chats share their row by column weight.
 */
export function layoutSplit(
  rows: readonly (readonly string[])[],
  columnWeights: Readonly<Record<string, number>>,
  rowWeights: readonly number[] | undefined,
  area: Rect,
): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  const rowShares = rows.map((_, index) => weightOr(rowWeights?.[index]));
  const rowTotal = rowShares.reduce((sum, share) => sum + share, 0);
  const height = area.height - SPLIT_GAP * (rows.length - 1);
  let y = area.y;
  rows.forEach((row, rowIndex) => {
    const rowHeight = (height * rowShares[rowIndex]!) / rowTotal;
    const shares = row.map((key) => weightOr(columnWeights[key]));
    const total = shares.reduce((sum, share) => sum + share, 0);
    const width = area.width - SPLIT_GAP * (row.length - 1);
    let x = area.x;
    row.forEach((key, column) => {
      const paneWidth = (width * shares[column]!) / total;
      rects.set(key, { x, y, width: paneWidth, height: rowHeight });
      x += paneWidth + SPLIT_GAP;
    });
    y += rowHeight + SPLIT_GAP;
  });
  return rects;
}

export const rectOf = (element: Element): Rect => {
  const box = element.getBoundingClientRect();
  return { x: box.left, y: box.top, width: box.width, height: box.height };
};

export const contains = (rect: Rect, point: { x: number; y: number }) =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;
