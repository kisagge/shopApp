import Image from 'next/image';
import { isBlurDataUrl } from '@shop/core';

const TONE_CLASS: Record<string, string> = {
  sand: 'bg-ph-sand', stone: 'bg-ph-stone', clay: 'bg-ph-clay',
  olive: 'bg-ph-olive', mist: 'bg-ph-mist',
};

/**
 * 기획전 머리.
 *
 * 배너와 같은 방식으로 배경 이미지를 깐다 — 이미지가 있으면 사진 위에,
 * 없으면 톤 블록 위에 글자를 얹는다. **사진의 뜻은 옆의 제목이 이미
 * 전달하므로** 장식으로 두고 대체 텍스트를 비운다.
 */
export function CollectionHero({
  eyebrow,
  title,
  subtitle,
  description,
  imageUrl,
  blurDataUrl,
  imageCredit,
  tone,
  sizes,
  priority = false,
  /**
   * 제목의 단계.
   *
   * **같은 조각이 화면의 제목일 때도 있고 목록의 한 칸일 때도 있다.** 늘
   * h1 로 그렸더니 기획전 목록에 h1 이 셋 생겼다 — 낭독기로 훑는 사람에게
   * 화면의 주제가 셋인 것처럼 들린다.
   */
  headingLevel = 2,
}: {
  eyebrow: string;
  title: string;
  subtitle: string | null;
  description?: string | null;
  imageUrl: string | null;
  /** 사진이 도착하기 전 깔 자리표시. 없으면 톤 블록이 그대로 남는다. */
  blurDataUrl?: string | null;
  /** 남의 사진을 쓸 때의 작가 표기. 상품 사진과 같은 규칙이다. */
  imageCredit?: string | null;
  tone: string;
  /**
   * 이 자리의 표시 크기.
   *
   * **격자와 어긋나면 최적화가 헛돈다.** 목록에서는 두 칸짜리 카드인데
   * `100vw` 로 두었더니, 592px 자리에 3840px 후보를 받아 왔다 —
   * 1,200px 이면 될 것을 96KB 로 받는다(필요분 50KB). 상품 카드에서 이미
   * 겪고 적어 둔 함정을 기획전에서 그대로 되풀이했다.
   */
  sizes?: string;
  /**
   * 먼저 받을 것인가.
   *
   * **화면의 가장 큰 그림 하나에만 준다.** 처음에는 늘 켜 두었는데, 그러면
   * 홈에서 화면 밖 카드까지 미리 받기 목록에 올라 LCP 그림과 대역폭을
   * 나눠 쓴다 — 우선순위를 일곱으로 나누면 우선순위가 아니다.
   */
  priority?: boolean;
  headingLevel?: 1 | 2 | 3;
}) {
  const Heading = ({ 1: 'h1', 2: 'h2', 3: 'h3' } as const)[headingLevel];
  return (
    <div
      className={`relative flex min-h-[240px] items-end overflow-hidden rounded-sm px-6 py-10 md:min-h-[320px] md:px-10 md:py-14 ${
        imageUrl ? 'bg-[var(--surface-2)]' : (TONE_CLASS[tone] ?? 'bg-ph-sand')
      }`}
    >
      {imageUrl && (
        <>
          <Image
            src={imageUrl}
            alt=""
            aria-hidden="true"
            fill
            sizes={sizes ?? '100vw'}
            priority={priority}
            {...(isBlurDataUrl(blurDataUrl)
              ? { placeholder: 'blur' as const, blurDataURL: blurDataUrl }
              : {})}
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

      <div className="relative z-10 flex max-w-[560px] flex-col gap-3">
        <p className="text-[11px] font-medium tracking-[0.18em] text-n-600">{eyebrow}</p>
        <Heading className="font-serif text-[28px] leading-tight font-medium tracking-tight text-n-900 md:text-[44px]">
          {title}
        </Heading>
        {subtitle && <p className="text-sm text-n-700 md:text-[15px]">{subtitle}</p>}
        {description && (
          <p className="text-[13px] leading-relaxed whitespace-pre-line text-n-700">{description}</p>
        )}
      </div>

      {imageCredit && (
        <p className="absolute right-3 bottom-2 z-10 text-[10px] text-n-700/80">{imageCredit}</p>
      )}
    </div>
  );
}
