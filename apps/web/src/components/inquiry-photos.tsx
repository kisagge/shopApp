import Image from 'next/image';

/**
 * 문의에 붙은 사진 — 쓴 사람의 문의 목록과 답하는 사람의 목록이 함께 쓴다.
 *
 * 원본을 새 탭으로 연다(리뷰 사진과 같이) — 불량 부위를 확대해 봐야 한다. 대체 텍스트는 쓴 사람이 적지 않으므로 몇 번째
 * 사진인지를 우리가 말한다. 링크 이름에 새 탭으로 열린다는 것을 함께 적는다.
 */
export function InquiryPhotos({
  urls,
  altOf,
  labelOf,
  listLabel,
}: {
  urls: readonly string[];
  /** n 번째(1부터) 사진의 대체 텍스트 */
  altOf: (index: number) => string;
  /** n 번째 사진 링크의 이름(새 탭으로 열림 포함) */
  labelOf: (index: number) => string;
  listLabel: string;
}) {
  if (urls.length === 0) return null;
  return (
    <ul aria-label={listLabel} className="flex flex-wrap gap-2">
      {urls.map((url, i) => (
        <li key={url}>
          <a href={url} target="_blank" rel="noreferrer" aria-label={labelOf(i + 1)}>
            <Image
              src={url}
              alt={altOf(i + 1)}
              width={80}
              height={80}
              className="h-20 w-20 rounded-sm border border-[var(--border)] object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
