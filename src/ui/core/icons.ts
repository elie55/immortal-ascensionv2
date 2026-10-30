/**
 * Inline SVG icon set (line style, 24×24, stroke = currentColor). Drawn for the game so nothing is
 * fetched at runtime. Usage: icon("lotus", 22).
 */
const P: Record<string, string> = {
  lotus: '<path d="M12 18c-4 0-8-2-9-5 3 0 5 1 6 2-1-3 0-7 3-10 3 3 4 7 3 10 1-1 3-2 6-2-1 3-5 5-9 5Z"/><path d="M5 20h14"/>',
  brush: '<path d="M14.5 4.5l5 5-8 8-5-5z"/><path d="M6.5 12.5 4 20l7.5-2.5"/><path d="M13 6l5 5"/>',
  sword: '<path d="M14.5 3H21v6.5L9 21.5 2.5 15z"/><path d="M5 13l6 6"/><path d="M3 21l3-3"/>',
  person: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/>',
  pouch: '<path d="M9 4h6l-1.5 3h-3z"/><path d="M8.5 7.5C5 10 4 13 4 15.5 4 19 7.5 21 12 21s8-2 8-5.5c0-2.5-1-5.5-4.5-8"/><path d="M9 11.5h6"/>',
  temple: '<path d="M2 8.5 12 3l10 5.5"/><path d="M4 9.5h16"/><path d="M5.5 10v8M9.5 10v8M14.5 10v8M18.5 10v8"/><path d="M3 21h18M4 18.5h16"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  cp: '<path d="M14.5 3H21v6.5L9 21.5 2.5 15z"/><path d="M5 13l6 6"/><path d="M3 21l3-3"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14" stroke-width="3"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3"/><path d="M8 21v-7h8v7"/>',
  export: '<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  import: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 13v7h14v-7"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  fast: '<path d="M4 6l7 6-7 6zM13 6l7 6-7 6z"/>',
  auto: '<path d="M7 4l12 8-12 8z"/><path d="M3 4v16"/>',
  numbers: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  shake: '<path d="M8 4h8v16H8z"/><path d="M4 8v8M20 8v8M2 10v4M22 10v4"/>',
  text: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
  motion: '<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  // line glyphs for map medallions (never swapped for painted art, unlike fame/gem)
  star: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19l1-5.8L3.5 9.2l5.9-.9z" fill="currentColor" fill-opacity=".25"/>',
  chest: '<path d="M4 10h16v9H4z"/><path d="M4 10c0-3 2-5 5-5h6c3 0 5 2 5 5"/><path d="M4 14h16"/><path d="M11 12.5h2v3h-2z"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/><path d="M5 21h14"/>',
  update: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  compare: '<path d="M7 4v16M17 4v16"/><path d="M4 8l3-4 3 4M14 16l3 4 3-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warning: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18v.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cauldron: '<path d="M4 10h16l-1.5 7a3 3 0 0 1-3 2.5h-7a3 3 0 0 1-3-2.5z"/><path d="M3 10h18"/><path d="M8 6c0-1 1-2 2-2M12 5c0-1 1-2 2-2"/><path d="M7 20l-1 2M17 20l1 2"/>',
  paw: '<circle cx="7" cy="10" r="2"/><circle cx="17" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5-2 3-4 3-4 0-4-3Z"/>',
  scroll: '<path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7"/><path d="M6 4a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2Z"/><path d="M7 20a2 2 0 0 1-2-2V8"/><path d="M10 9h6M10 13h6"/>',
  gem: '<path d="M6 3h12l4 6-10 12L2 9z" fill="currentColor" fill-opacity=".25"/><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3 7 9l5 12 5-12-2-6"/>',
  fame: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19l1-5.8L3.5 9.2l5.9-.9z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  log: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  skip: '<path d="M5 5l9 7-9 7z"/><path d="M18 5v14"/>',
  qi: '<path d="M12 3c5 0 9 4 9 9s-4 9-9 9"/><path d="M12 21c-2.5 0-4.5-2-4.5-4.5S9.5 12 12 12s4.5-2 4.5-4.5S14.5 3 12 3"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/><circle cx="12" cy="16.5" r="1"/>',
  root: '<path d="M12 3v8"/><path d="M12 11c-3 0-5 2-6 5M12 11c3 0 5 2 6 5M12 11v10"/><circle cx="12" cy="3" r="1"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  ring: '<circle cx="12" cy="14" r="6"/><path d="M9 5h6l-1.5 3h-3z"/>',
  boots: '<path d="M8 3h5v9l6 3v4H6l1-5z"/><path d="M6 19h13"/>',
  helmet: '<path d="M4 15a8 8 0 0 1 16 0v2H4z"/><path d="M12 7V3M8 17v3M16 17v3"/>',
  robe: '<path d="M8 3l4 3 4-3 4 4-3 3v11H7V10L4 7z"/><path d="M12 6v15"/>',
  necklace: '<path d="M5 4c0 6 3 9 7 9s7-3 7-9"/><circle cx="12" cy="16" r="3"/>',
  artifact: '<path d="M12 3l3 5 5 1-3.5 4 1 5.5L12 16l-5.5 2.5 1-5.5L4 9l5-1z"/>',
  sort: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
};

/** Painted replacements (ui.icons art) for some line icons, set once the content is loaded. */
const PAINTED: Record<string, string> = {};
export function setPainted(map: Record<string, string | undefined>) { for (const [k, v] of Object.entries(map)) if (v) PAINTED[k] = v; }

export function icon(name: keyof typeof P | string, size = 20, cls = ""): SVGSVGElement {
  const wrap = document.createElement("span");
  if (PAINTED[name] && size >= 12) {
    const sp = document.createElement("span");
    sp.className = `ico painted ${cls}`; sp.setAttribute("aria-hidden", "true");
    sp.style.width = sp.style.height = `${Math.round(size * 1.18)}px`; sp.style.backgroundImage = `url("./${PAINTED[name]}")`;
    return sp as unknown as SVGSVGElement;
  }
  wrap.innerHTML = `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? P.info}</svg>`;
  return wrap.firstChild as SVGSVGElement;
}

export const SLOT_ICON: Record<string, string> = { weapon: "sword", armor: "robe", helmet: "helmet", boots: "boots", necklace: "necklace", ring_1: "ring", ring_2: "ring", artifact: "artifact" };
