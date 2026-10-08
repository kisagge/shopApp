import { describe, it, expect } from 'vitest';
import { readOrderSearch, readDateRange, OrderSearchError } from '../src/order-search';

describe('검색어 읽기', () => {
  it('빈 값은 조건이 없다', () => {
    expect(readOrderSearch(undefined).kind).toBe('none');
    expect(readOrderSearch('').kind).toBe('none');
    expect(readOrderSearch('   ').kind).toBe('none');
  });

  it('앞뒤 공백을 걷어낸다 — 붙여넣으면 자주 딸려 온다', () => {
    expect(readOrderSearch('  20260831-8842713 ')).toEqual({
      kind: 'orderNo', value: '20260831-8842713',
    });
  });

  it('완전한 주문번호는 정확히 일치로 찾는다', () => {
    // orderNo 에 유니크 인덱스가 있다. 부분 일치로 던지면 그걸 못 쓴다.
    expect(readOrderSearch('20260831-8842713').kind).toBe('orderNo');
  });

  it('숫자 조각은 번호의 일부로 본다 — 전화로 뒷자리만 받아 적는 일이 흔하다', () => {
    expect(readOrderSearch('8842713').kind).toBe('orderNoPartial');
    expect(readOrderSearch('20260831-').kind).toBe('orderNoPartial');
  });

  it('짧은 숫자는 번호로 보지 않는다', () => {
    // "123" 으로 부분 일치를 걸면 거의 모든 주문이 걸린다
    expect(readOrderSearch('123').kind).toBe('buyer');
  });

  /**
   * **전화번호가 주문번호 조각으로 빨려 들어가고 있었다.**
   *
   * 숫자와 하이픈이면 전부 번호의 일부로 읽었는데 "010-1234-5678" 이 바로 그 모양이다 — 주문번호에
   * 그런 조각이 있을 리 없으니 **언제나 0건**이 나왔고, 운영자는 "그런 주문이 없습니다" 라고 답하게
   * 된다. 조용히 틀리는 종류다. 택배사와 고객센터가 쥐고 오는 것이 바로 전화번호라 더 그렇다.
   */
  describe('전화번호', () => {
    it('하이픈을 넣든 빼든 같은 값으로 읽는다 — 저장할 때 쓴 함수와 같은 것을 쓴다', () => {
      expect(readOrderSearch('010-1234-5678')).toEqual({ kind: 'phone', value: '010-1234-5678' });
      expect(readOrderSearch('01012345678')).toEqual({ kind: 'phone', value: '010-1234-5678' });
    });

    /** 받는 사람 번호로 저장되는 것은 휴대폰뿐이다(PHONE_PATTERN 이 01X 만 받는다) — 10~11자리 */
    it('열 자리 휴대폰도 전화로 본다', () => {
      expect(readOrderSearch('016-123-4567').kind).toBe('phone');
    });

    it('아홉 자리 유선번호는 전화로 보지 않는다 — 저장될 수 없는 모양이다', () => {
      expect(readOrderSearch('02-123-4567').kind).toBe('orderNoPartial');
    });

    it('주문번호는 전화로 읽지 않는다 — 길이가 다르다', () => {
      expect(readOrderSearch('20260831-8842713').kind).toBe('orderNo');
      // 날짜 여덟 자리는 번호의 일부다. 부분으로 칠 때 열한 자리를 치지는 않는다
      expect(readOrderSearch('20260831').kind).toBe('orderNoPartial');
      expect(readOrderSearch('8842713').kind).toBe('orderNoPartial');
    });

    it('이름에 섞인 숫자는 전화가 아니다', () => {
      expect(readOrderSearch('김010-1234-5678').kind).toBe('buyer');
    });
  });

  it('그 밖은 이름으로 본다', () => {
    expect(readOrderSearch('김민수')).toEqual({ kind: 'buyer', value: '김민수' });
    expect(readOrderSearch('demo').kind).toBe('buyer');
  });
});

describe('기간 읽기', () => {
  it('없으면 양쪽 다 열려 있다', () => {
    expect(readDateRange(undefined, undefined)).toEqual({ from: null, until: null });
  });

  it('시작은 그날 00:00 KST 다', () => {
    // UTC 로 자르면 오전 9시 이전 주문이 전날로 밀린다
    const { from } = readDateRange('2026-09-04', undefined);
    expect(from?.toISOString()).toBe('2026-09-03T15:00:00.000Z');
  });

  it('끝날을 포함한다 — 다음 날 00:00 KST 미만', () => {
    // 여기를 그날 00:00 으로 두면 하루치가 조용히 사라진다
    const { until } = readDateRange(undefined, '2026-09-04');
    expect(until?.toISOString()).toBe('2026-09-04T15:00:00.000Z');
  });

  it('같은 날을 시작·종료로 주면 그 하루가 통째로 들어온다', () => {
    const { from, until } = readDateRange('2026-09-04', '2026-09-04');
    expect(until!.getTime() - from!.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('시작이 종료보다 뒤면 거절한다', () => {
    expect(() => readDateRange('2026-09-05', '2026-09-04')).toThrow(OrderSearchError);
  });

  it('없는 날짜를 거절한다', () => {
    // Date.UTC 는 2026-02-31 을 조용히 3월로 굴린다
    expect(() => readDateRange('2026-02-31', undefined)).toThrow(OrderSearchError);
    expect(() => readDateRange('아무거나', undefined)).toThrow(OrderSearchError);
  });
});
