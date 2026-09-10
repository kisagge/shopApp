import { describe, it, expect } from 'vitest';
import { paymentMode, type PaymentModeInput } from '../src/payment-mode';

/** 아무것도 없는 로컬 개발 — 나머지 사례는 여기서 필요한 것만 뒤집는다 */
const local: PaymentModeInput = {
  hasSecretKey: false,
  hasClientKey: false,
  liveDeployment: false,
  mockDemanded: false,
  demoPayment: false,
  production: false,
};

const at = (patch: Partial<PaymentModeInput>) => paymentMode({ ...local, ...patch });

describe('결제 방식 판단', () => {
  it('로컬에서 키가 없으면 Mock 으로 돈다', () => {
    expect(at({})).toEqual({ mode: 'mock' });
  });

  it('두 키가 다 있으면 결제창을 띄운다', () => {
    expect(at({ hasSecretKey: true, hasClientKey: true })).toEqual({ mode: 'window' });
  });

  /**
   * **이 검사가 실제 사고를 재현한다.**
   *
   * 배포에 두 키가 다 없었다. 브라우저는 클라이언트 키만 보고 Mock 으로
   * 갔고 서버는 시크릿 키를 보고 던졌다. 주문은 만들어지고 확정만 500 이
   * 났다. 어느 쪽이든 **막혀야** 한다 — 한쪽만 진행하면 안 된다.
   */
  it('프로덕션인데 키가 없으면 막는다 — 주문만 만들어지고 확정이 터지던 자리', () => {
    expect(at({ production: true })).toEqual({ mode: 'blocked', reason: 'NO_SECRET_KEY' });
  });

  it('시크릿만 있고 클라이언트 키가 없으면 막는다 — 결제창을 띄울 수 없다', () => {
    expect(at({ hasSecretKey: true, production: true })).toEqual({
      mode: 'blocked',
      reason: 'NO_CLIENT_KEY',
    });
  });

  describe('Mock 을 대놓고 요구했을 때', () => {
    it('검사·로컬에서는 Mock 으로 돈다', () => {
      expect(at({ mockDemanded: true, production: true })).toEqual({ mode: 'mock' });
    });

    it('운영 배포에서는 데모 선언 없이 못 켠다', () => {
      expect(at({ mockDemanded: true, liveDeployment: true })).toEqual({
        mode: 'blocked',
        reason: 'MOCK_IN_LIVE',
      });
    });

    it('데모라고 선언하면 운영 배포에서도 Mock 으로 돈다', () => {
      expect(at({ mockDemanded: true, liveDeployment: true, demoPayment: true })).toEqual({
        mode: 'mock',
      });
    });

    it('진짜 키가 있으면 데모 선언이 있어도 막는다 — 요구와 키가 어긋났다', () => {
      expect(
        at({ mockDemanded: true, hasSecretKey: true, liveDeployment: true, demoPayment: true }),
      ).toEqual({ mode: 'blocked', reason: 'MOCK_WITH_REAL_KEY' });
    });
  });

  /**
   * 데모 스위치는 **Mock 을 요구했을 때만** 듣는다. 켜 뒀다는 이유로
   * 키가 없는 프로덕션이 조용히 Mock 으로 돌면 스위치를 나눈 뜻이 없다.
   */
  it('데모 선언만으로는 아무것도 열리지 않는다', () => {
    expect(at({ demoPayment: true, production: true })).toEqual({
      mode: 'blocked',
      reason: 'NO_SECRET_KEY',
    });
  });
});
