import type { Actor } from './authz';
import { hasPermission, ownsMerchant } from './authz';

/**
 * 정산 계좌.
 *
 * 스키마에는 처음부터 칸이 있었는데 **읽는 곳도 쓰는 곳도 없었다.** 그래서 계좌를 한 번도 적지 않은 가맹점의 정산도
 * "지급됨" 이 됐다 — 돈이 어디로 갔다는 말인지 아무도 답할 수 없는 기록이다. 반품지가 없으면 반품을 승인할 수 없게 한 것과
 * 같은 자리다.
 */

/**
 * 은행 목록.
 *
 * **고르게 한다.** 자유 입력으로 두면 "국민" · "국민은행" · "KB국민" 이 한 표에 섞이고, 지급하는 사람은 그중 어느 것이
 * 진짜인지 확인할 방법이 없다. 돈을 보내는 자리라 오타 하나가 곧 사고다.
 *
 */
export const SETTLEMENT_BANK = [
  'KB', 'SHINHAN', 'WOORI', 'HANA', 'NH', 'IBK', 'SC', 'KAKAO', 'TOSS', 'KBANK',
  'BUSAN', 'DAEGU', 'GWANGJU', 'JEONBUK', 'KYONGNAM', 'SUHYUP', 'POST', 'CITI',
] as const;
export type SettlementBank = (typeof SETTLEMENT_BANK)[number];

/**
 * 은행 이름표.
 *
 * **여기 둔다.** 이 목록이 뜨는 곳은 운영 화면뿐이고, 운영 화면은 한국어 한 벌이다 — 가맹점 상태 이름표(MERCHANT_STATUS_LABEL)와
 * 같은 자리다. 손님 화면에 은행 이름이 뜨는 날이 오면 그때 사전으로 옮긴다.
 */
export const SETTLEMENT_BANK_LABEL: Readonly<Record<SettlementBank, string>> = {
  KB: 'KB국민은행', SHINHAN: '신한은행', WOORI: '우리은행', HANA: '하나은행',
  NH: 'NH농협은행', IBK: 'IBK기업은행', SC: 'SC제일은행',
  KAKAO: '카카오뱅크', TOSS: '토스뱅크', KBANK: '케이뱅크',
  BUSAN: '부산은행', DAEGU: 'iM뱅크', GWANGJU: '광주은행', JEONBUK: '전북은행',
  KYONGNAM: '경남은행', SUHYUP: '수협은행', POST: '우체국예금', CITI: '씨티은행',
};

export const isSettlementBank = (value: unknown): value is SettlementBank =>
  typeof value === 'string' && (SETTLEMENT_BANK as readonly string[]).includes(value);

export interface SettlementAccount {
  readonly settlementBank: string | null;
  readonly settlementAccount: string | null;
  readonly settlementHolder: string | null;
}

/**
 * 돈을 보낼 수 있는 계좌인가.
 *
 * **셋이 다 있어야 한다.** 은행만 있고 번호가 없으면 보낼 수 없고, 번호만 있고 예금주가 없으면 보내도 되는지 알 수 없다.
 */
export function hasSettlementAccount(merchant: SettlementAccount): boolean {
  return (
    merchant.settlementBank !== null
    && merchant.settlementAccount !== null
    && merchant.settlementHolder !== null
  );
}

/**
 * 계좌번호를 가린다 — 뒤 네 자리만 남긴다.
 *
 * 목록·감사 로그처럼 **확인만 하면 되는 자리**에 전체를 늘어놓지 않는다. 뒤 네 자리는 "그 계좌가 맞는지" 를 가리기에는
 * 충분하고, 새는 순간의 피해는 훨씬 작다.
 */
export function maskAccount(account: string | null): string | null {
  if (account === null) return null;
  const digits = account.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/**
 * 이 사람이 이 가맹점의 연락처·정산 계좌를 고칠 수 있는가.
 *
 * 가맹점은 자기 것만, 운영진은 어디든 — 계좌가 바뀌었다고 전화로 알려 오는 일이 있고, 그때 고쳐 줄 수 있어야 한다.
 * 어느 쪽이든 감사 로그에 남는다.
 */
export function canEditMerchantSettings(actor: Actor, merchantId: string): boolean {
  if (!hasPermission(actor, 'merchant:write')) return false;
  return actor.merchantId === null || ownsMerchant(actor, merchantId);
}

/**
 * 사업자 정보(상호·사업자등록번호·대표자)를 고칠 수 있는가.
 *
 * **가맹점은 못 고친다.** 정산과 세금계산서가 이 값을 근거로 삼는다 — 스스로 바꿀 수 있으면 돈 받는 주체가 심사 없이
 * 바뀐다. 바꿀 일이 생기면 운영진에게 말하고, 그 사실이 감사 로그에 남는 편이 옳다.
 */
export function canEditBusinessInfo(actor: Actor): boolean {
  return hasPermission(actor, 'merchant:write') && actor.merchantId === null;
}
