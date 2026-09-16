#!/usr/bin/env node
// Випуск оновлення: release-APK → GitHub Release. Телефон сам побачить
// новий реліз (services/updates.ts) і запропонує оновитись.
//
//   npm run release                  patch: 1.0.0 → 1.0.1
//   npm run release -- minor         1.0.1 → 1.1.0
//   npm run release -- 2.0.0         конкретна версія
//   npm run release -- --dry-run     лише перевірки й тести, нічого не змінює
//
// RELEASE_COMMIT_TRAILER="..." — додати рядок у кінець коміту релізу
//
// Порядок важливий: спершу коміт і тег, потім збірка — інакше в APK
// потрапить хеш попереднього коміту з позначкою «незакомічені зміни».
//
// Підпис — android/app/debug.keystore, тим самим ключем підписані збірки
// з `npx expo run:android`. Тому APK стає поверх наявного додатка і дані
// лишаються. Інший ключ = лише перевстановлення = втрата локальних даних.

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { versionCodeFor } = require('./version');

const ROOT = path.resolve(__dirname, '..');
const REPO = 'badamchuk/alpha-trainer'; // той самий, що в services/updates.ts
const DEFAULT_JAVA_HOME = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const GRADLE_FILE = path.join(ROOT, 'android/app/build.gradle');
const APK_BUILT = path.join(ROOT, 'android/app/build/outputs/apk/release/app-release.apk');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bump = args.find((a) => !a.startsWith('--')) || 'patch';

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function out(cmd) {
  return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

// У --dry-run перешкоди лише збираються — щоб побачити їх усі одразу
const problems = [];
function check(ok, msg) {
  if (ok) return;
  if (dryRun) problems.push(msg);
  else fail(msg);
}

function nextVersion(current, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [major, minor, patch] = current.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  return fail(`Невідомий тип версії «${kind}» — patch, minor, major або X.Y.Z`);
}

// ─── Перевірки ───────────────────────────────────────────────────────────────

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = nextVersion(pkg.version, bump);
const tag = `v${version}`;
const versionCode = versionCodeFor(version);

if (versionCode <= versionCodeFor(pkg.version)) fail(`${version} не новіша за поточну ${pkg.version}`);
if (!fs.existsSync(GRADLE_FILE)) fail('Немає теки android/ — спершу npx expo prebuild --platform android');

const javaHome = process.env.JAVA_HOME || (fs.existsSync(DEFAULT_JAVA_HOME) ? DEFAULT_JAVA_HOME : '');
if (!javaHome) fail('Не знайдено Java — задай JAVA_HOME');

const branch = out('git rev-parse --abbrev-ref HEAD');
check(branch === 'main', `Реліз — лише з main (зараз ${branch})`);
check(out('git status --porcelain') === '', 'Є незакомічені зміни — спершу закоміть їх');
check(out(`git tag -l ${tag}`) === '', `Тег ${tag} уже існує`);
try {
  out('gh auth status');
} catch {
  check(false, 'gh не авторизований — gh auth login');
}
out('git fetch origin main --tags');
check(out('git rev-list --count HEAD..origin/main') === '0', 'Локальний main позаду origin — спершу git pull');

let prevTag = '';
try {
  prevTag = out('git describe --tags --abbrev=0 --match "v*"');
} catch {
  // перший реліз — тегів ще немає
}

console.log(`\nРеліз ${pkg.version} → ${version} (versionCode ${versionCode})`
  + (prevTag ? `, зміни з ${prevTag}` : ', перший'));

// ─── Тести ───────────────────────────────────────────────────────────────────

run('npm test --silent');
run('npm run typecheck --silent');

if (dryRun) {
  console.log(problems.length
    ? `\n--dry-run: тести пройшли, але для справжнього релізу заважає:\n  - ${problems.join('\n  - ')}`
    : '\n--dry-run: усе готово до релізу, нічого не змінено.');
  process.exit(0);
}

// ─── Версія ──────────────────────────────────────────────────────────────────

run(`npm version ${version} --no-git-tag-version`);

// expo run:android не робить prebuild, тож android/ сама про нову версію
// не дізнається. Без цього телефон відмовився б ставити APK з меншим versionCode.
const gradle = fs.readFileSync(GRADLE_FILE, 'utf8');
const patched = gradle
  .replace(/versionCode \d+/, `versionCode ${versionCode}`)
  .replace(/versionName "[^"]*"/, `versionName "${version}"`);
if (!patched.includes(`versionCode ${versionCode}`)) fail('Не вдалося оновити versionCode в android/app/build.gradle');
fs.writeFileSync(GRADLE_FILE, patched);

run('git add package.json package-lock.json');
// Необов'язковий трейлер коміту (напр., Co-Authored-By, коли реліз робить асистент)
const trailer = process.env.RELEASE_COMMIT_TRAILER;
run(`git commit -m "реліз ${tag}"${trailer ? ` -m "${trailer.replace(/"/g, '')}"` : ''}`);
run(`git tag -a ${tag} -m "${tag}"`);

// ─── Збірка ──────────────────────────────────────────────────────────────────

// Лише arm64-v8a: телефон 64-бітний, а збірка так у рази швидша й APK менший.
// caffeinate — бо сон Mac посеред збірки вішає Gradle намертво.
// lintVital пропускаємо: для особистого APK він лише додає хвилини.
try {
  run('caffeinate -i ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a'
    + ' -x lintVitalRelease -x lintVitalAnalyzeRelease', {
    cwd: path.join(ROOT, 'android'),
    env: { ...process.env, JAVA_HOME: javaHome },
  });
} catch {
  fail(`Збірка впала. Коміт і тег ${tag} лишились лише локально — нічого не опубліковано.\n`
    + `  Виправ і збери знову: cd android && ./gradlew assembleRelease\n`
    + `  Або відкоти реліз: git tag -d ${tag} && git reset --hard HEAD~1`);
}

const apkOut = path.join(ROOT, 'dist', `AlphaTrainer-${tag}.apk`);
fs.mkdirSync(path.dirname(apkOut), { recursive: true });
fs.copyFileSync(APK_BUILT, apkOut);

// ─── Публікація ──────────────────────────────────────────────────────────────

run('git push origin main');
run(`git push origin ${tag}`);

const changes = out(`git log ${prevTag ? `${prevTag}..HEAD~1` : '-n 20 HEAD~1'} --no-merges --pretty=format:%s`)
  .split('\n')
  .filter((s) => s && !/^(docs|chore|test)\b|^реліз/.test(s))
  .map((s) => `- ${s}`)
  .join('\n');
const notesFile = path.join(os.tmpdir(), `alphatrainer-${tag}-notes.md`);
fs.writeFileSync(notesFile, `${changes || '- дрібні виправлення'}\n\n`
  + 'Встановлення: відкрий APK на телефоні — стане поверх, дані збережуться.\n');

run(`gh release create ${tag} "${apkOut}" --repo ${REPO} --title "AlphaTrainer ${version}" --notes-file "${notesFile}"`);

console.log(`\n✔ Реліз ${tag} опубліковано: https://github.com/${REPO}/releases/tag/${tag}`);
console.log('  Додаток запропонує оновлення при наступному запуску');
console.log('  (або вручну: Профіль → AI-моделі → «Перевірити оновлення»).');
