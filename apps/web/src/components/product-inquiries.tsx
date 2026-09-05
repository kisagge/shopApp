import type { SessionUser } from '@shop/auth/session';
import { getProductInquiries } from '~/lib/queries/inquiries';
import { InquirySection } from './inquiry-section';
import { getT } from '~/lib/i18n/server';

/**
 * 문의를 읽어 와 그리는 자리.
 *
 * 리뷰와 같은 이유로 껍데기를 따로 둔다 — InquirySection 은 값만 받는다.
 */
export async function ProductInquiries({
  productId,
  viewer,
}: {
  productId: string;
  // 비공개 문의를 거를 수 있게 보는 사람을 그대로 넘긴다
  viewer: SessionUser | null;
}) {
  const [t, inquiries] = await Promise.all([getT(), getProductInquiries(productId, viewer)]);

  return (
    <InquirySection
      productId={productId}
      inquiries={inquiries.items}
      loggedIn={viewer !== null}
      t={t}
    />
  );
}
