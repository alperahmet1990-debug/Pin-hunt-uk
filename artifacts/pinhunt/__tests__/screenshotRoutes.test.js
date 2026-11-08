/**
 * The screenshot harness (scripts/screenshots.mjs) can answer /scan/identify
 * with a route's "identify" body. Those bodies must name pins the demo
 * catalogue has, or the capture shows an empty result instead of the screen
 * the route is named after.
 */
const fs = require('fs');
const path = require('path');
const routes = require('../scripts/screenshot-routes.json');
const { PINS } = require('../mock-data/pins');
const { AI_PHOTO_CONSENT_VERSION } = require('../utils/aiPhotoConsent');

const identifyRoutes = routes.filter(r => r.identify);

describe('screenshot routes with a mocked scan identify', () => {
  it('cover a result, its options and no match', () => {
    expect(identifyRoutes.map(r => r.name)).toEqual(expect.arrayContaining(['scan-result', 'scan-result-options', 'scan-no-match']));
  });

  it.each(identifyRoutes.map(r => [r.name, r]))('%s uploads a photo and names demo pins', (_name, route) => {
    expect(route.upload).toBeTruthy();
    expect(Array.isArray(route.identify.matches)).toBe(true);
    const ids = new Set(PINS.map(p => p.id));
    for (const m of route.identify.matches) expect(ids.has(m.pinId)).toBe(true);
  });

  it('the harness can read the AI photo consent version it pre-accepts', () => {
    // scripts/screenshots.mjs reads it from source with this pattern.
    const source = fs.readFileSync(path.join(__dirname, '../utils/aiPhotoConsent.ts'), 'utf8');
    expect(source.match(/export const AI_PHOTO_CONSENT_VERSION = '([^']+)'/)?.[1]).toBe(AI_PHOTO_CONSENT_VERSION);
  });
});
