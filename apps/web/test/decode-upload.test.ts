import { describe, it, expect } from 'vitest';
import { decodeUpload } from '~/lib/csv/decode-upload';

/**
 * 한국어 엑셀은 CSV 를 CP949 로 저장한다. 내려받은 파일(UTF-8)을 열어 송장을
 * 채우고 저장하는 순간 인코딩이 바뀐다.
 */

// "주문번호" 를 CP949 로 적은 바이트
const CP949 = new Uint8Array([0xc1, 0xd6, 0xb9, 0xae, 0xb9, 0xf8, 0xc8, 0xa3]);

describe('올린 CSV 읽기', () => {
  it('UTF-8 은 그대로 읽는다', () => {
    expect(decodeUpload(new TextEncoder().encode('주문번호,택배사'))).toBe('주문번호,택배사');
  });

  it('엑셀이 CP949 로 저장한 파일도 읽는다', () => {
    expect(decodeUpload(CP949)).toBe('주문번호');
  });

  it('BOM 은 남겨 두고 CSV 해석이 벗긴다', () => {
    // 여기서 벗기면 BOM 을 아는 곳이 둘이 된다
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a')]);
    expect(decodeUpload(bytes).replace(/^\uFEFF/, '')).toBe('a');
  });
});
