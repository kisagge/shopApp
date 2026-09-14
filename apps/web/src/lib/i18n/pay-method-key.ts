import type { PaymentMethodInput } from '@shop/contract';
import type { MessageKey } from '@shop/i18n';

/**
 * 결제 수단의 이름표.
 *
 * 결제 화면(클라이언트)과 영수증(서버)이 함께 쓴다. 'use client' 파일에 두면 서버가 값 대신 참조를 받는다 —
 * 그래서 이름표만 따로 뺐다. enum-labels 에 두지 않은 것은 그 파일이 core 의 값 목록을 끌고 와 결제 화면
 * 번들이 커지기 때문이다.
 */
export const PAY_METHOD_KEY: Record<PaymentMethodInput, MessageKey> = {
  CARD: 'payMethod.CARD',
  TRANSFER: 'payMethod.TRANSFER',
  VIRTUAL_ACCOUNT: 'payMethod.VIRTUAL_ACCOUNT',
  EASY_PAY: 'payMethod.EASY_PAY',
};
