import type { Metadata } from 'next';
import { NO_INDEX } from '~/lib/no-index';

/**
 * 연결이 없을 때 서비스워커가 대신 보여 주는 화면.
 *
 * **바깥에서 아무것도 불러오지 않는다.** 연결이 없을 때 보여 줄 화면이
 * 연결을 필요로 하면 뜻이 없다. 네이티브 셸의 오프라인 화면과 같은 이유다
 * (apps/mobile/www/index.html).
 *
 * 정적으로 미리 그려 둬야 서비스워커가 캐시에 담을 수 있다.
 *
 * **이 화면만 한국어로 남긴다.** 요청의 언어를 읽으려면 헤더를 봐야 하고,
 * 헤더를 보는 순간 미리 그려 둘 수 없게 된다 — 연결이 없을 때 보여 줄
 * 화면이 연결을 필요로 하게 되는 셈이다. 브라우저에서 쿠키를 읽어 바꾸는
 * 방법도 있지만, 미리 그린 글자가 한 번 보였다가 바뀌는 깜빡임이 남는다.
 * 세 줄짜리 화면에 그만한 장치를 붙일 값이 없다고 봤다.
 */
export const metadata: Metadata = {
  title: '연결할 수 없습니다',
  ...NO_INDEX,
};

export default function OfflinePage() {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-serif text-lg font-medium tracking-[0.18em]">PLAIN</p>
      <h1 className="text-[17px] font-semibold">연결할 수 없습니다</h1>
      <p className="text-[14px] leading-relaxed text-[var(--fg-secondary)]">
        네트워크 상태를 확인한 뒤 다시 시도해 주세요.
      </p>
      {/*
        Link 가 아니라 a 다. 오프라인에서는 클라이언트 라우팅이 갈 곳이
        없고, 새로 고침이 실제로 하려는 일이다.
      */}
      <a
        href="/"
        className="mt-2 inline-flex h-12 items-center rounded-sm bg-[var(--brand)] px-6 text-[14px] font-medium text-[var(--bg)] no-underline"
      >
        다시 시도
      </a>
    </div>
  );
}
