'use client';

import { Button } from '@shop/ui';
import { useT } from '~/lib/i18n/client';

/**
 * 인쇄 단추.
 *
 * 브라우저의 인쇄 창을 연다 — 종이로 뽑든 PDF 로 저장하든 거기서 고른다. 우리가 PDF 를 따로 만들지 않는 이유는
 * 화면과 종이를 한 마크업으로 두기 위해서다(order-receipt).
 *
 * 인쇄된 종이에 이 단추가 찍히면 안 되므로 스스로 숨는다.
 */
export function PrintButton() {
  const t = useT();
  return (
    <Button type="button" size="lg" onClick={() => window.print()} className="print:hidden">
      {t('receipt.print')}
    </Button>
  );
}
