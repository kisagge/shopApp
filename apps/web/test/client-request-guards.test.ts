import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * 창구를 거는 화면 조각이 **끝을 맺는지** 지킨다.
 *
 * 하루에 같은 고장을 넷 고쳤다 — 쿠폰 받기, 문의 답하기, 주문 취소, 운영 콘솔의 상태 전이.
 * 생김새가 전부 같았다:
 *
 *   **성공한 길이 끝을 못 맺거나, 눌림을 아무도 안 막아서, 다음 누름이 거짓말을 한다.**
 *
 * 쿠폰은 받고 나서 "네트워크 오류" 를 함께 띄웠고, 문의는 답을 올린 뒤 폼이 열린 채로 남아
 * 한 번 더 누르면 409 를 받았고, 취소와 상태 전이는 보내는 동안 세 번 눌리면 세 번 나갔다.
 * **넷 다 서버는 멀쩡해서 로그에 안 남고, 타입 검사도 axe 도 통과한다.** 화면을 실제로 눌러
 * 봐야만 보인다.
 *
 * 처방은 이미 저장소에 다 적혀 있었다 — `checkout-form` 의 "두 번 누르면 주문이 두 개
 * 만들어졌다", `failure-message.ts` 의 "이용 정지 폼이 그랬다". **적어 둔 곳에서만 지켜지고
 * 있었을 뿐이다.** 그래서 손 목록 대신 폴더에서 훑는다 — 새로 생기는 폼이 같은 구멍을 안고
 * 들어오면 여기가 먼저 진다.
 */

const SRC = join(process.cwd(), 'src');

/** src 아래 모든 `.ts`·`.tsx` — 폴더도 확장자도 손으로 적지 않는다 */
function sourceFiles(): { full: string; code: string }[] {
  const out: { full: string; code: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      out.push({ full, code: readFileSync(full, 'utf8') });
    }
  };
  walk(SRC);
  return out;
}

const FILES = sourceFiles();
const byFull = new Map(FILES.map((f) => [f.full, f.code]));

/** `'use client'` 를 적은 파일인가 — 경계를 여는 쪽이다 */
function declaresClient(code: string): boolean {
  return code.startsWith("'use client'");
}

/**
 * 한 파일이 저장소 안에서 **값으로** 들여오는 자리.
 *
 * **타입만 들여오는 것은 세지 않는다.** 타입은 컴파일에서 사라지므로 그 모듈이 브라우저로
 * 따라가지 않는다. 안 가리면 `payments/toss.ts`(`import 'server-only'` 로 시작하는 서버
 * 전용 모듈)까지 브라우저 식구로 끌려 들어왔다 — 그러면 그물이 서버 코드에 브라우저
 * 규칙을 들이댄다.
 */
function localSpecs(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;'"]*?)\sfrom\s*'([^']+)'/g)) {
    const spec = m[3]!;
    if (!spec.startsWith('.') && !spec.startsWith('~/')) continue;
    const clause = (m[2] ?? '').trim();
    // `import type { A } from …` 와 `import { type A, type B } from …` 둘 다 타입뿐이다
    const onlyTypes =
      Boolean(m[1]) ||
      (/^\{[\s\S]*\}$/.test(clause) &&
        clause
          .replace(/[{}]/g, '')
          .split(',')
          .filter((one) => one.trim() !== '')
          .every((one) => /^\s*type\s/.test(one)));
    if (onlyTypes) continue;
    out.push(spec);
  }
  return out;
}

/** `~/x` 와 `./x` 를 실제 파일로. 확장자 없이 적고, 폴더면 index 를 쓴다 */
function resolveLocal(fromFull: string, spec: string): string | null {
  const base = spec.startsWith('~/')
    ? join(SRC, spec.slice(2))
    : join(dirname(fromFull), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (byFull.has(candidate)) return candidate;
  }
  return byFull.has(base) ? base : null;
}

/**
 * 브라우저로 가는 파일들.
 *
 * **지시문을 적은 파일만 세면 결제가 빠진다.** `'use client'` 는 **경계**를 표시하는 것이고,
 * 그 경계 안쪽으로 끌려 들어온 모듈은 지시문을 적지 않는다 — Next 가 알아서 함께 보낸다.
 * `pay-order.ts` 가 그랬다: 지시문도 `.tsx` 도 아니지만 브라우저에서 결제 승인 창구를 걸고,
 * 그 `fetch` 는 아무도 받아 내지 않고 있었다. 그물이 못 본 까닭은 결함이 숨어서가 아니라
 * **표식이 지시문이었기 때문이다.**
 *
 * 그래서 지시문을 적은 파일에서 **들여오기를 따라 걸어** 경계 안쪽을 모은다.
 */
function clientGraph(): Set<string> {
  const seen = new Set<string>();
  const queue = FILES.filter((f) => declaresClient(f.code)).map((f) => f.full);
  while (queue.length > 0) {
    const full = queue.pop()!;
    if (seen.has(full)) continue;
    seen.add(full);
    for (const spec of localSpecs(byFull.get(full)!)) {
      const next = resolveLocal(full, spec);
      if (next !== null) queue.push(next);
    }
  }
  return seen;
}

/** 브라우저로 가면서 창구를 거는 조각들. 손으로 적지 않는다. */
function clientFetchers(): { path: string; code: string }[] {
  return [...clientGraph()]
    .filter((full) => /(^|[^\w.])fetch\(/.test(byFull.get(full)!))
    .map((full) => ({ path: full.replace(SRC, '').replaceAll('\\', '/'), code: byFull.get(full)! }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

const FETCHERS = clientFetchers();

describe('훑을 것이 실제로 있다', () => {
  /** 찾기가 고장 나면 아래 검사가 전부 조용히 통과한다 */
  it('창구를 거는 화면 조각을 넉넉히 찾는다', () => {
    expect(FETCHERS.length).toBeGreaterThan(50);
  });

  it('오늘 고친 넷이 그 안에 있다', () => {
    const paths = FETCHERS.map((f) => f.path);
    for (const one of [
      '/components/coupon-wallet.tsx',
      '/components/inquiry-actions.tsx',
      '/components/cancel-order-button.tsx',
      '/components/admin/order-status-actions.tsx',
    ]) {
      expect(paths, one).toContain(one);
    }
  });

  /**
   * **넓힌 눈이 다시 좁아지면 여기서 진다.**
   *
   * 아래 넷은 그물 밖에 있던 자리다. 눈을 좁히면 그물은 **조용히 통과한다** — 검사할
   * 식구가 사라지니 질 사람이 없다. 그래서 식구임을 따로 못 박는다.
   *
   * 좁히는 길이 셋이고, 셋 다 이들 중 일부를 떨어뜨린다(돌연변이로 하나씩 확인했다):
   *
   *   - 폴더를 손으로 적기(`app`·`components`) → `lib` 넷 전부
   *   - 확장자를 `.tsx` 로 보기 → JSX 에서 떼어 낸 훅 전부
   *   - 지시문을 적은 파일만 세기 → 경계 안쪽으로 끌려 들어온 `pay-order`·`analytics/client`
   */
  it.each([
    '/lib/use-cart-quote.ts',
    '/lib/checkout/place-order.ts',
    '/lib/checkout/pay-order.ts',
    '/lib/analytics/client.ts',
  ])('%s 도 식구다', (path) => {
    expect(FETCHERS.map((f) => f.path)).toContain(path);
  });

  /** 서버 전용 모듈은 식구가 아니다 — 브라우저 규칙을 들이대면 안 된다 */
  it('타입만 들여온 서버 모듈은 끌려 들어오지 않는다', () => {
    expect(FETCHERS.map((f) => f.path)).not.toContain('/lib/payments/toss.ts');
  });
});

/**
 * **길이 끊기는 것도 끝이다.**
 *
 * try 가 없으면 `fetch` 가 던지는 순간 `pending` 을 푸는 줄까지 못 간다 — 단추가 '보내는 중…'
 * 인 채로 **영영** 남고, 아무 말도 없다. 주문 취소가 그랬고, 운영 콘솔의 상태 전이는 거기에
 * 더해 **버튼 전부가** 잠겼다.
 *
 * `try { } catch` 든 `.catch(...)` 든 상관없다. 받아 내기만 하면 된다.
 */
/**
 * **파일에 catch 가 있는지로는 모자라다.**
 *
 * 처음에는 `/catch/.test(code)` 였다. 한 파일에 창구가 둘이고 **한쪽만** 감싸져 있으면
 * 그대로 통과한다 — `pay-order.ts` 가 그랬다. 결제창을 여는 길은 `try` 로 감쌌는데
 * 창 없이 승인까지 가는 길(`/confirm`)은 맨몸이었고, 파일에 catch 가 있다는 사실 하나로
 * 그물을 지나갔다. 그 길이 끊기면 결제 단추가 "보내는 중…" 인 채로 영영 남는다.
 *
 * 아래 json·ok 검사가 이미 같은 교훈을 적어 두었다 — "호출 하나씩 본다". 여기에도 적용한다.
 *
 * 괄호 깊이를 세어 `try { … }` 안쪽인지 보고, 아니면 `.catch` 가 바로 붙었는지 본다.
 * 글자열과 주석은 괄호 셈에서 뺀다 — 안 빼면 `'{'` 한 글자에 셈이 어긋난다.
 */
/** `(` 가 있는 자리에서 짝이 되는 `)` 다음 칸. 글자열·주석은 셈에서 뺀다 */
function closingParen(code: string, openAt: number): number {
  let depth = 0;
  let i = openAt;
  while (i < code.length) {
    const two = code.slice(i, i + 2);
    if (two === '//') { const at = code.indexOf('\n', i); i = at === -1 ? code.length : at + 1; continue; }
    if (two === '/*') { const at = code.indexOf('*/', i); i = at === -1 ? code.length : at + 2; continue; }
    const ch = code[i]!;
    if (ch === '"' || ch === "'" || ch === '`') {
      i += 1;
      while (i < code.length && code[i] !== ch) i += code[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return code.length;
}

/**
 * 창구 뒤에 이어 붙은 사슬에 `.catch` 가 있는가.
 *
 * **바로 붙은 것만 보면 안 된다.** `fetch(…).then(…).catch(…)` 가 이 저장소에서 가장 흔한
 * 모양이다(장바구니 맞추기, 검색 자동완성, 일부 취소). 사슬을 한 칸씩 걸어가며 본다 —
 * `.then` 이든 `.finally` 든 지나가고, `.catch` 를 만나면 받아 낸 것이다.
 */
function chainCatches(code: string, from: number): boolean {
  let at = from;
  for (;;) {
    const link = /^\s*\.(\w+)\s*\(/.exec(code.slice(at));
    if (!link) return false;
    if (link[1] === 'catch') return true;
    at = closingParen(code, at + link[0].length - 1);
  }
}

function unguardedCalls(code: string, callee: string): number[] {
  const open = `${callee}(`;
  const tryDepths: number[] = [];
  const out: number[] = [];
  let depth = 0;
  let i = 0;

  const skipTo = (end: string): void => {
    const at = code.indexOf(end, i + end.length);
    i = at === -1 ? code.length : at + end.length;
  };

  while (i < code.length) {
    const two = code.slice(i, i + 2);
    if (two === '//') { skipTo('\n'); continue; }
    if (two === '/*') { skipTo('*/'); continue; }
    const ch = code[i]!;
    if (ch === '"' || ch === "'" || ch === '`') {
      i += 1;
      while (i < code.length && code[i] !== ch) i += code[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (ch === '{') { depth += 1; i += 1; continue; }
    if (ch === '}') {
      depth -= 1;
      while (tryDepths.length > 0 && tryDepths[tryDepths.length - 1]! > depth) tryDepths.pop();
      i += 1;
      continue;
    }
    if (code.startsWith('try', i) && /^try\s*\{/.test(code.slice(i))) {
      // 여는 괄호는 다음 바퀴가 센다 — 그때의 깊이가 이 try 의 안쪽이다
      tryDepths.push(depth + 1);
      i += 3;
      continue;
    }
    if (code.startsWith(open, i) && !/[\w.]/.test(code[i - 1] ?? ' ')) {
      /*
       * **`.catch` 는 이 창구의 것이어야 한다.** 처음에는 뒤쪽 900자에서 `) .catch` 를
       * 찾았는데, 바로 아래의 `res.json().catch(…)` 가 그 모양에 걸려 **맨몸인 fetch 를
       * 감싼 것으로 읽혔다**(`pay-order.ts` 의 승인 창구가 그렇게 빠져나갔다).
       * 그래서 fetch 가 연 괄호가 닫히는 자리를 찾아 **거기 바로 붙은 것만** 센다.
       */
      const guarded = tryDepths.length > 0 || chainCatches(code, closingParen(code, i + callee.length));
      if (!guarded) out.push(i);
      i += open.length;
      continue;
    }
    i += 1;
  }
  return out;
}

const unguardedFetches = (code: string): number[] => unguardedCalls(code, 'fetch');

const NO_CATCH_EXEMPT: Readonly<
  Record<string, { why: string; caughtBy?: string; shownBy?: readonly string[] }>
> = {
  '/components/recently-viewed.tsx': {
    why: '여기 fetch 는 조회 함수다 — 던지면 그것을 부른 쪽(데이터 훅)이 받아 실패 상태로 그린다. 여기서 받아 내면 훅이 실패를 못 본다.',
  },
  '/lib/use-cart-quote.ts': {
    why:
      'react-query 의 queryFn 이다 — **던지는 것이 계약이다.** 여기서 받아 내면 질의는 성공한 것처럼 보이면서 data 가 없고, ' +
      '화면은 실패를 영원히 "계산 중" 으로 그린다. 대신 쓰는 화면이 isError 를 그려야 하고, 그것을 아래에서 증명한다.',
    shownBy: ['/components/cart-view.tsx', '/components/checkout-form.tsx'],
  },
  '/components/order-address-edit.tsx': {
    why: '보내는 것은 여기가 하지만 **받아 내는 것은 주소 폼이다** — submit 콜백으로 넘기고 그쪽이 try 로 감싼다.',
    caughtBy: '/components/address-form.tsx',
  },
};

describe('길이 끊겨도 끝을 맺는다', () => {
  it('면제 목록에 사라진 파일이 없다', () => {
    const paths = new Set(FETCHERS.map((f) => f.path));
    for (const path of Object.keys(NO_CATCH_EXEMPT)) expect(paths, path).toContain(path);
  });

  /**
   * **면제는 근거까지 증명한다.** "저쪽이 받아 낸다" 고 적었으면 저쪽이 실제로 감싸야 하고,
   * "화면이 그린다" 고 적었으면 그 화면이 실제로 실패를 읽어야 한다. 거기까지 안 하면
   * 면제는 그냥 구멍이다 — 아래 두 검사는 `guardedBy`·`askedBy` 와 같은 결이다.
   */
  it.each(
    Object.entries(NO_CATCH_EXEMPT)
      .filter(([, v]) => v.caughtBy)
      .map(([path, v]) => [path, v.caughtBy!]),
  )('%s 를 받아 내기로 한 %s 가 실제로 감싼다', (_path, caughtBy) => {
    const owner = readFileSync(join(SRC, caughtBy.slice(1)), 'utf8');
    expect(
      unguardedCalls(owner, 'submit'),
      `${caughtBy} 가 콜백을 try 로 감싸지 않으면 면제는 그냥 구멍이다`,
    ).toEqual([]);
  });

  it.each(
    Object.entries(NO_CATCH_EXEMPT)
      .flatMap(([path, v]) => (v.shownBy ?? []).map((screen) => [path, screen] as const)),
  )('%s 의 실패를 %s 가 그린다', (_path, screen) => {
    const code = readFileSync(join(SRC, screen.slice(1)), 'utf8');
    expect(
      /\.isError\b/.test(code),
      `${screen} 이 isError 를 안 본다 — 질의가 실패하면 화면은 그것을 "계산 중" 으로 그린다`,
    ).toBe(true);
  });

  it.each(FETCHERS.filter((f) => !(f.path in NO_CATCH_EXEMPT)).map((f) => [f.path, f.code]))(
    '%s 는 창구마다 실패를 받아 낸다',
    (_path, code) => {
      expect(
        unguardedFetches(code),
        '맨몸으로 거는 창구가 있다 — 끊기면 보내는 중인 채로 멈춘다. try/catch 나 .catch 를 두세요',
      ).toEqual([]);
    },
  );
});

/**
 * **aria-disabled 는 눌림을 막지 않는다.**
 *
 * 이 저장소는 못 누르는 버튼에 `disabled` 대신 `aria-disabled` 를 쓴다 — disabled 는 초점을
 * 못 받아 **왜 못 누르는지 들리지 않기** 때문이고, 그 판단은 옳다. 대신 눌리기는 하므로
 * **조건을 핸들러가 지켜야 한다.** 주문 만들기가 그 까닭을 적어 두었다: "예전에는 배송지만
 * 보고 지나가서, 두 번 누르면 주문이 두 개 만들어졌다."
 *
 * 그 처방이 안 닿은 자리가 넷이었다. 가장 나쁜 자리는 운영 콘솔이었다 — '처리 중…' 을 보고
 * 안 눌린 줄 안 운영자가 바로 옆의 '주문취소(으)로 변경' 을 누르면 두 전이가 동시에 날아갔다.
 *
 * 막은 증거로 받아 주는 것 셋: 네이티브 `disabled`(브라우저가 막는다), 보내는 중인지 보고
 * 돌아서는 줄, 그리고 ref 로 쥔 같은 판단(빠른 두 번 누름은 다시 그리기 전에 둘 다 state 를
 * 읽으므로 ref 가 더 낫다).
 */
const BUSY = '(pending|sending|busy|saving|submitting|loading|working|canOrder|claimed|disabled)';

/** 눌림을 막았다는 증거가 있는가 */
function blocksRepeat(code: string): boolean {
  // 브라우저가 막는다 — aria-disabled 가 아닌 진짜 disabled
  if (/(^|[^-\w])disabled=\{/.test(code)) return true;
  // 보내는 중이면 돌아선다 (`if (pending) return;` · `if (!pending) void send()` · ref)
  if (new RegExp(`if \\([^;{]*${BUSY}[^;{]*\\)\\s*\\{?\\s*(return|void)`, 'i').test(code)) return true;
  return false;
}

/**
 * 면제는 **이유와 함께**, 그리고 그 이유를 증명한다.
 *
 * 둘로 갈린다. 창구를 거는 곳과 **단추가 있는 곳이 다른** 조각은 이 파일만 봐서는 알 수 없다 —
 * 그때는 단추를 쥔 조각(`guardedBy`)을 적고, 아래 검사가 **그쪽이 실제로 막는지** 본다.
 * 거기까지 안 하면 면제는 그냥 구멍이다.
 */
const UNGUARDED_EXEMPT: Readonly<Record<string, { why: string; guardedBy?: string }>> = {
  '/components/recently-viewed.tsx': {
    why: '창구는 조회 함수가 걸고 데이터 훅이 부른다. 눌리는 자리는 상품으로 가는 링크라 아무것도 보내지 않는다.',
  },
  '/components/search-box.tsx': {
    why: '창구는 입력이 멎으면 이펙트가 건다(자동완성). 눌리는 자리는 검색 결과로 가는 것이라 아무것도 보내지 않는다.',
  },
  '/app/admin/coupons/coupon-board.tsx': {
    why: '보내는 것은 여기가 하지만 **단추는 표가 쥔다** — 여기 눌리는 자리는 만들기 폼을 여는 것뿐이다.',
    guardedBy: '/app/admin/coupons/coupon-table.tsx',
  },
  '/components/order-address-edit.tsx': {
    why: '보내는 것은 여기가 하지만 **단추는 주소 폼이 쥔다**(submit 으로 넘긴다) — 여기 눌리는 자리는 폼을 여는 것뿐이다.',
    guardedBy: '/components/address-form.tsx',
  },
};

describe('두 번 눌러도 한 번만 나간다', () => {
  /** 누르거나 보내는 자리가 있는 것만 본다 — 이펙트에서 거는 창구는 누를 일이 없다 */
  const CLICKABLE = FETCHERS.filter((f) => /onClick=|onSubmit=/.test(f.code));

  it('누를 수 있는 조각이 실제로 있다', () => {
    expect(CLICKABLE.length).toBeGreaterThan(40);
  });

  it('면제 목록에 사라진 파일이 없다', () => {
    const paths = new Set(CLICKABLE.map((f) => f.path));
    for (const path of Object.keys(UNGUARDED_EXEMPT)) expect(paths, path).toContain(path);
  });

  /** 면제를 증명한다 — "단추는 저쪽이 쥔다" 고 적었으면 저쪽이 실제로 막아야 한다 */
  it.each(
    Object.entries(UNGUARDED_EXEMPT)
      .filter(([, v]) => v.guardedBy)
      .map(([path, v]) => [path, v.guardedBy!]),
  )('%s 의 단추를 쥔 %s 가 실제로 막는다', (_path, guardedBy) => {
    const owner = FETCHERS.find((f) => f.path === guardedBy)
      ?? { code: readFileSync(join(SRC, guardedBy.slice(1)), 'utf8') };

    expect(blocksRepeat(owner.code), `${guardedBy} 가 막지 않으면 면제는 그냥 구멍이다`).toBe(true);
  });

  it.each(CLICKABLE.filter((f) => !(f.path in UNGUARDED_EXEMPT)).map((f) => [f.path, f.code]))(
    '%s 는 거듭 눌려도 한 번만 보낸다',
    (_path, code) => {
      expect(
        blocksRepeat(code),
        'aria-disabled 는 눌림을 막지 않는다 — 핸들러가 보내는 중인지 보고 돌아서거나, 네이티브 disabled 를 쓰세요',
      ).toBe(true);
    },
  );
});

/**
 * **서버가 답한 실패를 "네트워크 오류" 로 적지 않는다.**
 *
 * catch 가 있어도 틀릴 수 있다. `await response.json()` 을 `!response.ok` 보다 **먼저** 부르면,
 * 앞단이 502 HTML 이나 빈 본문을 돌려줄 때 그 줄이 던지고 **아래 catch 가 받아 "네트워크 오류"**
 * 라고 적는다 — 서버는 멀쩡히 답했는데.
 *
 * `failure-message.ts` 가 그 일을 겪고 생겼다: "앞단이 502 HTML 을 주거나 본문이 비면
 * `response.json()` 이 던지고, 그걸 잡지 않으면 서버가 한 말 대신 '네트워크 오류' 가 뜬다
 * (실제로 이용 정지 폼이 그랬다)." **그런데 그 교훈이 스무 곳에 안 닿아 있었다** — 쿠폰 폼,
 * 상태 전이, 상품 사진, 배너를 하나씩 고치다 세어 보고 알았다.
 *
 * 받아 내는 길은 둘 중 아무거나다: `ok` 를 먼저 보고 그 뒤에 읽거나, `.json().catch(...)`.
 */
describe('실패한 응답을 읽는 차례', () => {
  /**
   * **호출 하나씩 본다.**
   *
   * 처음에는 파일 단위로 "첫 ok 가 첫 json 보다 앞이냐" 만 보았다. 그랬더니 한 파일에 창구가
   * 둘인 조각을 통째로 놓쳤다 — 쿠폰 지급 화면의 `search()` 는 ok 를 먼저 보고, 바로 아래
   * `grant()` 는 json 을 먼저 읽는데, 앞엣것 하나로 파일 전체가 통과했다.
   *
   * 그래서 **고장의 모양을 바로 집는다**: 무방비로 읽은 `json()` **바로 뒤**에 ok 검사가 오면,
   * 그 자리는 "먼저 읽고 나중에 가린다" 는 뜻이다.
   */
  const AFTER = 320;

  /** `.catch` 가 안 붙은 `.json()` 뒤에 곧바로 ok 검사가 오는 자리들 */
  const readsBeforeChecking = (code: string): number[] =>
    [...code.matchAll(/\.json\(\)(?!\s*\.catch)/g)]
      .map((m) => m.index)
      .filter((at) => /\w+\.ok\b/.test(code.slice(at, at + AFTER)));

  const READS_BODY = FETCHERS.filter((f) => /\.json\(\)/.test(f.code));

  it('본문을 읽는 조각이 실제로 있다', () => {
    expect(READS_BODY.length).toBeGreaterThan(30);
  });

  it.each(READS_BODY.map((f) => [f.path, f.code]))(
    '%s 는 ok 를 보고 나서 본문을 읽는다',
    (_path, code) => {
      expect(
        readsBeforeChecking(code),
        'ok 를 보기 전에 무방비로 json() 을 읽는다 — 502 가 HTML 을 주면 서버가 한 말 대신 "네트워크 오류" 가 뜬다',
      ).toEqual([]);
    },
  );

  /**
   * **차례만 맞으면 되는 것이 아니다.**
   *
   * 위 규칙은 "json 먼저, ok 나중" 한 모양만 집는다. 그런데 `!ok` **안에서** 무방비로 읽어도
   * 같은 일이 난다 — 502 가 HTML 을 주면 그 줄이 던지고, 서버가 한 말 대신 "네트워크 오류" 가
   * 뜬다. 실제로 리뷰 지우기·재입고 알림·찜하기 셋이 그 모양이었고 위 규칙은 전부 통과시켰다.
   *
   * 그래서 **서버가 한 말을 꺼내 쓰는 자리**를 본다: 무방비로 읽은 본문에서 `message` 를
   * 읽으면 진다. 받아 내는 길은 `failureMessage` 거나 `.json().catch(...)` 다.
   */
  const readsMessageUnguarded = (code: string): number[] =>
    [...code.matchAll(/\.json\(\)(?!\s*\.catch)/g)]
      .map((m) => m.index)
      .filter((at) => /\bmessage\b/.test(code.slice(at, at + 260)));

  it.each(READS_BODY.map((f) => [f.path, f.code]))(
    '%s 는 서버가 한 말을 받아 내고 읽는다',
    (_path, code) => {
      expect(
        readsMessageUnguarded(code),
        '무방비로 읽은 본문에서 message 를 꺼낸다 — 502 가 HTML 이면 그 줄이 던지고 "네트워크 오류" 가 대신 뜬다',
      ).toEqual([]);
    },
  );
});

/**
 * **되돌릴 수 없는 것은 한 번 더 묻는다.**
 *
 * 이 저장소가 거듭 적어 둔 말이다 — "지우기는 한 번 더 묻는다 — 되돌릴 수 없다"(갈래),
 * "되돌릴 수 없는 동작이라 한 번 더 묻는다"(주문 취소). 그런데 적어 둔 곳에서만 지켜졌다:
 * 상품 사진, 홈 배너, 기획전, 배송지가 **첫 누름에 바로** 지워지고 있었다. 넷 다 옆자리가
 * '노출 중지' 나 위·아래 단추라 손이 미끄러지기 좋은 줄이었다.
 *
 * 묻는 모양은 하나로 정해 두지 않는다 — 자리마다 생김새가 다르다. 묻는다는 **사실**만 본다:
 * 한 번 누르면 "지울까요?" 가 서고, 거기서 한 번 더 눌러야 나간다.
 */
const DELETE_WITHOUT_ASK_EXEMPT: Readonly<Record<string, { why: string; askedBy?: string }>> = {
  '/components/restock-list.tsx': {
    why: '재입고 알림 해제다. 상품 화면에서 한 번 눌러 그대로 되돌릴 수 있고, 지워지는 것은 "알려 달라" 는 뜻 하나뿐이다.',
  },
  '/app/admin/brands/brand-logo-form.tsx': {
    why: '로고 떼기다. 떼는 폼이 곧 다시 올리는 폼이고(바로 위 칸), 뗀 뒤 무엇이 보이는지도 그 자리에서 말한다("매장에는 이름만 뜹니다").',
  },
  '/app/admin/collections/collection-editor.tsx': {
    why: '보내는 것은 여기가 하지만 **단추는 기획전 카드가 쥔다** — 여기 눌리는 자리는 기획전을 더하는 것뿐이다.',
    askedBy: '/app/admin/collections/collection-card.tsx',
  },
};

/** 묻는 자리가 있는가 — 이름은 자리마다 다르므로 "묻는다는 사실" 만 본다 */
const asksFirst = (code: string): boolean =>
  /\b(asking|confirming|confirm)\b/.test(code) || /지울까요|삭제할까요|deleteAsk/.test(code);

describe('지우기는 한 번 더 묻는다', () => {
  const DELETERS = FETCHERS.filter((f) => /method:\s*'DELETE'/.test(f.code));

  it('지우는 조각이 실제로 있다', () => {
    expect(DELETERS.length).toBeGreaterThan(8);
  });

  it('면제 목록에 사라진 파일이 없다', () => {
    const paths = new Set(DELETERS.map((f) => f.path));
    for (const path of Object.keys(DELETE_WITHOUT_ASK_EXEMPT)) expect(paths, path).toContain(path);
  });

  it.each(DELETERS.filter((f) => !(f.path in DELETE_WITHOUT_ASK_EXEMPT)).map((f) => [f.path, f.code]))(
    '%s 는 지우기 전에 한 번 더 묻는다',
    (_path, code) => {
      expect(asksFirst(code), '첫 누름에 바로 지운다 — 되돌릴 수 없으면 한 번 더 물어야 한다').toBe(true);
    },
  );

  /** 면제를 증명한다 — "단추는 저쪽이 쥔다" 고 적었으면 저쪽이 실제로 물어야 한다 */
  it.each(
    Object.entries(DELETE_WITHOUT_ASK_EXEMPT)
      .filter(([, v]) => v.askedBy)
      .map(([path, v]) => [path, v.askedBy!]),
  )('%s 의 단추를 쥔 %s 가 실제로 묻는다', (_path, askedBy) => {
    const owner = FETCHERS.find((f) => f.path === askedBy)
      ?? { code: readFileSync(join(SRC, askedBy.slice(1)), 'utf8') };

    expect(asksFirst(owner.code), `${askedBy} 가 묻지 않으면 면제는 그냥 구멍이다`).toBe(true);
  });
});
