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
  version: '1.0.0',
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
    buildNumber: '2',
  },
  android: {
    versionCode: 2,
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
  },
});
