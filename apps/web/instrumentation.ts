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
   * 동적 임포트를 쓴다.
   *
   * 이 파일은 엣지 런타임에서도 불릴 수 있는데, 보고 코드는 server-only 와
   * 노드 API 에 묶여 있다. 위에서 정적으로 가져오면 그쪽 번들이 깨진다.
   */
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
