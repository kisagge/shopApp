import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **로그인하러 보낼 때는 돌아올 곳을 들고 간다.**
 *
 * 손님 화면이 로그인을 요구할 때 `redirect('/login')` 만 하면, 로그인한 뒤 첫 화면에 떨어진다 — 보려던 주문도,
 * 적립금 내역도 다시 찾아 들어가야 한다. 메일이나 알림에서 눌러 온 사람에게는 특히 나쁘다: 링크를 누른 값이
 * 사라진다.
 *
 * 대부분의 화면은 진작 `?next=` 를 들고 갔는데 **주문 상세·마이페이지·적립금 셋만 빠져 있었다.** 같은 화면군에서
 * 한쪽만 다른 것은 규칙이 아니라 습관이라, 다음에도 같은 자리에서 빠진다.
 */

const SHOP = join(process.cwd(), 'src', 'app', '(shop)');

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === 'page.tsx' ? [full] : [];
  });
}

describe('로그인으로 보낼 때', () => {
  const found = pages(SHOP).map((file) => ({ file, source: readFileSync(file, 'utf8') }));

  it('손님 화면을 실제로 훑었다 — 빈 목록이면 아래가 헛돈다', () => {
    expect(found.length).toBeGreaterThan(10);
    // 로그인을 요구하는 화면이 실제로 있어야 이 검사에 뜻이 있다
    expect(found.filter((p) => p.source.includes("'/login")).length).toBeGreaterThan(3);
  });

  it('돌아올 곳을 들고 간다', () => {
    const bare = found
      .filter((p) => /redirect\(\s*'\/login'\s*\)/.test(p.source))
      .map((p) => p.file.slice(SHOP.length + 1));

    expect(
      bare,
      '로그인한 뒤 첫 화면에 떨어진다. redirect(`/login?next=…`) 로 보던 자리를 들려 보낸다:\n' + bare.join('\n'),
    ).toEqual([]);
  });
});
