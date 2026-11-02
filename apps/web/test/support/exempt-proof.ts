import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **면제의 근거가 통제를 내세우면, 그 통제를 보여야 한다.**
 *
 * 요청 제한 훑기의 `EXEMPT_ZONE` 은 이미 그렇게 한다 — 근거마다 `proof` 정규식을 달고
 * "정말로 막는지 확인해야 면제가 성립한다" 고 적어 두었다. 그런데 **평평한 면제 맵은
 * 근거를 글로만 받았다.** 그래서 이런 줄이 통과했다:
 *
 *   'api/webhooks/toss/route.ts': '… **서명 검증이 아무나 못 부르게 막는다.**'
 *
 * 서명 검증은 **저장소에 없다.** 라우트 주석이 "서명 검증 **대신** 이 방식을 택한
 * 이유는…" 이라고 적고 `docs/DEPLOY.md` 도 "별도의 서명 검증 설정이 필요 없다" 고
 * 적는다 — 본문을 안 믿고 PG 에 다시 묻는 설계라 서명이 필요 없는 것이고, 그러니
 * 그 웹훅은 **누구나 부를 수 있다.** 면제라는 결론은 맞았지만 근거가 거짓이었고,
 * 거짓 근거는 그 줄을 **두 번째 파일로 복사되게** 만들었다.
 *
 * 그래서 근거를 읽어 통제를 내세운 자리만 증명을 요구한다. 통제가 아닌 근거
 * (유니크 제약, 쿠키 한 장, 상태 기계)는 그대로 글로 둔다 — 소스에서 증명할 수
 * 없는 것에 증명을 요구하면 면제를 적을 길이 막힌다.
 *
 * **한계를 적어 둔다.** "그 통제를 부르는 코드가 이 창구의 그래프 안에 있는가" 까지
 * 본다. 부르면서 결과를 무시하는 자리는 통과한다 — 잡으려는 것은 **아예 없는 통제를
 * 근거로 삼는 것**이다.
 */

const SRC = join(process.cwd(), 'src');

/**
 * 근거가 통제를 내세우는 모양과, 그 통제가 소스에 있다는 증거.
 *
 * 낱말만 보면 안 된다 — `NO_SESSION` 의 근거들은 "세션이 **없다**" 는 뜻으로 세션을
 * 말한다. 그래서 **막는다고 주장하는 모양**만 집는다.
 */
export const CLAIM_PROOF: readonly { readonly claim: RegExp; readonly proof: RegExp; readonly what: string }[] = [
  {
    claim: /서명\s*(검증)?\s*이?[^.]{0,20}(막|거른)/,
    proof: /createHmac|timingSafeEqual|verifySignature|webhookSecret|WEBHOOK_SECRET/,
    what: '서명 검증',
  },
  {
    claim: /권한\s*검사가[^.]{0,20}(앞|막)/,
    proof: /hasPermission|assertPermission|requireAdmin|assertAdminQuery/,
    what: '권한 검사',
  },
  {
    claim: /세션이\s*있어야/,
    proof: /getSessionUser|getActor|getCurrentUser/,
    what: '세션 확인',
  },
];

/** 한 창구가 `~/` 로 끌어오는 저장소 안의 파일들 — 문지기는 라우트가 아니라 lib 에 있다 */
function routeGraph(relRoute: string): string[] {
  const seen = new Set<string>();
  const queue = [join(SRC, relRoute.replace(/^api\//, 'app/api/'))];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    for (const spec of code.matchAll(/from '(~\/[^']+)'/g)) {
      const base = join(SRC, spec[1]!.slice(2));
      for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
        if (existsSync(candidate)) {
          queue.push(candidate);
          break;
        }
      }
    }
  }
  return [...seen];
}

/** 근거가 내세운 통제 중 소스에서 못 찾은 것들 */
export function unprovenClaims(relRoute: string, reason: string): string[] {
  const claimed = CLAIM_PROOF.filter((c) => c.claim.test(reason));
  if (claimed.length === 0) return [];
  const source = routeGraph(relRoute).map((f) => readFileSync(f, 'utf8')).join('\n');
  return claimed.filter((c) => !c.proof.test(source)).map((c) => c.what);
}

/**
 * **"저쪽이 본다" 는 근거도 증명한다.**
 *
 * 면제 근거가 다른 검사를 가리키는 일이 많다 — "권한 검사는 query-authz 가 본다",
 * "getMyOrders 와 같은 where 를 쓴다". 그 말이 맞는지는 **가리킨 자리에 그 표식이
 * 있는지**로 확인할 수 있고, 안 하면 가리키기만 하고 아무도 안 보는 일이 생긴다.
 *
 * 실제로 그랬다: `query-authz` 는 마이페이지 요약을 "남의 것을 읽을 길이 없다
 * (customer-query-scope)" 로 넘기고, `customer-query-scope` 는 "각각은 여기서 본다" 로
 * 되돌려 넘겼다 — **두 그물이 서로를 가리키고 그 사이 집계 셋이 아무도 안 보는 자리로
 * 남았다.** 돌연변이로 확인했고(전부 초록), 그래서 가리키는 말에 증거를 붙인다.
 *
 * 표식은 **그쪽에서 사라지면 깨지는 글자**여야 한다 — 검사 이름이나 표의 열쇠처럼.
 */
export interface SeenBy {
  /** `test/` 아래의 상대 경로 */
  readonly file: string;
  /** 그 파일에 있어야 하는 글자 */
  readonly marker: string;
}

/** 가리킨 자리에 표식이 없는 것들 */
export function unseenPointers(pointers: readonly (SeenBy & { readonly of: string })[]): string[] {
  const missing: string[] = [];
  for (const p of pointers) {
    const path = join(process.cwd(), 'test', p.file);
    if (!existsSync(path)) {
      missing.push(`${p.of} → ${p.file} (파일이 없다)`);
      continue;
    }
    if (!readFileSync(path, 'utf8').includes(p.marker)) {
      missing.push(`${p.of} → ${p.file} 에 "${p.marker}" 가 없다`);
    }
  }
  return missing;
}
