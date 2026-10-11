import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { DICTIONARIES } from '@shop/i18n/all';

/**
 * 손님에게 가는 오류 문구가 **세 언어로** 나가는지 지킨다.
 *
 * 검증 실패(`valid.*`)는 진작에 이 길로 옮겼는데, 도메인 오류는 아니었다 — 오류 클래스 서른아홉 개가
 * 한국어 문장을 품고 있었고, 그 문장이 `apiError` 를 지나 그대로 나갔다. **일본어로 주문하던 사람이
 * 재고가 모자랄 때만 한국어를 봤다.** 화면은 서버가 준 message 를 그대로 보여 주므로 눈에 띄지도 않는다.
 *
 * 되돌아오기 쉽다. 새 오류를 더할 때 옆줄을 복사하는 것이 가장 손쉬운 길이고, **한국어로 보면 멀쩡하다.**
 *
 * ── 볼 파일을 손으로 적지 않는다 ─────────────────────────────
 * **손 목록이어서 셋이 빠져 있었다.** 일부 취소(손님이 누른다)·쿠폰 받기·부분 취소 셈이 목록 밖에
 * 있었고, 거기서 나간 문구는 한국어였다 — 일본어로 일부 취소를 눌렀다가 막힌 사람은 한국어 문장을
 * 봤다. 저장소는 다른 훑기에서 이미 배운 것이다: **손 목록은 늘 늦게 자란다**(`rate-limit-coverage`).
 *
 * 그래서 뒤집는다 — **손님 창구에서 import 를 따라가** 닿는 파일을 찾는다(`api/` 중 운영·배치·
 * auth 를 뺀 것이 손님 창구다). 새 창구를 만들거나 새 파일을 부르면 자동으로 이 검사에 들어온다.
 *
 * **같은 파일을 운영과 나눠 쓰는 자리가 있다**(manage-coupon 은 손님의 코드 등록과 운영의 쿠폰
 * 관리를 함께 담는다). 파일 단위로는 그 둘을 가를 수 없으므로, 운영만 보는 문구는 아래 EXEMPT 에
 * **문장째로** 이유와 함께 남긴다 — 파일을 빼면 그 파일의 손님 문구까지 안 보게 된다.
 *
 * ── 운영 화면은 한국어다 ─────────────────────────────────────
 * 운영진이 쓰는 화면은 한국어라고 정해 두었다(api/respond 의 주석). 그래서 여기서 보는 것은 **손님이
 * 닿는 자리**뿐이다 — 아래 목록이 그 자리다. 운영 전용 문구는 한국어로 남아 있어도 된다.
 */

const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * 손님 창구가 닿는 파일 — **폴더에서 찾는다.**
 *
 * 창구(`api/…/route.ts`)에서 시작해 `~/` 와 `@shop/core` import 를 두 단계까지 따라간다. 두
 * 단계면 창구 → 서비스 → 정책까지 닿는다(그 아래는 조회·저장이라 사람에게 문구를 내보내지 않는다).
 */
const WEB = join(ROOT, 'apps', 'web', 'src');
const CORE = join(ROOT, 'packages', 'core', 'src');

/** 손님이 부르지 않는 창구 — 운영·배치·Better Auth */
const NOT_CUSTOMER = /^api\/(admin|cron|auth)\//;

function routeFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full, `${prefix}${entry}/`);
    return entry === 'route.ts' && !NOT_CUSTOMER.test(`${prefix}${entry}`) ? [full] : [];
  });
}

/** `~/lib/x` · `@shop/core/…` 를 실제 파일로 */
function resolveImport(spec: string): string | null {
  const base = spec.startsWith('~/')
    ? join(WEB, spec.slice(2))
    : spec === '@shop/core'
      ? null
      : null;
  if (base === null) return null;
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** core 는 패키지 하나를 통째로 내보내므로, 창구가 쓰는 이름으로 파일을 찾는다 */
const coreFiles = (): string[] =>
  readdirSync(CORE)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => join(CORE, f));

function reachable(): string[] {
  const seen = new Set<string>();
  let frontier = routeFiles(join(WEB, 'app', 'api'));
  for (let depth = 0; depth < 2; depth += 1) {
    const next: string[] = [];
    for (const file of frontier) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from '(~\/[^']+)'/g)) {
        const resolved = resolveImport(match[1]!);
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved);
          next.push(resolved);
        }
      }
    }
    frontier = next;
  }
  /*
   * core 는 손님 창구가 거의 다 거쳐 간다(금액·주문 상태·반품 규칙). 파일 하나씩 따라가는
   * 대신 통째로 본다 — 운영만 쓰는 core 파일의 한국어 이름표는 EXEMPT 가 가른다.
   */
  return [...seen, ...coreFiles()].map((f) => relative(ROOT, f));
}

const CUSTOMER_FACING = reachable();

/**
 * 한국어로 남겨 둔 자리. **이유와 함께 적는다.**
 *
 * 한 파일의 오류가 전부 손님 것은 아니다 — 같은 표에 운영진만 보는 줄이 섞여 있다.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  "'처리할 신고가 없습니다.'": '운영진이 신고를 내리는 자리다 — 손님은 닿지 않는다',
};

/**
 * 손님 창구에서 **지나가며 닿지만** 그 문구는 운영·가맹점만 보는 파일.
 *
 * 창구에서 import 를 따라가면 운영 전용 파일에도 닿는다(가상계좌 입금 확인이 late-deposit 을
 * 부르는 식). 그 파일의 한국어는 운영 화면의 말이라 그대로 두는 것이 맞다.
 *
 * **손님이 부르는 함수가 섞여 있으면 그 이름을 적는다** — 아래 검사가 그 함수만 따로 본다.
 * 그래야 "운영 파일이다" 라는 면제가 손님 문구까지 가리지 않는다.
 */
const EXEMPT_FILE: Readonly<Record<string, { reason: string; customerFns?: readonly string[] }>> = {
  'apps/web/src/lib/admin/late-deposit.ts': {
    reason: '취소 뒤 입금을 운영진이 돌려주는 자리. 손님은 이 함수를 부르지 않는다.',
  },
  'apps/web/src/lib/admin/manage-coupon.ts': {
    reason: '쿠폰 발행·수정은 운영 화면이다.',
    // 손님은 코드 등록 하나만 부른다(api/coupons/claim)
    customerFns: ['claimCouponByCode'],
  },
  'apps/web/src/lib/admin/manage-shipment.ts': { reason: '송장 등록은 운영·가맹점 일이다.' },
  'apps/web/src/lib/admin/refund-order.ts': { reason: '환불 집행은 운영진이 한다.' },
  'apps/web/src/lib/admin/transition-order.ts': { reason: '주문 상태 변경은 운영 콘솔의 동작이다.' },
  'apps/web/src/lib/orders/complete-exchange.ts': { reason: '교환 발송은 가맹점·운영진이 처리한다.' },
  'apps/web/src/lib/orders/complete-return.ts': { reason: '회수 확인·환불은 가맹점·운영진이 처리한다.' },
  'apps/web/src/lib/orders/order-notes.ts': { reason: '주문 내부 메모는 운영진만 읽고 쓴다.' },
  'apps/web/src/lib/orders/return-address.ts': { reason: '반품지 설정은 가맹점·운영진 일이다.' },
  'apps/web/src/lib/orders/return-request.ts': {
    reason: '승인·반려(resolveReturn)는 운영·가맹점 화면이다.',
    // 손님이 부르는 둘 — 신청과 철회
    customerFns: ['requestReturn', 'cancelOwnReturn'],
  },
  'apps/web/src/lib/reviews/reply.ts': { reason: '리뷰 답글은 가맹점·운영진이 쓴다.' },
  'apps/web/src/lib/storage/index.ts': {
    reason: '저장소 설정이 빠진 서버 고장이다. 사람에게 보여 줄 말이 아니라 배포를 고칠 말이다.',
  },
};

/** 오류를 만드는 자리. 두 번째 인자가 문구다 */
const THROW = /new [A-Z][A-Za-z]*Error\(\s*'[^']*'\s*,\s*('[^']*')/g;

/**
 * **오류 문구 표만 본다.**
 *
 * 전에는 `CODE: '문구',` 꼴을 전부 표로 봤는데, 그 모양은 **운영 화면 이름표**(`ORDER_STATUS_LABEL`
 * 의 '입금대기', `POLICY_KIND_LABEL` 의 '이용약관')와 똑같다. 그래서 폴더에서 파일을 찾기 시작하자
 * 이름표 표 열두 개가 "번역 안 된 오류" 로 걸렸다 — 거짓 양성이 쌓이면 사람은 검사를 끈다.
 *
 * 가르는 것은 표의 **이름**이다: 오류 문구 표는 `…_ERROR` · `…_MESSAGE` 로 끝난다.
 */
const ERROR_TABLE = /^export const [A-Z_]*(?:ERROR|MESSAGE)[A-Z_]*(?::[^=]+)?= \{\n([\s\S]*?)^\};$/gm;
const TABLE_LINE = /^\s{2}[A-Z_]+: ('[^']*'|`[^`]*`),$/gm;

/** 검사할 문구 — throw 의 인자와, 오류 문구 표의 값 */
function literals(source: string): string[] {
  const fromTables = [...source.matchAll(ERROR_TABLE)].flatMap((m) =>
    [...m[1]!.matchAll(TABLE_LINE)].map((line) => line[1]!),
  );
  return [...[...source.matchAll(THROW)].map((m) => m[1]!), ...fromTables];
}

const HANGUL = /[가-힣]/;

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

const ko = DICTIONARIES.ko as Record<string, unknown>;
const en = DICTIONARIES.en as Record<string, unknown>;
const ja = DICTIONARIES.ja as Record<string, unknown>;

describe('손님에게 가는 오류 문구', () => {
  it('볼 파일을 실제로 읽었다 — 못 읽으면 아래가 전부 헛돈다', () => {
    for (const path of CUSTOMER_FACING) expect(read(path).length, path).toBeGreaterThan(100);
  });

  it.each(CUSTOMER_FACING.filter((p) => !(p in EXEMPT_FILE)))(
    '%s 는 한국어 문장을 박아 두지 않는다',
    (path) => {
      expect(
        literals(read(path)).filter((l) => HANGUL.test(l) && !(l in EXEMPT)),
        '사전 열쇠를 적으세요 — 번역은 apiError 가 한다',
      ).toEqual([]);
    },
  );

  /**
   * **면제를 증명한다.** "운영 화면이다" 가 이유라면, 그 파일에서 **손님이 부르는 함수**는 여전히
   * 열쇠만 들고 있어야 면제가 성립한다. 운영과 손님이 한 파일을 나눠 쓰는 자리가 그렇다 —
   * 파일을 통째로 빼면 그 파일의 손님 문구까지 안 보게 된다.
   */
  it.each(
    Object.entries(EXEMPT_FILE)
      .filter(([, e]) => e.customerFns)
      .flatMap(([path, e]) => e.customerFns!.map((fn) => [path, fn] as const)),
  )('%s 의 %s 는 손님 것이라 열쇠만 쓴다', (path, fn) => {
    const source = read(path);
    const start = source.indexOf(`export async function ${fn}`);
    expect(start, `${fn} 이 사라졌다 — 면제 이유가 낡았다`).toBeGreaterThan(-1);
    const after = source.slice(start + 1);
    const end = after.indexOf('\nexport ');
    const body = after.slice(0, end === -1 ? undefined : end);

    expect(
      literals(body).filter((l) => HANGUL.test(l)),
      '손님이 부르는 함수다 — 사전 열쇠를 적으세요',
    ).toEqual([]);
  });

  it('면제 목록에 사라진 파일이 없다', () => {
    for (const path of Object.keys(EXEMPT_FILE)) expect(read(path).length, path).toBeGreaterThan(100);
  });

  /**
   * 열쇠를 잘못 적으면 **그 열쇠가 그대로 사람에게 보인다.** 번역기는 없는 열쇠에 화면을 걸지 않고
   * 이름을 그대로 돌려주므로(translatorFor), 오타는 조용히 `err.order.notFund` 로 나간다.
   */
  it('오류가 부르는 열쇠가 세 사전에 모두 있다', () => {
    const source = [
      ...CUSTOMER_FACING,
      'apps/web/src/lib/orders/cancel-order.ts',
      'apps/web/src/lib/orders/return-request.ts',
      'packages/core/src/return-request.ts',
      'packages/core/src/review.ts',
      'packages/core/src/inquiry.ts',
      'packages/contract/src/order.ts',
    ]
      .map(read)
      .join('\n');

    const used = [...new Set([...source.matchAll(/'(err\.[a-zA-Z.]+)'/g)].map((m) => m[1]!))];
    expect(used.length, '오류 열쇠를 하나도 못 찾았다').toBeGreaterThan(20);

    expect(used.filter((k) => !(k in ko)), '한국어 사전에 없다').toEqual([]);
    expect(used.filter((k) => !(k in en)), '영어 사전에 없다').toEqual([]);
    expect(used.filter((k) => !(k in ja)), '일본어 사전에 없다').toEqual([]);
  });

  /**
   * **끼워 넣을 자리가 있으면 값도 함께 와야 한다.** `{max}` 만 있고 값이 없으면 번역기는 그 자리를
   * 그대로 둔다 — "배송지는 {max}개까지 저장할 수 있습니다" 가 사람에게 보인다.
   */
  it('자리를 가진 문구는 세 사전이 같은 자리를 쓴다', () => {
    const slots = (text: unknown): string =>
      [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(',');

    const mismatched = Object.keys(ko)
      .filter((k) => k.startsWith('err.'))
      .filter((k) => slots(ko[k]) !== slots(en[k]) || slots(ko[k]) !== slots(ja[k]));

    expect(mismatched, '한 언어에서만 값이 빠지면 그 언어만 자리가 드러난다').toEqual([]);
  });
});
