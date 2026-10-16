import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

/** `'use client'` 로 시작하고 창구를 거는 조각들. 손으로 적지 않고 폴더에서 찾는다. */
function clientFetchers(): { path: string; code: string }[] {
  const found: { path: string; code: string }[] = [];

  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.tsx')) continue;
      const code = readFileSync(full, 'utf8');
      if (!code.startsWith("'use client'")) continue;
      // `quote.refetch()` 같은 것은 창구가 아니다
      if (!/(^|[^\w.])fetch\(/.test(code)) continue;
      found.push({ path: full.replace(SRC, '').replaceAll('\\', '/'), code });
    }
  };
  walk(join(SRC, 'app'));
  walk(join(SRC, 'components'));
  return found.sort((a, b) => a.path.localeCompare(b.path));
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
const NO_CATCH_EXEMPT: Readonly<Record<string, string>> = {
  '/components/recently-viewed.tsx':
    '여기 fetch 는 조회 함수다 — 던지면 그것을 부른 쪽(데이터 훅)이 받아 실패 상태로 그린다. 여기서 받아 내면 훅이 실패를 못 본다.',
};

describe('길이 끊겨도 끝을 맺는다', () => {
  it('면제 목록에 사라진 파일이 없다', () => {
    const paths = new Set(FETCHERS.map((f) => f.path));
    for (const path of Object.keys(NO_CATCH_EXEMPT)) expect(paths, path).toContain(path);
  });

  it.each(FETCHERS.filter((f) => !(f.path in NO_CATCH_EXEMPT)).map((f) => [f.path, f.code]))(
    '%s 는 실패를 받아 낸다',
    (_path, code) => {
      expect(/catch/.test(code), '끊기면 보내는 중인 채로 멈춘다 — try/catch 나 .catch 를 두세요').toBe(true);
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
