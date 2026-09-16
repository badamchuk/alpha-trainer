import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkForUpdate, compareVersions, parseRelease, parseVersion } from '../services/updates';

// Встановлена версія для тестів
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.1.0' } },
}));

const release = (tag: string, over: Record<string, unknown> = {}) => ({
  tag_name: tag,
  body: '- feat: калорії по вправах',
  html_url: `https://github.com/badamchuk/alpha-trainer/releases/tag/${tag}`,
  draft: false,
  prerelease: false,
  assets: [
    { name: 'AlphaTrainer-' + tag + '.apk', browser_download_url: `https://example.com/${tag}.apk` },
  ],
  ...over,
});

const respond = (status: number, body?: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

describe('parseVersion / compareVersions', () => {
  it('розбирає тег з префіксом v і без', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('1.2.3-beta')).toEqual([1, 2, 3]);
    expect(parseVersion('latest')).toBeNull();
  });

  it('порівнює числами, а не рядками', () => {
    // рядкове порівняння дало б '1.10.0' < '1.9.0'
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('v1.1.0', '1.1.0')).toBe(0);
    expect(compareVersions('1.0.9', '1.1.0')).toBeLessThan(0);
  });
});

describe('parseRelease', () => {
  it('дістає версію, опис і посилання на APK', () => {
    expect(parseRelease(release('v1.2.0'))).toEqual({
      version: '1.2.0',
      notes: '- feat: калорії по вправах',
      apkUrl: 'https://example.com/v1.2.0.apk',
      pageUrl: 'https://github.com/badamchuk/alpha-trainer/releases/tag/v1.2.0',
    });
  });

  it('реліз без APK веде на сторінку релізу', () => {
    expect(parseRelease(release('v1.2.0', { assets: [] }))?.apkUrl).toBeNull();
  });

  it('чернетки, пре-релізи й сміття не пропонує', () => {
    expect(parseRelease(release('v1.2.0', { draft: true }))).toBeNull();
    expect(parseRelease(release('v1.2.0', { prerelease: true }))).toBeNull();
    expect(parseRelease(release('nightly'))).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
});

describe('checkForUpdate', () => {
  const fetchMock = jest.fn();

  beforeEach(async () => {
    await AsyncStorage.clear();
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('знаходить новішу версію', async () => {
    fetchMock.mockReturnValue(respond(200, release('v1.2.0')));
    expect((await checkForUpdate())?.version).toBe('1.2.0');
  });

  it('та сама версія — оновлення немає', async () => {
    fetchMock.mockReturnValue(respond(200, release('v1.1.0')));
    expect(await checkForUpdate()).toBeNull();
  });

  it('релізів ще немає (404) — не помилка', async () => {
    fetchMock.mockReturnValue(respond(404));
    expect(await checkForUpdate(true)).toBeNull();
  });

  it('між автоперевірками бере кеш і не смикає мережу', async () => {
    fetchMock.mockReturnValue(respond(200, release('v1.2.0')));
    await checkForUpdate();
    expect((await checkForUpdate())?.version).toBe('1.2.0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ручна перевірка йде в мережу завжди', async () => {
    fetchMock.mockReturnValue(respond(200, release('v1.2.0')));
    await checkForUpdate();
    await checkForUpdate(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('помилку мережі віддає нагору, щоб її показати', async () => {
    fetchMock.mockReturnValue(respond(500));
    await expect(checkForUpdate(true)).rejects.toThrow('500');
  });
});
