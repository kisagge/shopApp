import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 로그아웃은 문이 하나다.
 *
 * 웹에서 로그아웃은 서버 세션을 끊는 것으로 끝난다. **앱에서는 한 가지가 더 있다** —
 * 셸은 로그인 응답의 토큰을 기기에 넣어 두고 요청마다 Bearer 로 붙인다(@shop/native).
 * 서버 세션만 끊고 그 토큰을 남기면, 다음에 앱을 켠 사람은 **서버가 거절할 때까지
 * 로그인한 것처럼 보인다** — 헤더에는 이름이 뜨는데 들어갈 수 있는 화면이 없다.
 *
 * 그래서 `signOutEverywhere` 가 있다. 그런데 그 옆에 `authClient.signOut` 이 그대로
 * 있고, 한 글자 짧은 쪽이 손에 먼저 닿는다. 그 선택은 **브라우저에서는 아무 차이가
 * 없어서**, 웹으로 눌러 보는 동안에는 틀린 것이 드러나지 않는다.
 *
 * 손 목록을 쓰지 않는다 — 폴더를 걸어 다니며 로그아웃을 말하는 파일을 모은다.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(path, 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const webFiles = walk(join(ROOT, 'apps', 'web', 'src'));
const rel = (path: string) => path.slice(ROOT.length + 1);

/** 로그아웃을 말하는 파일 — 서버 창구든 화면이든 */
const mentionsSignOut = webFiles.filter((f) => /\bsignOut\b/.test(read(f)));

describe('로그아웃하는 자리', () => {
  it('로그아웃을 말하는 자리가 있다 — 이름이 바뀌면 이 그물이 빈손이 된다', () => {
    expect(mentionsSignOut.length).toBeGreaterThan(0);
  });

  it.each(mentionsSignOut.map((f) => [rel(f), f] as const))('%s — 문을 지난다', (name, file) => {
    const source = read(file);
    /*
     * 두 가지만 허용한다.
     * 1. `signOutEverywhere` — 서버 세션과 기기의 토큰을 함께 지우는 문
     * 2. `auth.api.signOut` — 서버에서 세션만 끊는 자리. 기기 저장소는 서버에서 만질 수
     *    없으니 여기서 할 수 있는 일이 아니다. 그 대신 **그것을 부르는 화면이 문을
     *    지나는지**를 아래에서 증명한다.
     */
    const throughDoor = source.includes('signOutEverywhere') || source.includes('auth.api.signOut');
    expect(throughDoor, `${name} 이 서버 세션만 끊고 기기의 토큰을 남긴다`).toBe(true);
  });

  it('서버에서 끊는 자리는 그것을 부르는 화면이 문을 지나므로 면제다', () => {
    // 면제를 말로 적지 않고 증명한다 — 탈퇴 폼이 문을 지나지 않게 되면 여기서 진다
    const serverOnly = mentionsSignOut.filter(
      (f) => read(f).includes('auth.api.signOut') && !read(f).includes('signOutEverywhere'),
    );
    expect(serverOnly.map(rel)).toEqual(['apps/web/src/app/api/account/close/route.ts']);

    const form = read(join(ROOT, 'apps', 'web', 'src', 'components', 'close-account-form.tsx'));
    expect(form).toContain('signOutEverywhere');
    expect(form).toContain('/api/account/close');
  });
});

/**
 * 주석을 떼고 코드만 본다.
 *
 * 이 그물을 처음 돌렸을 때 **주석에 적어 둔 옛 코드 한 줄에 걸려서** 졌다 — 지운 수출을
 * 왜 지웠는지 적으려고 그 줄을 그대로 인용했더니, 글자를 찾는 그물에는 그것이 살아 있는
 * 코드로 보였다. 까닭을 적은 것이 그물을 깨우는 일이 되면 아무도 까닭을 안 적는다.
 */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('문 자체', () => {
  const client = () => codeOnly(read(join(ROOT, 'packages', 'auth', 'src', 'client.ts')));

  it('서버 세션을 끊고 나서 기기의 토큰도 지운다', () => {
    expect(client()).toMatch(/finally\s*\{[^}]*clearSessionToken/);
  });

  it('서버 쪽이 실패해도 토큰은 지운다', () => {
    /*
     * `finally` 여야 한다. 망이 끊긴 채로 로그아웃을 누르면 서버 요청은 실패하는데,
     * 그때 토큰을 남기면 **로그아웃했다고 생각한 사람의 기기에 자격증명이 남는다.**
     * 서버 세션은 아직 살아 있으니 그 토큰은 실제로 쓸 수 있는 값이다.
     */
    const body = /export async function signOutEverywhere[\s\S]*?\n\}/.exec(client())?.[0] ?? '';
    expect(body).toContain('try');
    expect(body).toContain('finally');
    expect(body.indexOf('finally')).toBeLessThan(body.indexOf('clearSessionToken'));
  });

  it('짧은 쪽 이름을 다시 내보내지 않는다', () => {
    /*
     * `export const { … signOut … } = authClient` 가 있었고 들여오는 곳은 한 군데도
     * 없었다. 쓰지 않는 수출이라 군살이기만 하면 두어도 되지만, 그 안에 틀린 문이 있다.
     */
    expect(client()).not.toMatch(/export const \{[^}]*\bsignOut\b/);
  });
});
