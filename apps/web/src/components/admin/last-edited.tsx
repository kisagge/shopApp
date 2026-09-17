import { adminTimestamp } from '~/lib/admin/date-format';

/**
 * "마지막 수정 2026. 09. 15. 15:20 · 박운영 · 관리자" 한 줄.
 *
 * 서버·클라이언트 부품이 함께 쓴다 — 때는 ISO 글자로 받는다(클라이언트 부품으로 Date 를 넘기지 않게).
 */
export function LastEdited({ at, by }: { at: string; by: string }) {
  return (
    <p className="text-[12px] text-[var(--fg-muted)]">
      마지막 수정 <time dateTime={at} className="tnum">{adminTimestamp.format(new Date(at))}</time> · {by}
    </p>
  );
}
