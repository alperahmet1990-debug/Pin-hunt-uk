// The runtime fingerprint must ignore files that never change the native
// binary, or OTA updates stop reaching installed builds (#379).
const config = require('../fingerprint.config');

describe('fingerprint config', () => {
  it('ignores eas.json and .gitignore', () => {
    expect(config.ignorePaths).toEqual(expect.arrayContaining(['eas.json', '.gitignore']));
  });

  it('does not ignore native inputs', () => {
    for (const p of ['app.json', 'package.json', 'assets/images/icon.png', 'assets/images/splash-icon.png']) {
      expect(config.ignorePaths).not.toContain(p);
    }
  });
});
