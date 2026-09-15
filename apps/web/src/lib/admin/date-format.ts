/**
 * 운영 화면의 날짜 모양. 운영 화면은 한국어·한국 시각 하나다.
 *
 * 화면마다 `new Intl.DateTimeFormat('ko-KR', …)` 를 따로 두었더니 열네 벌이 되었고, 같은 "때" 가 화면마다 조금씩 다르게
 * 찍혔다. 쓰는 모양은 셋뿐이다. 서버·클라이언트 부품이 함께 쓰므로 server-only 가 아니다.
 */

const TZ = 'Asia/Seoul';

/** 2026. 9. 15. — 가입일·정산 기간처럼 날만 중요한 곳 */
export const adminDate = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: TZ });

/** 2026. 9. 15. 오후 3:20 — 목록에서 읽는 때 */
export const adminDateTime = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });

/** 2026. 09. 15. 15:20 — 원장·메모처럼 줄마다 자리가 맞아야 하는 곳(자릿수 고정) */
export const adminTimestamp = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ,
});
