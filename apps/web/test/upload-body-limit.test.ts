import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_IMAGE_BYTES, uploadBodyLimit } from '@shop/core';
import { bodyTooLarge } from '~/lib/api/body-size';

/**
 * **`formData()` 를 부르기 전에 본문을 끊는지 본다.**
 *
 * `await request.formData()` 한 줄이 끝나는 순간 **본문 전체가 이미 메모리에 올라와 있다.**
 * 그런데 여섯 자리가 그 아래에서 `file.size` 를 보며 "바이트를 메모리에 올리기 전에 크기를
 * 먼저 본다" 고 적어 두었다 — 파일 하나를 `arrayBuffer()` 로 다시 읽는 것에 비하면 맞는
 * 말이지만 **본문에 대해서는 틀린 말이었다.** 5MB 상한을 두고 500MB 를 다 받아 낸 뒤에
 * 거절하는 셈이었고, 주석이 정확히 그 고장을 "막는다" 고 적고 있었다.
 *
 * 되돌아오기 쉽다. 업로드 창구를 새로 만드는 가장 쉬운 길은 옆 파일을 복사하는 것이고,
 * `formData()` 는 그 자체로 자연스러워 보인다. 그래서 **순서를 검사한다** — 가드가 있는
 * 것만으로는 모자라고, `formData()` **앞**에 있어야 한다.
 */

const SRC = join(process.cwd(), 'src');

/** 본문을 폼으로 읽는 파일들 — 폴더에서 찾는다 */
function formReaders(): { path: string; code: string }[] {
  const out: { path: string; code: string }[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.ts')) continue;
      /*
       * **주석을 걷어내고 본다.** 안 걷으면 가드 모듈 자신이 식구가 된다 — 그 파일의 설명이
       * `request.formData()` 를 인용하기 때문이다. 순서를 재는 아래 검사도 주석에 속는다.
       */
      const code = readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      if (!/request\.formData\(\)/.test(code)) continue;
      out.push({ path: full.replace(SRC, '').replaceAll('\\', '/'), code });
    }
  };
  walk(SRC);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const READERS = formReaders();

/**
 * 파일을 받지 않는 폼 전송 — 끊을 본문이 없다.
 *
 * 이유 없이 빼면 그게 구멍이다. 둘 다 칸 하나를 받아 쿠키를 굽는 자리라, 상한을 걸면
 * 막는 것은 없고 429·413 의 JSON 이 사람에게 그대로 보이는 쪽만 생긴다.
 */
const NO_FILES: Readonly<Record<string, string>> = {
  '/app/api/locale/route.ts': '언어 한 칸을 받아 쿠키를 굽는다. 파일 칸이 없다.',
  '/app/api/theme/route.ts': '밝기 한 칸을 받아 쿠키를 굽는다. 파일 칸이 없다.',
};

describe('업로드 본문 상한', () => {
  it('폼으로 읽는 자리를 실제로 찾았다 — 찾기가 고장 나면 아래가 조용히 통과한다', () => {
    expect(READERS.length).toBeGreaterThanOrEqual(6);
  });

  it('면제 목록에 사라진 파일이 없다', () => {
    const paths = new Set(READERS.map((r) => r.path));
    for (const path of Object.keys(NO_FILES)) expect(paths, path).toContain(path);
  });

  it.each(READERS.filter((r) => !(r.path in NO_FILES)).map((r) => [r.path, r.code] as const))(
    '%s 는 formData() 보다 먼저 본문을 끊는다',
    (_path, code) => {
      const guard = code.indexOf('bodyTooLarge(');
      const read = code.indexOf('request.formData()');

      expect(guard, 'bodyTooLarge 를 부르지 않는다 — 본문이 다 올라온 뒤에 거절하게 된다')
        .toBeGreaterThanOrEqual(0);
      expect(guard, 'bodyTooLarge 가 formData() 뒤에 있다 — 그 줄이 끝나면 이미 다 올라와 있다')
        .toBeLessThan(read);
    },
  );
});

/**
 * 문지기 자체.
 *
 * **한계를 검사로도 적어 둔다.** 이 가드는 작정한 쪽을 막지 못한다 — Content-Length 가 없는
 * 요청은 그냥 통과한다. 그 사실을 검사에 남겨 두지 않으면 다음 사람이 "본문 상한이 있다" 로
 * 읽고, 그것이 바로 이 결함을 만든 종류의 오해다.
 */
describe('본문 상한을 재는 법', () => {
  const req = (headers: Record<string, string>) =>
    new Request('http://localhost/api/x', { method: 'POST', headers });

  it('상한을 넘으면 끊는다', () => {
    expect(bodyTooLarge(req({ 'content-length': String(uploadBodyLimit(1) + 1) }), 1)).toBe(true);
  });

  it('상한까지는 받는다 — 정상 업로드를 막으면 안 된다', () => {
    expect(bodyTooLarge(req({ 'content-length': String(uploadBodyLimit(1)) }), 1)).toBe(false);
  });

  it('파일을 여러 장 받는 창구는 상한도 그만큼이다', () => {
    const five = uploadBodyLimit(5);

    expect(five).toBeGreaterThan(uploadBodyLimit(1));
    expect(bodyTooLarge(req({ 'content-length': String(five) }), 5)).toBe(false);
    expect(bodyTooLarge(req({ 'content-length': String(five + 1) }), 5)).toBe(true);
  });

  it('Content-Length 가 없으면 통과한다 — 읽기 전에 알 수 있는 값이 없다', () => {
    expect(bodyTooLarge(req({}), 1)).toBe(false);
  });

  /** 헤더 값에는 ASCII 만 들어간다 — 글자가 아닌 값은 이 모양으로 온다 */
  it('숫자가 아니면 통과한다 — 파일별 검사가 여전히 본다', () => {
    expect(bodyTooLarge(req({ 'content-length': 'abc' }), 1)).toBe(false);
  });

  /** 한 장 상한이 파일 상한보다 커야 한다 — 경계·헤더·JSON 칸이 그만큼 차지한다 */
  it('여유를 둔다 — 딱 5MB 로 끊으면 정상 업로드가 막힌다', () => {
    expect(uploadBodyLimit(1)).toBeGreaterThan(MAX_IMAGE_BYTES);
  });
});
