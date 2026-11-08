/**
 * Layout classes for bigger screens (iPad, Split View, web).
 *
 * Decided by the window width, not the device, so an iPad app in a narrow
 * Split View or Slide Over window gets the phone layout and a wide browser
 * window gets the iPad one.
 *
 * - compact: phones, Slide Over, narrow Split View (< 600 pt)
 * - regular: iPad portrait, half of a large iPad in Split View (600–999 pt)
 * - wide:    iPad landscape and wider (>= 1000 pt): room for a side panel
 */
export type LayoutClass = 'compact' | 'regular' | 'wide';

export const REGULAR_MIN_WIDTH = 600;
export const WIDE_MIN_WIDTH = 1000;

/** Width of the side panel that sits beside a grid in the wide layout. */
export const SIDE_PANEL_WIDTH = 320;

export function layoutClass(width: number): LayoutClass {
  if (width >= WIDE_MIN_WIDTH) return 'wide';
  if (width >= REGULAR_MIN_WIDTH) return 'regular';
  return 'compact';
}

/** True when a side panel fits beside the main content. */
export function hasSidePanel(width: number): boolean {
  return layoutClass(width) === 'wide';
}
