'use client';

/**
 * 루트 레이아웃까지 깨졌을 때.
 *
 * 이 경계는 <html> 과 <body> 를 **직접** 그려야 한다 — 레이아웃이 살아 있지
 * 않은 상황이라 평소의 껍데기를 기대할 수 없다.
 *
 * 그래서 여기서는 프로젝트의 CSS 도 폰트도 없다고 봐야 한다. 인라인 스타일과
 * 시스템 글꼴만 쓴다. 오프라인 화면(apps/mobile/www)과 같은 이유다.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          background: '#fdfcfa',
          color: '#2b2926',
          font: "15px/1.7 -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 340, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '0.16em' }}>PLAIN</p>
          <h1 style={{ margin: '18px 0 10px', fontSize: 19, fontWeight: 600 }}>
            문제가 발생했습니다
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#6f6a63' }}>
            잠시 후 다시 시도해 주세요.
          </p>
          {error.digest && (
            <p style={{ marginTop: 18, fontSize: 12, color: '#9a958d' }}>
              오류 번호 {error.digest}
            </p>
          )}
          <p style={{ marginTop: 24 }}>
            <a href="/" style={{ color: '#2b2926', fontSize: 14 }}>처음으로</a>
          </p>
        </main>
      </body>
    </html>
  );
}
