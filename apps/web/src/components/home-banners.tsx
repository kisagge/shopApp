'use client';

import Image from 'next/image';
import { Carousel } from '@shop/ui';
import { AppLink } from './app-link';
import { useT } from '~/lib/i18n/client';

export interface HomeBanner {
  readonly id: string;
  readonly eyebrow: string | null;
  readonly headline: string;
  readonly subcopy: string | null;
  readonly ctaLabel: string | null;
  readonly href: string | null;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  /** 남의 사진을 쓸 때의 작가 표기. 상품 사진과 같은 규칙이다. */
  readonly imageCredit: string | null;
  readonly tone: string;
}

const TONE_CLASS: Record<string, string> = {
  sand: 'bg-ph-sand', stone: 'bg-ph-stone', clay: 'bg-ph-clay',
  olive: 'bg-ph-olive', mist: 'bg-ph-mist',
};

/**
 * 홈 히어로.
 *
 * 배너가 하나면 캐러셀 조작 장치를 그리지 않는다 — 넘길 것이 없는데 화살표와
 * 점을 두면 누를 수 있는 것처럼 보인다.
 */
export function HomeBanners({ banners }: { banners: readonly HomeBanner[] }) {
  const t = useT();

  if (banners.length === 0) return null;

  return (
    <Carousel
      label={t('home.banners')}
      slides={banners.map((banner, index) => ({
        id: banner.id,
        content: <BannerSlide banner={banner} index={index} />,
      }))}
    />
  );
}

function BannerSlide({ banner, index }: { banner: HomeBanner; index: number }) {
  const tone = TONE_CLASS[banner.tone] ?? 'bg-ph-sand';

  return (
    <div
      className={`relative flex min-h-[380px] items-center px-4 py-14 md:min-h-[520px] md:px-10 ${
        banner.imageUrl ? 'bg-[var(--surface-2)]' : tone
      }`}
    >
      {banner.imageUrl && (
        <>
          <Image
            src={banner.imageUrl}
            // 배경 이미지의 의미는 옆의 제목이 이미 전달한다. 같은 내용을
            // 두 번 읽히지 않도록 장식으로 둔다.
            alt=""
            aria-hidden="true"
            fill
            // 항상 화면 폭을 꽉 채운다
            sizes="100vw"
            // 홈의 첫 화면이다. 여기가 늦으면 사이트가 늦은 것으로 보인다.
            priority={index === 0}
            className="object-cover"
          />
          {/*
            사진 위 글자의 대비를 보장한다.
            **가림막을 화면 폭이 아니라 글자 폭에 맞춘다.** 화면 폭 기준의
            그라디언트로 두었더니, 좁은 화면에서 글자 오른쪽 끝이 이미 투명해진
            자리로 넘어가 붉은 니트 사진 위에서 문장 절반이 사라졌다. 사진이
            하나도 없을 때는 드러나지 않던 결함이다.
            글자 칸은 max-w-[460px] + 좌우 여백이라 520px 까지는 확실히 덮고
            그 뒤에 푼다 — 화면이 그보다 좁으면 전부 덮인다.
          */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--color-n-0)_92%,transparent)_0px,color-mix(in_oklab,var(--color-n-0)_82%,transparent)_520px,transparent_780px)]"
          />
        </>
      )}

      {banner.imageCredit && (
        <p className="absolute right-3 bottom-2 z-10 text-[10px] text-n-700/80">
          {banner.imageCredit}
        </p>
      )}

      <div className="relative z-10 flex max-w-[460px] flex-col gap-4">
        {banner.eyebrow && (
          <p className="text-[11px] font-medium tracking-[0.18em] text-n-600">{banner.eyebrow}</p>
        )}
        {/* 줄바꿈을 그대로 살린다. 히어로 문구는 어디서 끊기느냐가 조판의
            일부라 운영자가 정할 수 있어야 한다. */}
        <p className="font-serif text-[32px] leading-tight font-medium tracking-tight whitespace-pre-line text-n-900 md:text-[56px]">
          {banner.headline}
        </p>
        {banner.subcopy && (
          <p className="text-sm leading-relaxed text-n-700 md:text-[15px]">{banner.subcopy}</p>
        )}
        {banner.ctaLabel && banner.href && (
          <AppLink
            href={banner.href}
            className="mt-2 inline-flex h-12 w-fit items-center rounded-sm bg-n-900 px-7 text-sm font-medium text-n-0 no-underline hover:bg-n-950"
          >
            {banner.ctaLabel}
          </AppLink>
        )}
      </div>
    </div>
  );
}
