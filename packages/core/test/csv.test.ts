import { describe, it, expect } from 'vitest';
import { csvCell, csvDocument, csvRow, parseCsv } from '../src/csv';

/**
 * CSV 만들기와 읽기.
 *
 * 내보내기와 올리기가 같은 규칙을 쓴다 — 내보낸 파일을 그대로 다시 올렸는데
 * 못 읽으면 규칙이 두 벌이라는 뜻이다.
 */

describe('수식 주입을 막는다', () => {
  it.each([
    ['=HYPERLINK("http://evil.example","눌러 주세요")'],
    ['+cmd|" /C calc"!A0'],
    ['-2+3'],
    ['@SUM(A1:A9)'],
    ['\t=1+1'],
  ])('%s 는 글자로 읽힌다', (value) => {
    /*
     * **여기가 이 묶음의 요점이다.** 배송 메모나 수령인은 손님이 적은 값이다.
     * 그대로 두면 운영자가 엑셀로 여는 순간 수식으로 실행된다 — 손님이 메모
     * 한 칸으로 운영자의 기계에서 무언가를 돌리게 할 수 있다.
     */
    expect(csvCell(value).replace(/^"/, '').startsWith("'"), `${value} 가 수식 그대로 나간다`).toBe(
      true,
    );
  });

  it('숫자는 수식이 아니다 — 음수 금액을 글자로 만들면 계산을 못 한다', () => {
    expect(csvCell(-12_000)).toBe('-12000');
  });

  it('평범한 글자는 건드리지 않는다', () => {
    expect(csvCell('오버사이즈 울 코트')).toBe('오버사이즈 울 코트');
  });
});

describe('칸 감싸기', () => {
  it('쉼표·따옴표·줄바꿈이 있으면 감싸고 따옴표는 두 번 쓴다', () => {
    expect(csvCell('서울, 성동구')).toBe('"서울, 성동구"');
    expect(csvCell('문 앞 "초인종 X"')).toBe('"문 앞 ""초인종 X"""');
    expect(csvCell('1층\n경비실')).toBe('"1층\n경비실"');
  });

  it('빈 값은 빈 칸이다', () => {
    expect(csvRow([null, undefined, ''])).toBe(',,');
  });
});

describe('파일', () => {
  it('BOM 으로 시작한다 — 없으면 엑셀이 한글을 깨뜨린다', () => {
    expect(csvDocument(['주문번호'], []).charCodeAt(0)).toBe(0xfeff);
  });

  it('줄 끝은 CRLF 다', () => {
    expect(csvDocument(['a'], [['b']])).toContain('a\r\nb\r\n');
  });
});

describe('읽기', () => {
  it('내보낸 것을 그대로 다시 읽는다', () => {
    /*
     * **왕복이 되어야 한다.** 주문을 내려받아 송장번호를 채워 다시 올리는 것이
     * 이 기능의 실제 쓰임이다. 쉼표·따옴표·줄바꿈이 섞인 칸이 한 번 오가며
     * 부서지면 송장이 엉뚱한 주문에 붙는다.
     */
    const rows = [
      ['20260901-1234567', '서울, 성동구', '문 앞 "초인종 X"'],
      ['20260901-7654321', '1층\n경비실', ''],
    ];
    const text = csvDocument(['주문번호', '주소', '메모'], rows);

    expect(parseCsv(text)).toEqual([['주문번호', '주소', '메모'], ...rows]);
  });

  it('BOM 을 걷어 낸다 — 안 걷으면 첫 머리칸 이름이 틀려진다', () => {
    expect(parseCsv('\uFEFF주문번호,송장번호\r\n')[0]?.[0]).toBe('주문번호');
  });

  it('LF 만 쓴 파일도 읽는다', () => {
    // 맥에서 편집기로 저장하면 CR 이 없다
    expect(parseCsv('a,b\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('빈 줄은 버린다', () => {
    expect(parseCsv('a,b\r\n\r\n,\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});
