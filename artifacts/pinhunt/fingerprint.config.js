// Runtime version fingerprint (app.json runtimeVersion.policy = "fingerprint").
// Only native-affecting inputs should change it. eas.json (submit ids, build
// profile tweaks) and package.json scripts (dev/test tooling) do not change the
// native binary, so they are excluded to avoid stranding OTA updates.
// .gitignore is excluded for the same reason: one added line (#371) changed the
// runtime version and stopped OTA updates reaching TestFlight build 3 (#379).
/** @type {import('expo/fingerprint').Config} */
const { SourceSkips } = require('expo/fingerprint');

module.exports = {
  sourceSkips:
    SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun |
    SourceSkips.PackageJsonScriptsAll,
  ignorePaths: ['eas.json', '.gitignore'],
};
