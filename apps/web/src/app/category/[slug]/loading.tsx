import { GridSkeleton } from '~/components/section-skeleton';

/** 카테고리로 넘어가는 동안. 격자 자리를 미리 잡아 도착했을 때 튀지 않게 한다. */
export default function Loading() {
  return <GridSkeleton />;
}
