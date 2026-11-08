/**
 * Realistic boards (iPad: Collecting at home): how a board's pins sit on a
 * corkboard, lanyard or shadow box.
 *
 * A display board is a fixed shape (4:3, like a real board), so a layout made
 * on an iPad looks the same on a phone. Pin positions are stored as fractions
 * of the board's width and height (0–1, the pin's centre), and pin size
 * follows how many pins are on the board.
 *
 * Pins without a saved position get a spot from the automatic layout: neat
 * rows with a little natural tilt and wobble, the same every time for a given
 * pin (seeded by its id), never random on each render.
 */
export type BoardStyle = 'cork' | 'lanyard' | 'shadowbox' | 'plain';

export const BOARD_STYLES: { value: BoardStyle; label: string }[] = [
  { value: 'cork', label: 'Corkboard' },
  { value: 'lanyard', label: 'Lanyard' },
  { value: 'shadowbox', label: 'Shadow box' },
  { value: 'plain', label: 'Plain' },
];

/** Width ÷ height of every display board. */
export const BOARD_ASPECT = 4 / 3;

/** A pin's place on the board: centre as fractions of width/height, tilt in degrees. */
export interface PinPlacement { x: number; y: number; r: number }

export interface BoardDisplayPrefs {
  style: BoardStyle;
  /** Positions the collector has arranged by hand, by pin id. */
  placements: Record<string, PinPlacement>;
}

export const DEFAULT_BOARD_DISPLAY: BoardDisplayPrefs = { style: 'cork', placements: {} };

/** Stable number in [0, 1) from a string (FNV-1a), so wobble never jumps. */
export function hashUnit(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/** Columns and rows that fit `count` pins on a 4:3 board. */
export function boardGrid(count: number): { cols: number; rows: number } {
  const n = Math.max(1, count);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * BOARD_ASPECT)));
  return { cols, rows: Math.ceil(n / cols) };
}

/** A pin's edge as a fraction of the board's width, from how many pins there are. */
export function pinSizeFraction(count: number): number {
  const { cols, rows } = boardGrid(count);
  // Fit the cell's width and its height (a row is 1/rows of the height, which
  // is 1/BOARD_ASPECT of the width), leave breathing room, and never let a few
  // pins go giant.
  return Math.min(1 / cols, 1 / (rows * BOARD_ASPECT), 0.3) * 0.72;
}

/** How much tilt each style allows: shadow boxes are mounted straight. */
const TILT: Record<BoardStyle, number> = { cork: 6, lanyard: 4, shadowbox: 1.5, plain: 3 };

/** Neat rows with a little seeded wobble and tilt, for every pin in order. */
export function autoLayout(pinIds: string[], style: BoardStyle = 'cork'): Record<string, PinPlacement> {
  const { cols, rows } = boardGrid(pinIds.length);
  const out: Record<string, PinPlacement> = {};
  pinIds.forEach((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Centre a short last row.
    const inRow = row === rows - 1 ? pinIds.length - row * cols : cols;
    const offset = (cols - inRow) / 2;
    const wobble = style === 'shadowbox' ? 0.04 : 0.12;
    out[id] = {
      x: clamp01((col + offset + 0.5 + (hashUnit(id + 'x') - 0.5) * wobble) / cols),
      y: clamp01((row + 0.5 + (hashUnit(id + 'y') - 0.5) * wobble) / rows),
      r: round1((hashUnit(id + 'r') - 0.5) * 2 * TILT[style]),
    };
  });
  return out;
}

/** Saved positions where the collector has arranged pins, automatic ones elsewhere. */
export function placementsFor(pinIds: string[], prefs: BoardDisplayPrefs): Record<string, PinPlacement> {
  const auto = autoLayout(pinIds, prefs.style);
  const out: Record<string, PinPlacement> = {};
  for (const id of pinIds) out[id] = prefs.placements[id] ?? auto[id];
  return out;
}

/** Move a pin by a drag of (dx, dy) points on a board `width` wide, kept on the board. */
export function movePlacement(p: PinPlacement, dx: number, dy: number, width: number, sizeFraction: number): PinPlacement {
  const height = width / BOARD_ASPECT;
  const halfW = sizeFraction / 2;
  const halfH = (sizeFraction * BOARD_ASPECT) / 2;
  return {
    x: clamp(p.x + dx / width, halfW, 1 - halfW),
    y: clamp(p.y + dy / height, halfH, 1 - halfH),
    r: p.r,
  };
}

/** Saved placements for pins still on the board only (pins taken off are forgotten). */
export function prunePlacements(placements: Record<string, PinPlacement>, pinIds: string[]): Record<string, PinPlacement> {
  const keep = new Set(pinIds);
  return Object.fromEntries(Object.entries(placements).filter(([id]) => keep.has(id)));
}

export function isBoardStyle(v: unknown): v is BoardStyle {
  return v === 'cork' || v === 'lanyard' || v === 'shadowbox' || v === 'plain';
}

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }
function clamp01(v: number) { return clamp(v, 0, 1); }
function round1(v: number) { return Math.round(v * 10) / 10; }
