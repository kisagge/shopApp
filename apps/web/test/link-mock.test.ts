import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * `next/link` 를 흉내 내면 `useLinkStatus` 도 함께 내놔야 한다.
 *
 * `AppLink` 가 이동 중 표시를 위해 그 훅을 쓴다. `vi.mock` 은 모듈을
 * **통째로** 바꾸므로, 흉내에 그 이름이 없으면 링크를 그리는 순간
 * "No export is defined" 로 터진다 — 검사 세 개가 실제로 그렇게 깨졌다.
 *
 * 고칠 자리가 흉내마다 흩어져 있어 다음 사람이 새 흉내를 만들 때 또 겪는다.
 * 여기서 미리 걸린다.
 */

const TEST_DIR = resolve(import.meta.dirname);

const mocks = readdirSync(TEST_DIR)
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => ({ file: f, source: readFileSync(join(TEST_DIR, f), 'utf8') }))
  .filter(({ source }) => /vi\.mock\(\s*['"]next\/link['"]/.test(source));

describe('next/link 흉내', () => {
  it('찾는 것이 있다 — 흉내가 하나도 없으면 아래가 헛돈다', () => {
    expect(mocks.length).toBeGreaterThan(2);
  });

  it('전부 useLinkStatus 를 함께 내놓는다', () => {
    const missing = mocks
      .filter(({ source }) => {
        const at = source.search(/vi\.mock\(\s*['"]next\/link['"]/);
        // 그 흉내의 몸통만 본다 — 파일 어딘가에 있는 것으로는 부족하다
        const body = source.slice(at, source.indexOf('}));', at));
        return !body.includes('useLinkStatus');
      })
      .map(({ file }) => file);

    expect(missing, 'AppLink 가 useLinkStatus 를 쓴다. 흉내에 없으면 링크를 그릴 때 터진다').toEqual(
      [],
    );
  });
});
