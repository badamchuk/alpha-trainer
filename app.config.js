// Єдиний конфіг Expo. Динамічний (а не app.json), бо частину значень —
// хеш коміту й час збірки — можна дізнатись лише в момент збірки.
//
// Раніше поруч лежав app.json, з якого цей файл підтягував базу. Expo так
// робити не радить (expo-doctor лається на два джерела правди), тому все
// зведено сюди.
//
// Важливо: extra потрапляє в застосунок під час НАТИВНОЇ збірки, не через
// Metro. Тому gitHash показує код, зашитий в APK; JS поверх нього може бути
// свіжішим через Fast Refresh.

const { execSync } = require('child_process');
const { versionCodeFor } = require('./scripts/version');

// Версію піднімає scripts/release.js (npm version), тож джерело правди —
// package.json. Саме її додаток порівнює з останнім GitHub-релізом.
const version = require('./package.json').version;

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
  name: 'AlphaTrainer',
  slug: 'alpha-trainer-app',
  version,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: 'alphatrainer',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0D0D0D',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.alphatrainer.app',
    buildNumber: String(versionCodeFor(version)),
  },
  android: {
    // Наявна тека android/ цього не підхоплює (expo run:android не робить
    // prebuild) — туди versionCode записує scripts/release.js.
    versionCode: versionCodeFor(version),
    adaptiveIcon: {
      backgroundColor: '#0D0D0D',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    package: 'com.alphatrainer.app',
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    '@react-native-community/datetimepicker',
    'expo-sharing',
    'expo-font',
    [
      'expo-camera',
      {
        cameraPermission:
          'AlphaTrainer використовує камеру для сканування штрих-кодів та фото-логування їжі.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'AlphaTrainer використовує галерею для фото-логування їжі.',
        cameraPermission: 'AlphaTrainer використовує камеру для фото-логування їжі.',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#E63946',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          newArchEnabled: false,
          kotlinVersion: '2.0.21',
          gradleVersion: '8.13',
          ndkVersion: '30.0.14904198',
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: '75c0a8b6-b247-4316-9d4d-d005f772ceea',
    },
    gitHash,
    // зірочка в UI = у збірку потрапили незакомічені зміни
    gitDirty,
    buildDate: new Date().toISOString(),
    /**
     * Самооновлення через APK з GitHub. Для збірки в Google Play його треба
     * вимкнути: правила магазину забороняють додаткам оновлювати себе повз
     * нього. Збірка для магазину: DISTRIBUTION=play npm run release.
     */
    selfUpdate: process.env.DISTRIBUTION !== 'play',
    distribution: process.env.DISTRIBUTION || 'direct',
  },
});
