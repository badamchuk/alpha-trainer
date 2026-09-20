#!/usr/bin/env node
// Власний ключ для підпису релізів: створюється один раз і живе вічно.
//
//   npm run signing:setup
//
// Навіщо: зараз APK підписаний debug-ключем із Android SDK. Він працює, але
// це ключ «для розробки»: він не таємний, і будь-хто може зібрати APK, який
// стане оновленням поверх встановленого. Для роздачі людям потрібен свій.
//
// ВАЖЛИВО, і це не формальність: ключ не можна загубити. Android дозволяє
// оновлення лише тим самим ключем. Загубив — усі, хто поставив додаток,
// зможуть оновитись лише через видалення (тобто з втратою даних, якщо не
// зробили експорт). Тому скрипт одразу каже, що саме треба покласти в надійне
// місце, і нічого не кладе в git.
//
// Перехід на новий ключ теж не безкоштовний: додаток, уже встановлений із
// debug-підписом, не оновиться поверх. Порядок такий:
//   1) у додатку: Профіль → Резервна копія → Експорт (файл у хмару чи пошту);
//   2) видалити додаток;
//   3) поставити новий APK;
//   4) Профіль → Резервна копія → Імпорт.

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const KEYSTORE = path.join(ANDROID, 'app', 'hart-release.keystore');
const PROPS = path.join(ANDROID, 'keystore.properties');
const DEFAULT_JAVA_HOME = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

if (fs.existsSync(PROPS)) {
  fail(`${PROPS} уже є — ключ налаштовано.\n`
    + '  Щоб зробити новий, спершу прибери старий (і пам’ятай: оновити\n'
    + '  встановлені додатки новим ключем не вийде).');
}
if (!fs.existsSync(ANDROID)) fail('Немає теки android/ — спершу npx expo prebuild --platform android');

const javaHome = process.env.JAVA_HOME
  || (fs.existsSync(DEFAULT_JAVA_HOME) ? DEFAULT_JAVA_HOME : '');
if (!javaHome) fail('Не знайдено Java — задай JAVA_HOME');
const keytool = path.join(javaHome, 'bin', 'keytool');

// Пароль генерується тут: рукою придумані паролі до ключів однаково
// зберігаються у файлі поруч, тож хай краще буде випадковий.
const password = crypto.randomBytes(24).toString('base64url');
const alias = 'hart';

console.log('Створюю ключ (діє 10 000 днів)…');
try {
  execSync([
    `"${keytool}" -genkeypair -v`,
    `-keystore "${KEYSTORE}"`,
    `-alias ${alias}`,
    '-keyalg RSA -keysize 4096 -validity 10000',
    `-storepass "${password}" -keypass "${password}"`,
    '-dname "CN=Hart, OU=Hart, O=Hart, L=Kyiv, C=UA"',
  ].join(' '), { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (e) {
  fail(`keytool не впорався: ${e.stderr?.toString() || e.message}`);
}

fs.writeFileSync(PROPS, [
  '# Доступ до ключа підпису. НЕ в git, НЕ в чат, НЕ в скриншот.',
  '# Втратиш цей файл або keystore — оновлення для встановлених додатків стануть',
  '# неможливими (лише перевстановлення з втратою даних).',
  `storeFile=hart-release.keystore`,
  `storePassword=${password}`,
  `keyAlias=${alias}`,
  `keyPassword=${password}`,
  '',
].join('\n'), { mode: 0o600 });

console.log(`\n✔ Ключ створено: ${path.relative(ROOT, KEYSTORE)}`);
console.log(`✔ Доступи: ${path.relative(ROOT, PROPS)} (права 600)`);
console.log('\nЩо зробити ПРЯМО ЗАРАЗ:');
console.log('  1. Поклади обидва файли в надійне місце (менеджер паролів, зашифрований диск).');
console.log('     Тека android/ не в git — тут вони живуть лише на цьому Mac.');
console.log('  2. На телефоні: Профіль → Резервна копія → Експорт. Наступний APK');
console.log('     не стане поверх старого — його доведеться ставити заново.');
console.log('  3. npm run release -- minor — і новий APK уже з твоїм ключем.');
console.log('\nПеревірити підпис зібраного APK:');
console.log('  $ANDROID_HOME/build-tools/*/apksigner verify --print-certs dist/Hart-v*.apk');
