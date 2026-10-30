/** Name-plate placement for the illustrated region maps (pure: no DOM, unit-tested in tests/region-map.test.ts). */

export interface PlateItem { id: string; x: number; y: number; size: number; text: string; you?: boolean }
type Box = [number, number, number, number];
export const PLATE_H = 22, PLATE_MAX = 140;

/**
 * Where each place's name plate goes, for a map `mw` px wide (2:3): below the medallion, else right, left or above —
 * the first side that covers no medallion face, no other plate and Lin's token, and stays inside the map. Places are
 * served in `order` (most important first); a place with no clean side gets no plate (null) and shows its number on
 * the medallion instead, so a dense map stays readable on a small phone. The first place in `order` always gets a
 * plate (on its least crowded side), drawn above the others. Offsets are from the medallion's top-left.
 */
export function placeLabels(items: PlateItem[], mw: number, textWidth: (t: string) => number, order: string[] = []) {
  const mh = mw * 1.5;
  const obstacles: Box[] = [];
  for (const n of items) {
    const cx = n.x * mw, cy = n.y * mh, f = n.size / 2 - 4;   // a plate may graze a medallion's rim, never its face
    obstacles.push([cx - f, cy - f, cx + f, cy + f]);
    if (n.you) { const r = n.size / 2; obstacles.push([cx - r - 22, cy - r - 30, cx - r + 12, cy - r + 12]); }
  }
  const hit = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const rank = new Map(order.map((id, i) => [id, i] as const));
  const queue = items.map((n, i) => ({ n, i })).sort((a, b) => (rank.get(a.n.id) ?? 1e3 + a.i) - (rank.get(b.n.id) ?? 1e3 + b.i));
  const placed: Box[] = [];
  const out = new Map<string, { left: number; top: number } | null>();
  for (const { n, i } of queue) {
    const cx = n.x * mw, cy = n.y * mh, r = n.size / 2, w = Math.min(PLATE_MAX, textWidth(n.text)), H = PLATE_H;
    const clampX = (x0: number) => Math.max(2, Math.min(mw - 2 - w, x0));
    const cand: Box[] = [
      [clampX(cx - w / 2), cy + r + 3],      // below
      [cx + r + 3, cy - H / 2],              // right
      [cx - r - 3 - w, cy - H / 2],          // left
      [clampX(cx - w / 2), cy - r - 3 - H],  // above
    ].map(([x0, y0]) => [x0!, y0!, x0! + w, y0! + H] as Box);
    const ok = (b: Box) => b[0] >= 0 && b[2] <= mw && b[1] >= 0 && b[3] <= mh
      && !obstacles.some((o, k) => k !== i + items.slice(0, i).filter((m) => m.you).length && hit(b, o))
      && !placed.some((p) => hit(b, [p[0] - 2, p[1] - 2, p[2] + 2, p[3] + 2]));
    let best = cand.find(ok);
    // the first place in the order (the selected one) always shows its name: the inside side that covers least
    if (!best && n.id === order[0]) {
      const area = (b: Box) => [...obstacles, ...placed].reduce((a, o) => a + Math.max(0, Math.min(b[2], o[2]) - Math.max(b[0], o[0])) * Math.max(0, Math.min(b[3], o[3]) - Math.max(b[1], o[1])), 0);
      best = cand.filter((b) => b[0] >= 0 && b[2] <= mw && b[1] >= 0 && b[3] <= mh).sort((a, b) => area(a) - area(b))[0];
    }
    if (!best) { out.set(n.id, null); continue; }
    placed.push(best);
    out.set(n.id, { left: best[0] - (cx - r), top: best[1] - (cy - r) });
  }
  return out;
}
