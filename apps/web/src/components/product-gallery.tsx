'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useT } from '~/lib/i18n/client';
import { isBlurDataUrl } from '@shop/core';

export interface GalleryImage {
  readonly url: string;
  readonly alt: string;
  readonly blurDataUrl: string | null;
  /** 우리가 찍지 않은 사진의 출처. 없으면 표기하지 않는다 */
  readonly credit: string | null;
  readonly creditUrl: string | null;
}

/**
 * 상품 사진.
 *
 * **첫 장만 보였다.** 조회는 사진을 차례대로 전부 실어 왔는데 화면은 `images[0]` 하나만 그렸다 — 운영
 * 화면에서 사진을 여러 장 올려도 손님은 뒷모습·소재 사진을 볼 길이 없었다.
 *
 * 큰 사진 아래에 작은 사진 단추를 둔다(두 장 이상일 때만). 단추는 무엇을 보여 주는지 이름으로 말하고,
 * 지금 보이는 것은 `aria-current` 로 알린다 — 색 테두리만으로는 화면을 못 보는 사람이 모른다.
 * 출처는 **보이는 사진의 것**을 적는다. 사진마다 찍은 사람이 다를 수 있다.
 */
export function ProductGallery({ images, name }: { images: readonly GalleryImage[]; name: string }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  // 사진이 줄어 고른 자리가 없어지면(다시 그려질 때) 첫 장으로 돌아간다
  const current = images[index] ?? images[0];

  return (
    <div className="flex flex-col gap-3">
      {/*
        **role="img" 를 걷어냈다.** 이 칸에 붙여 두었더니 안쪽이 통째로 그림
        하나가 되어, 아래 사진 출처 링크가 낭독기에는 없는 것이 되고 키보드로는
        잡히는 상태가 됐다 — 초점은 가는데 무엇에 왔는지 들리지 않는다.

        사진이 있으면 그 img 의 대체 텍스트가 이미 이름을 말하고, 없으면 옆의
        h1 이 말한다. 자리표시 글자는 장식이라 감춘 채로 둔다.
      */}
      <div className="relative flex aspect-4/5 items-center justify-center rounded-md bg-ph-sand lg:aspect-auto lg:h-[700px]">
        {current ? (
          <Image
            // 사진을 바꾸면 흐린 자리표시부터 다시 — 앞 사진이 남아 보이지 않게
            key={current.url}
            src={current.url}
            alt={current.alt}
            fill
            // 좁은 화면에서는 폭 전체, 넓은 화면에서는 오른쪽 452px 을 뺀 만큼
            sizes="(min-width: 1024px) calc(100vw - 452px), 100vw"
            // 이 화면의 가장 큰 그림이자 첫 화면에 있다. 늦게 받으면 그대로 체감된다.
            priority={index === 0}
            {...(isBlurDataUrl(current.blurDataUrl)
              ? { placeholder: 'blur' as const, blurDataURL: current.blurDataUrl }
              : {})}
            className="rounded-md object-cover"
          />
        ) : (
          <span aria-hidden="true" className="text-[11px] tracking-widest text-n-700">IMAGE</span>
        )}

        {/*
          우리가 찍지 않은 사진에는 출처를 밝힌다.
          라이선스가 강제하지 않더라도, 남의 결과물을 우리 매대에 쓰면서
          누구 것인지 적지 않을 이유가 없다.
        */}
        {current?.credit && (
          <p className="absolute right-2 bottom-2 rounded-xs bg-n-900/55 px-2 py-1 text-[10px] text-n-0">
            {t('product.photoCredit')}{' '}
            {current.creditUrl ? (
              <a href={current.creditUrl} target="_blank" rel="noreferrer" className="text-n-0 underline">
                {current.credit}
              </a>
            ) : (
              current.credit
            )}
            {' · Unsplash'}
          </p>
        )}
      </div>

      {images.length > 1 && (
        <ul
          aria-label={t('product.gallery', { count: images.length })}
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {images.map((image, i) => (
            // 같은 파일을 두 번 올릴 수도 있다 — 주소만으로는 줄이 겹친다
            <li key={`${i}-${image.url}`} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? 'true' : undefined}
                aria-label={`${t('product.galleryShow', { index: i + 1 })} — ${image.alt || name}`}
                className={`relative block h-[90px] w-[72px] overflow-hidden rounded-xs bg-ph-sand outline-offset-2 ${
                  i === index ? 'ring-2 ring-[var(--fg)]' : 'opacity-70 hover:opacity-100'
                }`}
              >
                {/* 단추의 이름이 무엇인지 말한다 — 그림은 장식이다 */}
                <Image src={image.url} alt="" fill sizes="72px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
