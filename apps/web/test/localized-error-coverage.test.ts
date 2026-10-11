import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 창구가 내보내는 오류 문구는 **사전을 지난다.**
 *
 * **열쇠가 그대로 나가고 있었다.** 도메인 오류의 `message` 는 사전 열쇠다(`err.order.outOfStock`) —
 * `apiError` 가 그것을 이 요청의 말로 바꿔 주는데, **더 실을 것이 있어 말미를 손으로 만드는
 * 창구들**은 그 길을 지나지 않았다(주문의 `variantIds`, 탈퇴의 `blocks`, 결제의 `retryable`).
 * 그 창구가 `message: error.message` 를 적어 두면 화면에는 `err.order.outOfStock` 이 글자 그대로
 * 뜬다 — 화면은 받은 말을 그대로 보여 주기 때문이다(`failureMessage`, `setError(data.message)`).
 *
 * **가장 아픈 자리가 주문 생성이었다.** 재고가 모자라 결제가 막히는 순간, 손님은 까닭 대신
 * 열쇠를 봤다. 그 자리에 검사가 없었고, 옆 검사(`api-error-coverage`)는 **말미가 전부 정형일
 * 때만** 잡으므로 더 실을 것이 있는 이 창구들은 모두 빠져나갔다.
 *
 * 그래서 규칙을 뒤집는다 — **어느 창구도 `error.message` 를 그대로 내보내지 않는다.** 번역은
 * `apiError` 나 `localizedMessage` 한 곳에서 한다. 새 창구는 자동으로 이 검사에 걸린다.
 */

const API = join(process.cwd(), 'src', 'app', 'api');

/**
 * 그대로 내보내도 되는 자리와 **그 이유**.
 *
 * 이유 없이 이름만 적는 것은 목록으로 되돌아가는 것과 같다.
 */
const EXEMPT: Readonly<Record<string, string>> = {};

function routes(dir: string, prefix = ''): { rel: string; source: string }[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routes(full, `${prefix}${entry}/`);
    return entry === 'route.ts' ? [{ rel: `${prefix}${entry}`, source: readFileSync(full, 'utf8') }] : [];
  });
}

const ALL = routes(API);
/** 번역을 지나지 않고 문구를 그대로 싣는 자리 */
const RAW = /message: error\.message/;

describe('오류 문구는 사전을 지난다', () => {
  it('훑을 창구가 실제로 있다', () => {
    // 폴더를 못 읽으면 아래 검사가 전부 통과해 버린다
    expect(ALL.length).toBeGreaterThan(40);
  });

  it('면제 목록에 사라진 창구가 없다', () => {
    const names = new Set(ALL.map((r) => r.rel));
    for (const rel of Object.keys(EXEMPT)) expect(names, rel).toContain(rel);
  });

  it.each(ALL.filter((r) => !(r.rel in EXEMPT)).map((r) => [r.rel, r.source] as const))(
    '%s 는 문구를 그대로 내보내지 않는다',
    (rel, source) => {
      expect(RAW.test(source), `${rel} — apiError 나 localizedMessage 를 지나게 하세요`).toBe(false);
    },
  );
});

/**
 * **가장 아픈 자리를 이름으로 못 박는다.**
 *
 * 위 훑기는 폴더를 돌아 모두를 본다. 그래도 이 둘은 따로 적는다 — 재고가 모자라 결제가 막히는
 * 순간과 일부 취소가 막히는 순간이 손님이 오류 문구를 가장 자주 만나는 자리이고, 그때 열쇠가
 * 떴다. 훑기를 느슨하게 고치는 날에도 이 둘은 남는다.
 */
describe('손님이 가장 자주 만나는 자리', () => {
  const read = (rel: string) =>
    readFileSync(join(API, ...rel.split('/')), 'utf8');

  it.each([
    ['주문 생성', 'orders/route.ts'],
    ['일부 취소', 'orders/[orderNo]/cancel-items/route.ts'],
  ])('%s 창구는 번역을 지난다', (_label, rel) => {
    const source = read(rel);

    expect(source).toContain('localizedMessage(error)');
    expect(source).not.toContain('message: error.message');
  });
});

/**
 * **열쇠를 들고 있는 오류가 실제로 번역되는가.**
 *
 * 위 검사는 "그대로 내보내지 않는다" 까지만 본다. 그 길이 정말 사전을 지나는지는 번역 함수를
 * 직접 불러 확인한다 — 손님이 결제에서 가장 자주 만나는 열쇠 둘로.
 */
describe('번역을 지나면 사람의 말이 된다', () => {
  it('재고 부족·가격 변동 열쇠가 문장으로 바뀐다', async () => {
    const { localizedMessage } = await import('~/lib/api/respond');

    for (const key of ['err.order.outOfStock', 'err.order.priceChanged']) {
      const text = await localizedMessage({ message: key });
      expect(text, key).not.toBe(key);
      expect(text, key).toMatch(/[가-힣]/);
    }
  });

  /** 아직 안 옮긴 자리도 오늘 하던 대로 — 열쇠가 아니면 그대로 내보낸다 */
  it('열쇠가 아니면 그대로 둔다', async () => {
    const { localizedMessage } = await import('~/lib/api/respond');

    expect(await localizedMessage({ message: '이미 처리된 신청입니다.' })).toBe('이미 처리된 신청입니다.');
  });
});
