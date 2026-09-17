import { describe, it, expect } from 'vitest';
import {
  readStockUpload, parseStock, parseActive, activeLabel, parseCsv, csvDocument, STOCK_MAX, stockUploadDecision,
} from '../src';

/**
 * 재고 일괄 수정 파일 읽기.
 *
 * 틀리면 **없는 물건을 팔거나 있는 물건을 품절로 보인다.** 그래서 애매한 것은 추측하지 않고
 * 문제로 돌려준다 — 소수, 글자, 같은 SKU 의 다른 숫자.
 */

const HEADER = ['SKU', '상품', '옵션', '판매', '재고'];

describe('머리칸', () => {
  it('SKU 와 재고가 없으면 무엇이 없는지 말한다', () => {
    expect(readStockUpload([['상품', '수량']]).problems).toEqual([{ kind: 'NO_HEADER', missing: ['SKU', '재고'] }]);
  });

  it('칸 순서가 아니라 이름으로 찾는다 — 엑셀에서 칸을 옮겨도 된다', () => {
    const up = readStockUpload([['재고', '메모', 'sku'], ['7', '', 'coat-oat-m']]);
    expect(up.entries).toEqual([{ sku: 'COAT-OAT-M', stock: 7, isActive: null, base: null, line: 2 }]);
  });

  it('판매 칸은 없어도 된다 — 재고만 고치는 게 보통이다', () => {
    expect(readStockUpload([['SKU', '재고'], ['A-1', '3']]).problems).toEqual([]);
  });
});

describe('숫자', () => {
  it('천 단위 쉼표는 받고, 소수·음수·글자·상한 초과는 거절한다', () => {
    expect(parseStock('1,200')).toBe(1200);
    expect(parseStock(' 0 ')).toBe(0);
    expect(parseStock('1.5')).toBeNull();
    expect(parseStock('-3')).toBeNull();
    expect(parseStock('12개')).toBeNull();
    expect(parseStock(String(STOCK_MAX + 1))).toBeNull();
  });

  it('틀린 숫자는 줄 번호와 적힌 값으로 돌려준다', () => {
    const up = readStockUpload([HEADER, ['A-1', '코트', 'M', '', '1.5']]);
    expect(up.problems).toEqual([{ kind: 'INVALID_STOCK', line: 2, sku: 'A-1', value: '1.5' }]);
    expect(up.entries).toEqual([]);
  });

  it('재고 칸이 빈 줄은 건너뛴다 — 실패가 아니다', () => {
    const up = readStockUpload([HEADER, ['A-1', '코트', 'M', '', ''], ['A-2', '코트', 'L', '', '4']]);
    expect(up.skipped).toBe(1);
    expect(up.entries.map((e) => e.sku)).toEqual(['A-2']);
  });
});

describe('판매 여부', () => {
  it('내보낸 말(판매중·판매중지)과 흔한 표기를 받고, 비우면 건드리지 않는다', () => {
    expect(parseActive(activeLabel(true))).toBe(true);
    expect(parseActive(activeLabel(false))).toBe(false);
    expect(parseActive('Y')).toBe(true);
    expect(parseActive('n')).toBe(false);
    expect(parseActive('')).toBeNull();
    expect(parseActive('아마도')).toBeUndefined();
  });

  it('모르는 말이면 그 줄을 적용하지 않는다', () => {
    const up = readStockUpload([HEADER, ['A-1', '', '', '보류', '3']]);
    expect(up.problems).toEqual([{ kind: 'INVALID_ACTIVE', line: 2, sku: 'A-1', value: '보류' }]);
  });
});

describe('같은 SKU', () => {
  it('값이 같으면 한 번만, 다르면 추측하지 않고 둘 다 돌려준다', () => {
    const up = readStockUpload([
      HEADER,
      ['A-1', '', '', '', '3'],
      ['a-1', '', '', '', '3'],
      ['B-1', '', '', '', '5'],
      ['B-1', '', '', '', '6'],
    ]);
    expect(up.entries).toEqual([{ sku: 'A-1', stock: 3, isActive: null, base: null, line: 2 }]);
    expect(up.problems).toEqual([{ kind: 'CONFLICT', sku: 'B-1', lines: [4, 5] }]);
  });
});

describe('내려받은 파일을 그대로', () => {
  it('BOM·따옴표가 붙은 우리 파일을 되읽는다', () => {
    const file = csvDocument(HEADER, [['COAT-OAT-M', '울 코트, 오트', '오트 / M', '판매중', 12]]);
    const up = readStockUpload(parseCsv(file));
    // 이 머리칸에는 내려받은 재고 칸이 없다 — 기준 없는 파일로 읽힌다
    expect(up.entries).toEqual([{ sku: 'COAT-OAT-M', stock: 12, isActive: true, base: null, line: 2 }]);
  });
});

describe('내려받은 재고 칸', () => {
  const HEADER = ['SKU', '브랜드', '상품', '옵션', '판매', '내려받은 재고', '재고'];
  // 운영 화면이 내려주는 머리칸과 같다(bulk-stock 의 STOCK_CSV_HEADER — 그쪽 검사가 지킨다)

  it('내려받은 파일은 줄마다 내려받을 때의 재고를 함께 읽는다', () => {
    const { entries } = readStockUpload([HEADER, ['coat-m', 'MOOR', '코트', 'M', '판매중', '10', '25']]);
    expect(entries).toEqual([{ sku: 'COAT-M', stock: 25, isActive: true, base: 10, line: 2 }]);
  });

  it('"재고" 칸을 "내려받은 재고" 로 잘못 읽지 않는다 — 머리칸 이름이 겹친다', () => {
    const { entries } = readStockUpload([HEADER, ['A', '', '', '', '', '10', '3']]);
    expect(entries[0]).toMatchObject({ stock: 3, base: 10 });
  });

  it('그 칸이 없는 파일은 기준이 없다(사람이 만든 실사 파일)', () => {
    const { entries } = readStockUpload([['SKU', '재고'], ['A', '3']]);
    expect(entries[0]!.base).toBeNull();
  });

  it('그 칸을 못 읽으면 기준이 없는 것으로 본다', () => {
    const { entries } = readStockUpload([HEADER, ['A', '', '', '', '', '열', '3']]);
    expect(entries[0]!.base).toBeNull();
  });

  it('같은 SKU 가 두 줄이고 기준만 다르면 추측하지 않는다', () => {
    const { entries, problems } = readStockUpload([HEADER, ['A', '', '', '', '', '10', '3'], ['A', '', '', '', '', '9', '3']]);
    expect(entries).toEqual([]);
    expect(problems).toEqual([{ kind: 'CONFLICT', sku: 'A', lines: [2, 3] }]);
  });
});

/**
 * 올린 줄을 어떻게 할까.
 *
 * 10시에 받은 파일(재고 10)을 11시에 올리면 그사이 3개가 팔려 지금은 7이다. 예전에는 "파일과 지금이
 * 다르다" 로 고친 줄을 가려서, 손대지 않은 줄까지 10 으로 되돌렸다 — 없는 물건 3개.
 */
describe('올린 줄을 어떻게 할까', () => {
  const now = (stock: number, isActive = true) => ({ stock, isActive });

  it('손대지 않은 줄은 그사이 팔렸어도 그대로 둔다', () => {
    expect(stockUploadDecision({ entry: { stock: 10, base: 10, isActive: null }, current: now(7) }))
      .toEqual({ kind: 'UNCHANGED' });
  });

  it('고친 줄은 내려받은 값일 때만 쓴다', () => {
    expect(stockUploadDecision({ entry: { stock: 25, base: 10, isActive: null }, current: now(10) }))
      .toEqual({ kind: 'APPLY', stock: 25, expected: 10 });
  });

  it('고쳤는데 그사이 움직였으면 쓰지 않는다 — 옛 재고를 보고 적은 숫자다', () => {
    expect(stockUploadDecision({ entry: { stock: 25, base: 10, isActive: null }, current: now(7) }))
      .toEqual({ kind: 'MOVED', base: 10, current: 7 });
  });

  it('판매 여부만 바꿨으면 재고는 지금 값으로 둔다', () => {
    expect(stockUploadDecision({ entry: { stock: 10, base: 10, isActive: false }, current: now(7, true) }))
      .toEqual({ kind: 'APPLY', stock: 7, expected: 7 });
  });

  it('판매 여부를 지금과 같게 적었으면 바꾼 것이 아니다', () => {
    expect(stockUploadDecision({ entry: { stock: 10, base: 10, isActive: true }, current: now(7, true) }))
      .toEqual({ kind: 'UNCHANGED' });
  });

  describe('기준이 없는 파일(사람이 만든 실사 파일)', () => {
    it('다르면 덮어쓴다 — 실사 결과가 곧 재고라는 뜻으로 올렸다', () => {
      expect(stockUploadDecision({ entry: { stock: 25, base: null, isActive: null }, current: now(7) }))
        .toEqual({ kind: 'APPLY', stock: 25, expected: null });
    });

    it('같으면 건드리지 않는다', () => {
      expect(stockUploadDecision({ entry: { stock: 7, base: null, isActive: null }, current: now(7) }))
        .toEqual({ kind: 'UNCHANGED' });
    });
  });
});
