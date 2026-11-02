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
