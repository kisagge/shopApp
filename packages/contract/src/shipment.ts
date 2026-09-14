import { z } from 'zod';
import { CARRIER_CODE } from '@shop/core';

/**
 * 송장 등록 계약.
 *
 * 송장번호는 하이픈·공백을 섞어 넣어도 받는다. 서버가 숫자만 남겨
 * 저장하므로 입력 단계에서 막을 이유가 없다 — 사람은 종이에 적힌 대로 친다.
 */
export const registerShipmentSchema = z.object({
  carrier: z.enum(CARRIER_CODE),
  trackingNumber: z
    .string()
    .trim()
    .min(1, 'valid.trackingRequired')
    .max(40, 'valid.tooLongChars')
    .refine((v) => {
      const digits = v.replace(/\D/g, '');
      return digits.length >= 9 && digits.length <= 20;
    }, 'valid.trackingFormat'),
});
export type RegisterShipmentInput = z.infer<typeof registerShipmentSchema>;

/**
 * 송장 일괄 올리기.
 *
 * **파일 내용을 글자로 받는다.** 화면이 파일을 읽어 보낸다 — 파싱 규칙은 core 에
 * 하나뿐이고(parseCsv·readShipmentUpload), 서버가 그 규칙으로 다시 읽는다.
 * 브라우저가 칸을 나눠 보내게 하면 그쪽이 둘째 규칙이 된다.
 *
 * 크기를 묶는 이유: 1MB 면 송장 줄 수만 개다. 그보다 크면 주문 파일이 아니라
 * 다른 파일을 잘못 고른 것이다.
 */
export const bulkShipmentSchema = z.object({
  csv: z.string().min(1, 'valid.fileRequired').max(1_000_000, 'valid.tooLongChars'),
});
export type BulkShipmentInput = z.infer<typeof bulkShipmentSchema>;

export interface BulkShipmentResult {
  readonly registered: number;
  /** 송장이 빈 줄 */
  readonly skipped: number;
  /** 이미 같은 송장이 붙어 있어 건드리지 않은 주문 */
  readonly unchanged: number;
  /** 줄 번호와 이유. 파일을 고쳐 다시 올릴 수 있게 무엇이 틀렸는지 적는다 */
  readonly failures: readonly {
    readonly orderNo: string | null;
    readonly lines: readonly number[];
    readonly code: string;
    readonly message: string;
  }[];
}
