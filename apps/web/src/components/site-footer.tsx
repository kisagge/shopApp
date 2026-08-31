export function SiteFooter() {
  return (
    <footer className="safe-b mt-20 border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-10 md:px-10">
        <p className="font-serif text-lg font-medium tracking-[0.18em]">PLAIN</p>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--fg-muted)]">
          포트폴리오 목적으로 제작된 화면입니다. 브랜드명과 사업자 정보는 플레이스홀더입니다.
        </p>
      </div>
    </footer>
  );
}
