/**
 * 하트.
 *
 * **글자가 아니라 그림이어야 한다.** 예전에는 `♥`(U+2665)와 `♡`(U+2661) 두 **문자**를 켜고 끄며 썼는데, 그 둘은
 * 서로 다른 글자라 기기마다 다른 폰트에서 온다 — 안드로이드는 찬 하트를 **컬러 이모지**로, 빈 하트를 텍스트 폰트로
 * 그리는 일이 흔하다. 그래서 앱에서 켠 것과 끈 것의 크기·굵기가 달라 보였다(PC 는 둘 다 같은 폰트라 티가 안 났다).
 *
 * 같은 path 하나를 두고 **채우기만 바꾼다.** 그러면 어느 기기에서든 윤곽이 같고, 폰트에 기대지 않는다.
 *
 * 장식이다 — 상태와 이름은 버튼이 말한다(aria-label). 그래서 `aria-hidden` 이다.
 */
export function HeartIcon({
  filled,
  className = 'h-5 w-5',
}: {
  filled: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.6}
      strokeLinejoin="round"
    >
      <path d="M12 20.7 4.3 13a4.9 4.9 0 0 1 0-7 4.9 4.9 0 0 1 7 0l.7.7.7-.7a4.9 4.9 0 0 1 7 0 4.9 4.9 0 0 1 0 7Z" />
    </svg>
  );
}
