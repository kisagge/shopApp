import { describe, it, expect } from 'vitest';
import { csvDocument, parseCsv } from '../src/csv';
import { readShipmentUpload, resolveCarrier } from '../src/shipment-upload';

/**
 * 송장 일괄 올리기 파일 읽기.
 */

const upload = (header: string[], rows: string[][]) => readShipmentUpload(parseCsv(csvDocument(header, rows)));

describe('내려받은 파일을 그대로 받는다', () => {
  it('내보내기의 머리칸으로 칸을 찾는다 — 순서에 기대지 않는다', () => {
    /*
     * **여기가 이 묶음의 요점이다.** 주문을 내려받아 송장번호를 채워 다시 올리는 것이
     * 이 기능의 실제 쓰임이다. 우리가 내보낸 파일을 우리가 못 읽으면 운영자는 칸을
     * 손으로 옮겨 적어야 하고, 그러다 송장이 엉뚱한 줄에 붙는다.
     */
    const result = upload(
      ['주문번호', '주문일시', '상태', '받는 사람', '연락처', '우편번호', '주소', '배송 메모',
        '상품', '옵션', '수량', '금액', '택배사', '송장번호'],
      [['20260901-1234567', '2026-09-01 10:00', '배송준비', '김수령', '010', '04766', '서울', '',
        '코트', 'M', '1', '289000', 'CJ대한통운', '123456789012']],
    );

    expect(result.problems).toEqual([]);
    expect(result.entries).toEqual([
      { orderNo: '20260901-1234567', carrier: 'CJ', trackingNumber: '123456789012', line: 2 },
    ]);
  });

  it('세 칸짜리 짧은 파일도 받는다', () => {
    const result = upload(['주문번호', '택배사', '송장번호'], [['20260901-1234567', 'CJ', '1234']]);
    expect(result.entries).toHaveLength(1);
  });

  it('필요한 머리칸이 없으면 무엇이 없는지 말한다', () => {
    const result = upload(['주문번호', '송장'], [['20260901-1234567', '1234']]);
    expect(result.problems).toEqual([{ kind: 'NO_HEADER', missing: ['택배사', '송장번호'] }]);
    expect(result.entries).toEqual([]);
  });
});

describe('한 주문이 여러 줄로 온다', () => {
  it('항목마다 같은 송장이면 한 번만 등록한다', () => {
    // 내보낸 파일은 항목 하나당 한 줄이다. 줄마다 등록하면 같은 송장을 여러 번 쓴다
    const result = upload(['주문번호', '택배사', '송장번호'], [
      ['20260901-1234567', 'CJ', '111'],
      ['20260901-1234567', 'CJ', '111'],
      ['20260901-1234567', 'CJ', '111'],
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });

  it('같은 주문에 송장이 둘이면 추측하지 않는다', () => {
    /*
     * 한 줄만 고치고 다른 줄을 깜빡한 경우가 대부분인데 어느 쪽이 새것인지 모른다.
     * 고르면 절반의 확률로 손님이 남의 택배를 조회한다.
     */
    const result = upload(['주문번호', '택배사', '송장번호'], [
      ['20260901-1234567', 'CJ', '111'],
      ['20260901-1234567', 'CJ', '222'],
    ]);
    expect(result.entries, '둘 중 하나를 골랐다').toEqual([]);
    expect(result.problems).toEqual([
      { kind: 'CONFLICT', orderNo: '20260901-1234567', lines: [2, 3] },
    ]);
  });

  it('한 줄만 채우고 나머지가 비어 있으면 채운 것을 쓴다', () => {
    // 첫 항목 줄에만 송장을 적는 사람이 많다 — 비어 있는 것은 다른 값이 아니다
    const result = upload(['주문번호', '택배사', '송장번호'], [
      ['20260901-1234567', 'CJ', '111'],
      ['20260901-1234567', '', ''],
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });
});

describe('비어 있는 것과 틀린 것은 다르다', () => {
  it('송장번호가 비었으면 실패가 아니라 건너뜀이다', () => {
    /*
     * 일부만 채워 올리는 게 보통이다 — 오늘 나간 것만 적는다. 그걸 실패로 세면
     * 운영자는 "실패 40건" 을 보고 무엇이 잘못됐는지 찾아 헤맨다.
     */
    const result = upload(['주문번호', '택배사', '송장번호'], [
      ['20260901-1234567', 'CJ', '111'],
      ['20260901-7654321', '', ''],
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.problems).toEqual([]);
  });

  it('송장은 있는데 택배사가 없으면 문제다', () => {
    const result = upload(['주문번호', '택배사', '송장번호'], [['20260901-1234567', '', '111']]);
    expect(result.problems).toEqual([
      { kind: 'MISSING_CARRIER', line: 2, orderNo: '20260901-1234567' },
    ]);
  });

  it('모르는 택배사는 적힌 그대로 돌려준다 — 무엇이 틀렸는지 보여야 고친다', () => {
    const result = upload(['주문번호', '택배사', '송장번호'], [['20260901-1234567', '빠른택배', '111']]);
    expect(result.problems).toEqual([
      { kind: 'UNKNOWN_CARRIER', line: 2, orderNo: '20260901-1234567', carrier: '빠른택배' },
    ]);
  });
});

describe('택배사 읽기', () => {
  it.each([
    ['CJ', 'CJ'],
    ['cj', 'CJ'],
    ['CJ대한통운', 'CJ'],
    ['CJ 대한통운', 'CJ'],
    ['우체국택배', 'EPOST'],
  ])('%s → %s', (raw, code) => {
    expect(resolveCarrier(raw)).toBe(code);
  });

  it('모르면 null 이다', () => {
    expect(resolveCarrier('빠른택배')).toBeNull();
    expect(resolveCarrier('')).toBeNull();
  });
});
