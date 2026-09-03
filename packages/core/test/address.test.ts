import { describe, it, expect } from 'vitest';
import { isRemoteAreaPostalCode, remoteAreaLabel, normalizePhone } from '../src/address';

describe('도서산간 판정', () => {
  it('제주 우편번호를 잡는다', () => {
    expect(isRemoteAreaPostalCode('63000')).toBe(true);
    expect(isRemoteAreaPostalCode('63309')).toBe(true); // 제주시
    expect(isRemoteAreaPostalCode('63644')).toBe(true); // 서귀포 끝
    expect(remoteAreaLabel('63309')).toBe('제주특별자치도');
  });

  it('울릉·옹진 도서를 잡는다', () => {
    expect(remoteAreaLabel('40200')).toBe('울릉군');
    expect(remoteAreaLabel('23100')).toBe('인천 옹진군 도서');
  });

  it('경계 바로 바깥은 아니다', () => {
    expect(isRemoteAreaPostalCode('62999')).toBe(false);
    expect(isRemoteAreaPostalCode('63645')).toBe(false);
    expect(isRemoteAreaPostalCode('40241')).toBe(false);
  });

  it('육지는 아니다', () => {
    expect(isRemoteAreaPostalCode('04766')).toBe(false); // 서울 성동구
    expect(isRemoteAreaPostalCode('06236')).toBe(false); // 서울 강남구
  });

  it('형식이 아니면 false — 판정 못 하는 값에 요금을 물리지 않는다', () => {
    expect(isRemoteAreaPostalCode('')).toBe(false);
    expect(isRemoteAreaPostalCode('633')).toBe(false);
    expect(isRemoteAreaPostalCode('63309-1')).toBe(false);
    expect(isRemoteAreaPostalCode('abcde')).toBe(false);
  });

  it('앞뒤 공백은 무시한다', () => {
    expect(isRemoteAreaPostalCode(' 63309 ')).toBe(true);
  });
});

describe('휴대폰 번호 통일', () => {
  it('어떻게 넣어도 한 모양으로 저장한다', () => {
    // 같은 번호가 두 모양으로 저장되면 목록에서 중복을 못 알아본다
    expect(normalizePhone('01012345678')).toBe('010-1234-5678');
    expect(normalizePhone('010 1234 5678')).toBe('010-1234-5678');
    expect(normalizePhone('010-1234-5678')).toBe('010-1234-5678');
  });

  it('10자리 번호도 다룬다', () => {
    expect(normalizePhone('0111234567')).toBe('011-123-4567');
  });

  it('모르는 형식은 건드리지 않는다', () => {
    expect(normalizePhone('연락처없음')).toBe('연락처없음');
  });
});
