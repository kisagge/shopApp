import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **사는 걸음은 한 곳에 적는다.**
 *
 * 체크아웃으로 가서 결제 단추를 기다리고, 약관에 동의하고, 카드를 고르고, 누르고,
 * 주문 화면을 기다려 주소에서 번호를 뽑는 일곱 줄이 열 개 명세에 복사돼 있었다.
 * 단추의 접근성 이름(`원 결제하기`)을 바꾸는 순간 열 곳이 한꺼번에 졌고, 하이드레이션을
 * 기다리는 `ready` 를 빠뜨린 복사본도 섞여 있었다.
 *
 * **결제 화면 자체를 보는 명세는 예외다.** 가상계좌를 고르거나, 단추에 적힌 금액을
 * 누르기 직전에 확인하는 것이 그 명세의 요점이라면 손으로 두는 편이 맞다. 다만 그
 * 이유를 여기 적어 둔다 — 예외가 슬그머니 늘면 헬퍼는 있으나 마나다.
 */
const E2E = join(process.cwd(), 'e2e');

/** 결제 화면을 직접 모는 것이 요점인 명세들 */
const BY_HAND: Readonly<Record<string, string>> = {
  'checkout-total.spec.ts': '단추에 적힌 금액을 누르기 직전에 요약과 맞춰 본다',
  'deposit-webhook.spec.ts': '가상계좌를 고른다 — 카드가 아니다',
  'payment-confirm-customer.spec.ts': '결제수단마다 다른 결과를 본다(카드·가상계좌)',
};

const specs = readdirSync(E2E)
  .filter((name) => name.endsWith('.spec.ts'))
  .map((name) => ({ name, source: readFileSync(join(E2E, name), 'utf8') }));

/** 결제 단추를 손으로 누르는가 */
const clicksPay = (source: string) => /name: \/원 결제하기\/ \}\)\.click\(\)/.test(source);

describe('사는 걸음', () => {
  it('명세를 실제로 읽었다 — 못 읽으면 아래가 전부 헛돈다', () => {
    expect(specs.length).toBeGreaterThan(50);
    expect(specs.some((s) => s.source.includes('payWithCard'))).toBe(true);
  });

  it('손으로 모는 명세는 적어 둔 것뿐이다', () => {
    const offenders = specs
      .filter((s) => clicksPay(s.source))
      .map((s) => s.name)
      .filter((name) => !(name in BY_HAND));

    expect(
      offenders,
      `결제 걸음을 손으로 적었다:\n${offenders.join('\n')}\n` +
        'state.ts 의 payWithCard 를 쓰면 된다 — 단추 이름이나 기다림이 바뀌어도 한 곳만 고친다.',
    ).toEqual([]);
  });

  it('예외 목록에 죽은 줄이 없다 — 고친 뒤 남겨 두면 다음 사람이 믿는다', () => {
    const stale = Object.keys(BY_HAND).filter(
      (name) => !specs.some((s) => s.name === name && clicksPay(s.source)),
    );
    expect(stale, `이제 손으로 몰지 않는다: ${stale.join(', ')}`).toEqual([]);
  });
});
