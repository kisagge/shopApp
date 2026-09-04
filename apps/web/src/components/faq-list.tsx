import type { SupportPostView } from '~/lib/queries/support';

/**
 * FAQ 한 묶음.
 *
 * `<details>` 로 만든다. **여기서는 스크립트 없이도 열린다** — 모바일 메뉴는
 * summary 가 접근성 트리에 이름 없이 노출돼서 버렸지만, 그건 아이콘 버튼이라
 * 이름이 없었기 때문이다. 여기 summary 안에는 질문이 글자로 들어 있어
 * 낭독기가 그대로 읽는다.
 */
export function FaqList({ items }: { items: readonly SupportPostView[] }) {
  return (
    <ul className="mt-2 flex flex-col">
      {items.map((item) => (
        <li key={item.id} className="border-b border-[var(--border)]">
          <details className="group">
            <summary className="cursor-pointer list-none py-3.5 text-[14px] leading-relaxed marker:content-none">
              <span className="flex items-baseline gap-2">
                <span aria-hidden="true" className="text-[var(--fg-muted)]">
                  Q
                </span>
                <span className="flex-1">{item.title}</span>
                {/* 여닫힘은 상태가 아니라 모양으로만 알린다 — details 가 이미 말해 준다 */}
                <span
                  aria-hidden="true"
                  className="shrink-0 text-[var(--fg-muted)] group-open:rotate-180"
                >
                  ⌄
                </span>
              </span>
            </summary>
            <p className="whitespace-pre-wrap pt-1 pb-5 pl-5 text-[13px] leading-loose text-[var(--fg-secondary)]">
              {item.body}
            </p>
          </details>
        </li>
      ))}
    </ul>
  );
}
