/**
 * Звіт про збій має бути придатним для надсилання.
 *
 * Тестувальник не читатиме логів — він надішле те, що бачить. Тож у звіті
 * мають бути версія, час, повідомлення й стек, і він не має бути нескінченним.
 */
import { crashReportText, CrashRecord } from '../components/ErrorBoundary';

const crash: CrashRecord = {
  at: '2026-09-20T10:00:00.000Z',
  message: 'undefined is not a function',
  stack: 'at Foo\nat Bar',
  componentStack: '\n    in Foo\n    in Bar',
  version: '1.7.0',
};

describe('звіт про збій', () => {
  it('містить версію, час і повідомлення', () => {
    const text = crashReportText(crash);
    expect(text).toContain('1.7.0');
    expect(text).toContain('2026-09-20');
    expect(text).toContain('undefined is not a function');
    expect(text).toContain('at Foo');
    expect(text).toContain('in Bar');
  });

  it('не розростається без меж — месенджери ріжуть довгі повідомлення', () => {
    const huge = { ...crash, stack: 'at Foo\n'.repeat(5000) };
    expect(crashReportText(huge).length).toBeLessThanOrEqual(4000);
  });

  it('переживає збій без стека', () => {
    const bare: CrashRecord = { at: crash.at, message: 'boom' };
    expect(crashReportText(bare)).toContain('boom');
    expect(crashReportText(bare)).toContain('?');
  });
});
