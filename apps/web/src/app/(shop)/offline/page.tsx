import type { Metadata } from 'next';
import { NO_INDEX } from '~/lib/no-index';
import { getT } from '~/lib/i18n/server';

/**
 * 연결이 없을 때 서비스워커가 대신 보여 주는 화면.
 *
 * **바깥에서 아무것도 불러오지 않는다.** 연결이 없을 때 보여 줄 화면이
 * 연결을 필요로 하면 뜻이 없다. 네이티브 셸의 오프라인 화면과 같은 이유다
 * (apps/mobile/www/index.html).
 *
 * **서비스워커가 설치할 때 한 번 받아서 담는다**(public/sw.js). 그래서 미리
 * 그려 둘 필요가 없고, 담기는 것은 그 브라우저가 요청한 언어의 화면이다 —
 * 나중에 연결이 끊겼을 때 자기 말로 된 화면을 본다.
 *
 * 처음에는 "미리 그려 둬야 하니 한국어로 남긴다" 고 적었는데 틀렸다.
 * 레이아웃이 이미 요청의 언어를 읽으므로 이 화면은 어차피 요청마다 그려진다.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('offline.heading'), ...NO_INDEX };
}

export default async function OfflinePage() {
  const t = await getT();

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-serif text-lg font-medium tracking-[0.18em]">PLAIN</p>
      <h1 className="text-[17px] font-semibold">{t('offline.heading')}</h1>
      <p className="text-[14px] leading-relaxed text-[var(--fg-secondary)]">
        {t('offline.note')}
      </p>
      {/*
        Link 가 아니라 a 다. 오프라인에서는 클라이언트 라우팅이 갈 곳이
        없고, 새로 고침이 실제로 하려는 일이다.
      */}
      <a
        href="/"
        className="mt-2 inline-flex h-12 items-center rounded-sm bg-[var(--brand)] px-6 text-[14px] font-medium text-[var(--bg)] no-underline"
      >
        {t('common.retry')}
      </a>
    </div>
  );
}
