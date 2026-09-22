import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "이 상품이 매대에 서 있는가" 는 한 곳에서만 정한다.
 *
 * **왜 이 검사가 생겼는가.** 질의는 `onDisplay()` 한 쌍으로 거르는데, 손에 행을
 * 쥐고 같은 판단을 해야 하는 자리가 셋 있었다 — 재입고 알림 신청, 기획전 편집
 * 화면의 표시, 운영 상품 검색의 표시. 셋이 각자 조건을 적었고 **하나가 다른 답을
 * 냈다**: 상태를 `DRAFT`·`HIDDEN` 만 빼는 모양이어서 검수 대기 상품에 재입고
 * 알림을 걸 수 있었다. 매대에 없는 상품을 두고 들어오면 알려 주겠다고 한 셈이다.
 *
 * 그래서 판정은 core 의 `isOnDisplay` 하나다. 네 번째 자리가 생겨도 여기서 걸린다.
 *
 * **목록을 손으로 적지 않는다.** src 를 훑어 게시 여부를 손으로 재는 모양을 찾는다.
 */
const SRC = join(process.cwd(), 'src');

/**
 * 질의의 조건(where)은 여기 대상이 아니다 — Prisma 가 SQL 로 보내는 것이라
 * 순수 함수로 대신할 수 없고, 그 정본은 shelf.ts 의 onDisplay 다.
 */
const QUERY_SIDE = ['lib/queries/catalog/shelf.ts'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.ts') || name.endsWith('.tsx') ? [full] : [];
  });
}

/** 게시 여부를 손으로 재는 모양 — `publishedAt !== null` 옆에 상태 판단이 붙은 자리 */
function spellsItOut(source: string): boolean {
  return /publishedAt\s*!==\s*null/.test(source)
    && /(isVisibleStatus\(|status\s*!==\s*'(DRAFT|HIDDEN|PENDING_REVIEW)'|status\s*===\s*'ACTIVE')/.test(source);
}

const files = walk(SRC).map((path) => ({
  path: path.slice(SRC.length + 1),
  source: readFileSync(path, 'utf8'),
}));

describe('매대 판정', () => {
  it('실제로 파일을 읽는다 — 못 읽으면 이 검사는 아무것도 지키지 못한다', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.source.includes('isOnDisplay'))).toBe(true);
  });

  it('손으로 다시 적은 곳이 없다', () => {
    const offenders = files
      .filter((f) => !QUERY_SIDE.includes(f.path))
      .filter((f) => spellsItOut(f.source))
      .map((f) => f.path);

    expect(
      offenders,
      `매대 판정을 손으로 적었다:\n${offenders.join('\n')}\n` +
        'core 의 isOnDisplay 를 쓰면 된다 — 조건이 갈리면 검수 대기 상품이 매대에 선 것처럼 취급된다.',
    ).toEqual([]);
  });
});
