/**
 * Release configuration guard (#20, B-P0-08).
 *
 * Store builds need identifiers, purpose strings and EAS profiles. These
 * checks fail if any of them is removed, and if Replit settings or anything
 * that looks like a credential sneak into the committed config.
 */
const appJson = require('../app.json');
const easJson = require('../eas.json');
const pkg = require('../package.json');
const easJsonText = JSON.stringify(easJson);
const expo = appJson.expo;

type PluginEntry = string | [string, Record<string, unknown>];
function pluginOptions(name: string): Record<string, unknown> | undefined {
  const entry = (expo.plugins as PluginEntry[]).find((p) =>
    Array.isArray(p) ? p[0] === name : p === name,
  );
  return Array.isArray(entry) ? entry[1] : undefined;
}

describe('app.json release configuration', () => {
  it('has the app name, version and runtime version', () => {
    expect(expo.name).toBe('PinHunt');
    expect(expo.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(expo.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  it('has store identifiers for iOS and Android', () => {
    expect(expo.ios.bundleIdentifier).toBe('uk.pinhunt.app');
    expect(expo.android.package).toBe('uk.pinhunt.app');
    expect(expo.ios.config.usesNonExemptEncryption).toBe(false);
  });

  it('has specific camera and photo library purpose strings', () => {
    const camera = pluginOptions('expo-camera');
    const picker = pluginOptions('expo-image-picker');
    for (const text of [camera?.cameraPermission, picker?.cameraPermission, picker?.photosPermission]) {
      expect(typeof text).toBe('string');
      expect(text as string).toMatch(/^PinHunt uses /);
    }
    expect(camera?.microphonePermission).toBe(false);
    expect(picker?.microphonePermission).toBe(false);
  });

  it('does not request location, which the app does not use', () => {
    expect(pkg.dependencies?.['expo-location']).toBeUndefined();
    expect(pkg.devDependencies?.['expo-location']).toBeUndefined();
    expect(pluginOptions('expo-location')).toBeUndefined();
    expect(JSON.stringify(expo)).not.toMatch(/NSLocation|ACCESS_(FINE|COARSE)_LOCATION/);
  });

  it('keeps the Replit expo-router origin', () => {
    expect(pluginOptions('expo-router')?.origin).toBe('https://replit.com/');
  });
});

describe('eas.json build profiles', () => {
  it.each(['development', 'preview', 'production'])('%s has its own channel and environment', (name) => {
    const profile = easJson.build[name];
    expect(profile).toBeDefined();
    expect(profile.channel).toBe(name);
    expect(profile.environment).toBe(name);
  });

  it('auto-increments build numbers remotely for store builds', () => {
    expect(easJson.cli.appVersionSource).toBe('remote');
    expect(easJson.build.preview.autoIncrement).toBe(true);
    expect(easJson.build.production.autoIncrement).toBe(true);
  });

  it('never publishes an Android release automatically', () => {
    expect(easJson.submit.preview.android.track).toBe('internal');
    for (const name of ['preview', 'production']) {
      expect(easJson.submit[name].android.releaseStatus).toBe('draft');
    }
  });

  it('contains no credentials or credential file paths', () => {
    expect(easJsonText).not.toMatch(
      /serviceAccountKeyPath|appleId|appleTeamId|ascApiKey|password|secret|token|BEGIN [A-Z ]*PRIVATE KEY|\.p8|\.p12|keystore/i,
    );
    expect(JSON.stringify(easJson.build)).not.toMatch(/"env"\s*:/);
  });
});
