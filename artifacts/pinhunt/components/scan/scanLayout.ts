/**
 * Find a Pin before a photo (web, and any device without the live camera):
 * the viewfinder card gives way so Scan Pin, Choose Photo and Manually
 * Search all sit above the tab bar, even on a 320×568 iPhone SE (1st gen).
 */

/** The viewfinder card's usual height. */
export const IDLE_VIEWFINDER_MAX = 300;
/** Never smaller than this: still reads as a viewfinder, with its hint. */
export const IDLE_VIEWFINDER_MIN = 120;

/**
 * Everything else on the idle screen, in pt: the header (title and line,
 * 64), the gap under the card (16) and the actions (two 50 pt buttons and a
 * 44 pt text button, 12 apart: 168), plus a little slack.
 */
export const IDLE_CHROME = 256;

/**
 * The idle viewfinder height for a window `windowHeight` tall, with
 * `topSpace` above the content and `bottomSpace` reserved below it (the
 * tab bar on web).
 */
export function idleViewfinderHeight(windowHeight: number, topSpace: number, bottomSpace: number): number {
  const room = windowHeight - topSpace - bottomSpace - IDLE_CHROME;
  return Math.round(Math.max(IDLE_VIEWFINDER_MIN, Math.min(IDLE_VIEWFINDER_MAX, room)));
}
