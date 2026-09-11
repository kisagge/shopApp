'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CarouselSlide {
  readonly id: string;
  readonly content: ReactNode;
}

export interface CarouselProps {
  readonly slides: readonly CarouselSlide[];
  /** 이 캐러셀이 무엇인지. 스크린리더가 영역을 지나칠 때 읽는다 */
  readonly label: string;
  /** 자동 넘김 간격(ms). 0이면 자동으로 넘기지 않는다 */
  readonly intervalMs?: number;
  readonly className?: string;
}

/**
 * 접근 가능한 캐러셀.
 *
 * 캐러셀은 접근성 사고가 가장 잦은 컴포넌트다. 지킨 것들:
 *
 * 1. **멈출 수 있다.** 5초 넘게 자동으로 움직이는 콘텐츠에는 멈추는 수단이
 *    있어야 한다(WCAG 2.2.2). 재생/일시정지 버튼을 눈에 보이게 둔다.
 * 2. **움직임을 줄이라고 한 사용자에게는 자동으로 넘기지 않는다.**
 *    prefers-reduced-motion 은 취향이 아니라 전정기관 장애 대응이다.
 * 3. **숨은 슬라이드에 탭이 들어가지 않는다.** 화면 밖 슬라이드의 링크에
 *    포커스가 가면 키보드 사용자는 보이지 않는 곳으로 끌려간다.
 * 4. **포커스나 마우스가 올라가면 멈춘다.** 읽는 중에 넘어가지 않도록.
 * 5. **슬라이드 변경을 사용자가 눌렀을 때만 알린다.** 자동 전환까지 읽으면
 *    스크린리더가 끝없이 떠든다.
 * 6. **손가락으로 밀어도 넘어간다.** 화살표만 두었더니 폰에서 아무리 밀어도
 *    안 넘어갔다 — 손으로 만지는 화면에서 배너를 미는 것은 배우지 않아도
 *    하는 동작이다. 다만 세로로 미는 것은 **화면을 굴리는 것**이므로,
 *    가로로 더 많이 움직였을 때만 넘긴다.
 */
/**
 * 이만큼은 밀어야 넘긴다.
 *
 * 너무 작으면 배너를 누르려다 손이 조금 밀린 것까지 넘김으로 읽고, 너무
 * 크면 밀었는데 안 넘어간다. 손가락 하나 너비쯤이 그 사이다.
 */
const SWIPE_MIN = 48;

export function Carousel({ slides, label, intervalMs = 6000, className }: CarouselProps) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  /** 손가락이 닿기 시작한 자리. 떼는 순간과 견주려고 들고 있는다. */
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const baseId = useId();

  const count = slides.length;
  const single = count <= 1;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  /** 사용자가 눌러서 이동한 경우에만 알린다 */
  const goTo = useCallback(
    (next: number, announce: boolean) => {
      const target = ((next % count) + count) % count;
      setIndex(target);
      if (announce) setAnnouncement(`${count}개 중 ${target + 1}번째 배너`);
    },
    [count],
  );

  const autoAdvance = !single && playing && !reduceMotion && intervalMs > 0;

  /*
   * **사용자가 넘기면 시계를 다시 시작한다.**
   *
   * 예전에는 이 시계가 붙은 뒤로 혼자 6초마다 울렸고, 사용자가 밀거나 화살표를
   * 눌러도 그대로였다. 그래서 다음 울림 직전에 사람이 넘기면 **0.1초 만에 또
   * 넘어갔다.**
   *
   * 배너가 둘일 때 이것이 특히 고약하다. 밀어서 2번을 보고, 곧바로 화살표를
   * 누르면 — 그 사이 시계가 1번으로 돌려놓은 뒤라 — 다시 2번이 되어 **누르기
   * 전과 같은 화면**이 된다. 누른 사람 눈에는 버튼이 안 먹은 것으로 보이고,
   * 잠시 기다렸다 누르면 그때는 멀쩡히 움직인다. 실제로 그렇게 신고됐다.
   *
   * `index` 를 의존성에 넣으면 화면이 바뀔 때마다 시계가 새로 걸린다. 사람이
   * 넘겼든 시계가 넘겼든, **마지막으로 바뀐 때부터** 온전히 6초를 센다.
   *
   * 마우스나 포커스로 멈추는 것은 손으로 만지는 화면에는 없다 —
   * mouseenter 가 안 오기 때문이다. 그쪽에서는 이 되감기가 유일한 방어다.
   */
  useEffect(() => {
    if (!autoAdvance) return;
    const timer = window.setInterval(() => {
      // 읽는 중이면 넘기지 않는다. playing 을 건드리지 않으므로
      // 마우스를 치우면 저절로 다시 흐른다.
      if (hoveredRef.current || focusedRef.current) return;
      setIndex((i) => (i + 1) % count);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [autoAdvance, count, intervalMs, index]);

  /**
   * 넘길 만큼 밀었는가.
   *
   * **세로로 더 많이 움직였으면 화면을 굴린 것이다.** 그때 배너를 넘기면
   * 목록을 내리려던 사람이 엉뚱한 배너를 보게 된다. 가로가 더 크고, 그
   * 가로도 손이 떨린 정도(SWIPE_MIN)를 넘겼을 때만 넘긴다.
   */
  function onTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function onTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchRef.current;
    touchRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return;

    // 왼쪽으로 밀면 다음 장. 종이를 넘기는 방향과 같다.
    goTo(index + (dx < 0 ? 1 : -1), true);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(index - 1, true);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(index + 1, true);
    }
  }

  if (count === 0) return null;

  return (
    <section
      aria-label={label}
      // 역할 설명을 붙여야 스크린리더가 "지역" 이 아니라 "캐러셀" 로 읽는다
      aria-roledescription="캐러셀"
      className={cn('relative', className)}
      onMouseEnter={() => { hoveredRef.current = true; }}
      onMouseLeave={() => { hoveredRef.current = false; }}
      onFocusCapture={() => { focusedRef.current = true; }}
      onBlurCapture={() => { focusedRef.current = false; }}
    >
      <div
        id={`${baseId}-slides`}
        // 키보드 좌우 이동. tabIndex 를 주지 않으면 화살표를 받을 수 없다.
        role="group"
        tabIndex={single ? -1 : 0}
        onKeyDown={single ? undefined : onKeyDown}
        {...(single ? {} : { onTouchStart, onTouchEnd })}
        aria-label={single ? undefined : '좌우 화살표 키로 배너를 넘길 수 있습니다'}
        /*
         * touch-pan-y 는 "세로로 굴리는 것은 브라우저가, 가로는 우리가"
         * 라는 말이다. 이걸 안 붙이면 가로로 미는 동안 브라우저가 제
         * 몸짓(뒤로 가기 같은 것)을 먼저 집어 간다.
         */
        className="relative touch-pan-y overflow-hidden rounded-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      >
        {slides.map((slide, i) => {
          const current = i === index;
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="슬라이드"
              aria-label={`${count}개 중 ${i + 1}번째`}
              // 보이지 않는 슬라이드는 접근성 트리에서도 빼고 포커스도 막는다.
              // hidden 만 쓰면 전환 애니메이션을 넣을 수 없고, aria-hidden 만
              // 쓰면 링크에 탭이 들어간다.
              {...(current ? {} : { inert: true })}
              aria-hidden={current ? undefined : true}
              className={cn(
                current ? 'block' : 'hidden',
              )}
            >
              {slide.content}
            </div>
          );
        })}
      </div>

      {!single && (
        <>
          {/*
            조작 장치를 한 줄에 모은다.
            화살표를 세로 중앙 양옆에 두면 **왼쪽 정렬 본문과 반드시 겹친다** —
            글이 시작하는 자리가 곧 화살표가 있는 자리다. 슬라이드 문구는
            어드민에서 바꾸므로 길이를 예측할 수도 없다. 자리를 비켜 주는
            대신 아예 겹치지 않는 곳으로 옮겼다.
          */}
          <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3 md:bottom-6">
            <CarouselArrow
              direction="prev"
              label={`이전 배너 (${count}개 중 ${index + 1}번째)`}
              onClick={() => goTo(index - 1, true)}
            />

            <ul className="flex items-center gap-2">
              {slides.map((slide, i) => (
                <li key={slide.id}>
                  <button
                    type="button"
                    onClick={() => goTo(i, true)}
                    // 현재 위치를 색으로만 알리지 않는다
                    aria-current={i === index ? 'true' : undefined}
                    aria-label={`${i + 1}번째 배너로 이동`}
                    className={cn(
                      'block h-2.5 w-2.5 rounded-full border border-n-900/30 transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]',
                      i === index ? 'bg-[var(--brand)]' : 'bg-n-900/15 hover:bg-n-900/35',
                    )}
                  />
                </li>
              ))}
            </ul>

            {/* 자동으로 움직이는 콘텐츠에는 멈추는 수단이 있어야 한다 */}
            {!reduceMotion && intervalMs > 0 && (
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? '배너 자동 넘김 멈춤' : '배너 자동 넘김 시작'}
                className="ml-1 flex h-7 w-7 items-center justify-center rounded-full border border-n-900/30 bg-n-0/70 text-[10px] text-n-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
              >
                <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
              </button>
            )}

            <CarouselArrow
              direction="next"
              label={`다음 배너 (${count}개 중 ${index + 1}번째)`}
              onClick={() => goTo(index + 1, true)}
            />
          </div>
        </>
      )}

      {/* 사용자가 눌러 이동했을 때만 채워진다 */}
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </section>
  );
}

function CarouselArrow({
  direction, label, onClick,
}: {
  direction: 'prev' | 'next';
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-n-900/20 bg-n-0/80 text-n-900 backdrop-blur-sm transition-colors hover:bg-n-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
    >
      <span aria-hidden="true">{direction === 'prev' ? '‹' : '›'}</span>
    </button>
  );
}
