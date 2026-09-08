import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COMMERCE_EVENT, SERVER_ONLY_EVENT } from '@shop/core';

/**
 * 이름만 있고 아무도 안 보내는 이벤트를 남기지 않는다.
 *
 * **어드민 대시보드가 이 이름들을 읽는다.** 목록에는 있는데 보내는 곳이
 * 없으면 화면은 조용히 0 을 그린다 — 아무도 그 단계를 밟지 않은 것과
 * 구분되지 않아서, 빠졌다는 사실을 영영 모른다. 실제로 add_shipping_info
 * 하나가 그렇게 남아 있었다.
 *
 * **목록을 손으로 적지 않는다.** core 가 가진 이름을 그대로 받아, 앱
 * 소스에서 실제로 보내는 자리를 찾는다. 이름을 하나 더 만들면 그 순간
 * 보내는 곳을 만들 때까지 진다.
 */
const SRC = join(process.cwd(), 'src');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [readFileSync(path, 'utf8')] : [];
  });
}

const ALL = sources(SRC).join('\n');

/**
 * 보내는 자리인가.
 *
 * **읽는 자리와 갈라야 한다.** 어드민 조회가 `name in ('view_item', …)`
 * 처럼 이름을 쓰기도 하는데, 그건 보내는 것이 아니다. 브라우저는 track,
 * 서버는 recordServerEvent 를 쓰므로 그 두 모양만 센다.
 */
function isEmitted(name: string): boolean {
  return (
    new RegExp(`track\\(\\s*'${name}'`).test(ALL) ||
    new RegExp(`recordServerEvent\\(\\s*\\{?[^)]*name:\\s*'${name}'`).test(ALL)
  );
}

describe('이커머스 이벤트', () => {
  it('앱 소스를 실제로 읽어 온다 — 못 읽으면 아래 검사가 늘 통과한다', () => {
    expect(ALL.length).toBeGreaterThan(100_000);
    expect(isEmitted('view_item')).toBe(true);
  });

  it.each([...COMMERCE_EVENT])('%s 를 보내는 곳이 있다', (name) => {
    expect(
      isEmitted(name),
      `${name} 이 목록에만 있고 보내는 곳이 없다. 보내거나, core 의 목록에서 뺀다.`,
    ).toBe(true);
  });

  it('브라우저가 매출 이벤트를 보내지 않는다', () => {
    // 서버만 보내야 하는 것을 track 으로 보내면 누구나 매출을 지어낼 수 있다
    for (const name of SERVER_ONLY_EVENT) {
      expect(new RegExp(`track\\(\\s*'${name}'`).test(ALL), `${name} 은 서버만 보낸다`).toBe(false);
    }
  });
});
