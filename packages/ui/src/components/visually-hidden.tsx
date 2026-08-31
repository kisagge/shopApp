import type { ReactNode } from 'react';

/**
 * 화면에는 안 보이지만 스크린리더는 읽는 텍스트.
 * display:none이나 visibility:hidden은 보조기기에서도 사라지므로 쓰면 안 된다.
 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return (
    <span className="absolute -m-px h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap [clip-path:inset(50%)]">
      {children}
    </span>
  );
}
