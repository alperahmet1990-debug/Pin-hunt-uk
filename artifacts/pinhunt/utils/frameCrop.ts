/**
 * Where the on-screen scan frame falls in the captured photo (UX-009, #117).
 *
 * The live preview fills its box ("cover"), so the photo is scaled until it
 * covers the box and centred, with the overflow cut off. The frame is a
 * centred square in the box. This maps that square back to photo pixels,
 * grown by `margin` so a pin near the frame edge isn't clipped, and kept
 * inside the photo.
 */
export interface FrameCropInput {
  photoWidth: number;
  photoHeight: number;
  viewWidth: number;
  viewHeight: number;
  /** Side of the square frame on screen, in points. */
  frameSize: number;
  /** Extra room around the frame, as a fraction of its side (default 0.1). */
  margin?: number;
}

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export function frameCrop({ photoWidth, photoHeight, viewWidth, viewHeight, frameSize, margin = 0.1 }: FrameCropInput): CropRect {
  const scale = Math.max(viewWidth / photoWidth, viewHeight / photoHeight);
  // Photo pixels hidden on each side by the cover fit.
  const hiddenX = (photoWidth * scale - viewWidth) / 2;
  const hiddenY = (photoHeight * scale - viewHeight) / 2;
  const sideOnScreen = Math.min(frameSize * (1 + margin), viewWidth, viewHeight);
  const side = Math.min(sideOnScreen / scale, photoWidth, photoHeight);
  const centreX = (hiddenX + viewWidth / 2) / scale;
  const centreY = (hiddenY + viewHeight / 2) / scale;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
  const originX = clamp(centreX - side / 2, photoWidth - side);
  const originY = clamp(centreY - side / 2, photoHeight - side);
  return { originX: Math.round(originX), originY: Math.round(originY), width: Math.round(side), height: Math.round(side) };
}
