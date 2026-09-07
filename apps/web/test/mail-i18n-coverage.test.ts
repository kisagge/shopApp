import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 메일 문안에 말을 박아 두지 않는다.
 *
 * 화면 쉰두 장을 세 말로 옮기는 동안 **메일 넷은 한국어로 남아 있었다.**
 * 눈에 안 띄는 이유가 있다 — 메일은 화면이 아니라서 훑어도 안 나오고,
 * 받는 사람은 대개 우리가 아니다.
 *
 * 이제 문안은 사전을 거친다. 다시 박히는 것을 여기서 막는다.
 */

const ROOT = join(__dirname, '..', '..', '..');

/**
 * 문안이 사는 곳.
 *
 * core 에는 두지 않는다 — 의존성이 없는 순수 정책 묶음이라 사전을 가져올 수
 * 없고, 그래서 거기 두면 반드시 한 말로 굳는다. 실제로 그렇게 굳어 있었다.
 */
const BUILDERS = [
  'apps/web/src/lib/orders/notify.ts',
  'apps/web/src/lib/mail/notices.ts',
  'packages/auth/src/mail.ts',
];

/**
 * 운영자에게 가는 것은 예외다.
 *
 * 오류 리포트는 **받는 사람이 우리**다. 우리 말로 오는 것이 맞고, 여기에
 * 사전을 끼우면 운영자가 자기 브라우저 말에 따라 다른 리포트를 받는다.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  'apps/web/src/lib/errors/index.ts': '오류 리포트는 손님이 아니라 운영진에게 간다.',
};

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * 볼 것만 남긴다.
 *
 * 주석은 뺀다 — 주석의 한국어는 이 저장소의 규칙이다.
 *
 * **로그도 뺀다.** 처음 이 검사를 쓸 때 `console.error('[order] 안내 메일
 * 발송 실패')` 가 걸렸는데, 그건 문안이 아니라 **우리가 읽는 글**이다.
 * 로그를 사전에 넣으면 운영자가 자기 브라우저 말에 따라 다른 로그를 본다.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^.*console\.\w+.*$/gm, '');
}

describe('메일 문안이 사전을 거친다', () => {
  it('문안 파일이 모두 제자리에 있다', () => {
    // 경로가 어긋나면 아래 검사가 조용히 통과한다
    for (const rel of BUILDERS) expect(existsSync(join(ROOT, rel)), rel).toBe(true);
  });

  it.each(BUILDERS)('%s 에 한국어가 박혀 있지 않다', (rel) => {
    const source = code(read(rel));
    const hangul = [...source.matchAll(/'[^']*[가-힣][^']*'/g)].map((m) => m[0]);

    expect(
      hangul,
      `${rel} 에 문구가 박혀 있다. 사전 열쇠로 옮긴다:\n${hangul.join('\n')}`,
    ).toEqual([]);
  });

  it.each(BUILDERS)('%s 가 번역기를 쓴다', (rel) => {
    // 한국어가 없다고 번역되는 것은 아니다 — 영어로 박아 둬도 위 검사는 통과한다
    expect(read(rel)).toContain('createTranslator');
  });

  it('core 에는 문안이 남아 있지 않다', () => {
    /*
     * core 는 사전을 못 가져오므로, 여기 문구가 생기면 그 순간 한 말로 굳는다.
     * 껍데기(mailShell)와 이스케이프만 남아야 한다.
     */
    const source = code(read('packages/core/src/mail.ts'));
    const hangul = [...source.matchAll(/'[^']*[가-힣][^']*'/g)].map((m) => m[0]);
    expect(hangul, `core/mail.ts 에 문구가 돌아왔다:\n${hangul.join('\n')}`).toEqual([]);
  });

  it('면제한 자리는 이유가 적혀 있고 실제로 존재한다', () => {
    for (const [rel, reason] of Object.entries(EXEMPT)) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
      expect(reason.trim().length, rel).toBeGreaterThan(10);
    }
  });
});
