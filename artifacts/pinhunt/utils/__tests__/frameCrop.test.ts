import { frameCrop } from '../frameCrop';

describe('frameCrop (UX-009)', () => {
  it('maps a centred frame on a square preview of a portrait photo', () => {
    // 3024×4032 photo shown in a 360×360 box: scale 360/3024, the top and
    // bottom are cut off. A 240 pt frame (+10%) is 264 pt = 2218 px.
    const r = frameCrop({ photoWidth: 3024, photoHeight: 4032, viewWidth: 360, viewHeight: 360, frameSize: 240 });
    expect(r.width).toBe(2218);
    expect(r.height).toBe(2218);
    expect(r.originX).toBe(Math.round((3024 - 2218) / 2));
    expect(r.originY).toBe(Math.round((4032 - 2218) / 2));
  });

  it('is centred on a landscape photo in a tall preview', () => {
    const r = frameCrop({ photoWidth: 4000, photoHeight: 3000, viewWidth: 300, viewHeight: 400, frameSize: 200, margin: 0 });
    // scale = max(300/4000, 400/3000) = 0.1333; side = 200 / 0.1333 = 1500.
    expect(r.width).toBe(1500);
    expect(r.originX).toBe(1250);
    expect(r.originY).toBe(750);
  });

  it('never leaves the photo, even with a frame as big as the box', () => {
    const r = frameCrop({ photoWidth: 1000, photoHeight: 1000, viewWidth: 300, viewHeight: 300, frameSize: 300, margin: 0.5 });
    expect(r).toEqual({ originX: 0, originY: 0, width: 1000, height: 1000 });
  });
});
