import type { Instrumentation } from 'next';

/**
 * 서버에서 난 오류를 한 곳에서 받는다.
 *
 * Next 가 렌더·라우트 핸들러·서버 액션에서 처리되지 않은 오류를 여기로
 * 넘겨 준다. **이 파일이 생기기 전까지 그 오류들은 로그에 스택만 남기고
 * 지나갔다** — 누가 열어 보지 않으면 아무도 몰랐다.
 *
 * 무엇을 어떻게 남길지는 lib/errors 가 정한다. 여기서는 넘기기만 한다.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  /**
   * **엣지에서는 아무것도 하지 않는다.**
   *
   * 보고 코드는 server-only 와 노드 API 에 묶여 있어 엣지에서는 돌 수가 없다. 그래서 동적
   * 임포트로 미뤄 두었는데, **미루는 것만으로는 번들에서 빠지지 않았다** — 묶는 쪽은 부를
   * 수도 있는 길을 다 싣는다. 그 결과 엣지 묶음에 Prisma 의 WASM 질의 컴파일러가
   * base64 로 4.4MB 실렸고(`.next/server/edge/chunks/…wasm-base64…`), 빌드 로그에는
   * "Ecmascript file had an error … Edge Instrumentation" 이 세 번 찍혔다.
   *
   * 이 저장소의 엣지 런타임은 `proxy.ts`(CSP nonce)가 쓰고, 그것은 **모든 요청**을
   * 지난다. 거기 실리는 무게는 조용히 비싸다.
   *
   * `NEXT_RUNTIME` 은 런타임마다 빌드 때 박히는 값이라, 이 줄 하나로 엣지 묶음에서는
   * 아래가 통째로 떨어져 나간다. 엣지에서 난 오류는 Vercel 로그에 남는다 — 여기서
   * 삼키는 것이 아니라 애초에 이 자리가 그것을 받을 수 없다.
   */
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return;

  const { reportError } = await import('~/lib/errors');

  await reportError({
    error,
    path: request.path,
    method: request.method,
    headers: request.headers,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
