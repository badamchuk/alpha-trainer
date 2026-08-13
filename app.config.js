// Розширює app.json даними, які відомі лише в момент збірки.
//
// Потрібно, щоб з екрана налаштувань було видно, ЯКИЙ саме код зараз
// на телефоні. versionName у локальних debug-збірках не змінюється ніколи,
// тож сам по собі він не каже, чи доїхала онова.
//
// Expo читає цей файл замість app.json; базу беремо звідти, щоб не
// дублювати конфіг у двох місцях.

const { execSync } = require('child_process');
const base = require('./app.json');

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return ''; // не git-репозиторій або git недоступний — не привід ламати збірку
  }
}

const gitHash = sh('git rev-parse --short HEAD') || 'unknown';
const gitDirty = sh('git status --porcelain') !== '';

module.exports = () => ({
  ...base.expo,
  extra: {
    ...base.expo.extra,
    gitHash,
    // зірочка = у збірку потрапили незакомічені зміни
    gitDirty,
    buildDate: new Date().toISOString(),
  },
});
