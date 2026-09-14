import { describe, it, expect } from 'vitest';
import { readStockUpload, parseStock, parseActive, activeLabel, parseCsv, csvDocument, STOCK_MAX } from '../src';

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
    expect(up.entries).toEqual([{ sku: 'COAT-OAT-M', stock: 7, isActive: null, line: 2 }]);
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
    expect(up.entries).toEqual([{ sku: 'A-1', stock: 3, isActive: null, line: 2 }]);
    expect(up.problems).toEqual([{ kind: 'CONFLICT', sku: 'B-1', lines: [4, 5] }]);
  });
});

describe('내려받은 파일을 그대로', () => {
  it('BOM·따옴표가 붙은 우리 파일을 되읽는다', () => {
    const file = csvDocument(HEADER, [['COAT-OAT-M', '울 코트, 오트', '오트 / M', '판매중', 12]]);
    const up = readStockUpload(parseCsv(file));
    expect(up.entries).toEqual([{ sku: 'COAT-OAT-M', stock: 12, isActive: true, line: 2 }]);
  });
});
