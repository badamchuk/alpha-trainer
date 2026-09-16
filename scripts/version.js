// Спільне для app.config.js і scripts/release.js.
//
// Android ставить оновлення поверх лише тоді, коли versionCode не менший
// за встановлений. Тому він виводиться з semver, а не ведеться руками:
// 1.2.3 → 1002003. Запас — до 999 на minor і на patch.

function versionCodeFor(version) {
  const [major, minor, patch] = String(version)
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  return major * 1000000 + minor * 1000 + patch;
}

module.exports = { versionCodeFor };
