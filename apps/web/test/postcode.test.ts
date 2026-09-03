import { describe, it, expect } from 'vitest';
import { toPostcodeResult, type DaumPostcodeData } from '~/lib/postcode';

const data = (over: Partial<DaumPostcodeData> = {}): DaumPostcodeData => ({
  zonecode: '13494',
  roadAddress: '경기 성남시 분당구 판교역로 166',
  jibunAddress: '경기 성남시 분당구 백현동 532',
  buildingName: '카카오판교아지트',
  apartment: 'N',
  userSelectedType: 'R',
  ...over,
});

describe('주소 검색 결과 옮기기', () => {
  it('도로명을 고르면 도로명이 들어간다', () => {
    expect(toPostcodeResult(data())).toEqual({
      postalCode: '13494',
      address: '경기 성남시 분당구 판교역로 166',
    });
  });

  it('지번을 고르면 지번이 들어간다 — 도로명을 강제하면 낯선 주소가 된다', () => {
    expect(toPostcodeResult(data({ userSelectedType: 'J' })).address).toBe(
      '경기 성남시 분당구 백현동 532',
    );
  });

  it('아파트면 건물명을 붙인다 — 있어야 기사가 찾는다', () => {
    const r = toPostcodeResult(
      data({ apartment: 'Y', buildingName: '래미안 1차', roadAddress: '서울 성동구 왕십리로 10' }),
    );
    expect(r.address).toBe('서울 성동구 왕십리로 10 (래미안 1차)');
  });

  it('아파트가 아니면 건물명을 붙이지 않는다 — 주소만 길어진다', () => {
    expect(toPostcodeResult(data({ apartment: 'N' })).address).not.toContain('카카오');
  });

  it('아파트인데 건물명이 없으면 괄호만 남기지 않는다', () => {
    expect(toPostcodeResult(data({ apartment: 'Y', buildingName: '' })).address).toBe(
      '경기 성남시 분당구 판교역로 166',
    );
  });

  it('우편번호는 그대로 가져온다', () => {
    expect(toPostcodeResult(data({ zonecode: '63309' })).postalCode).toBe('63309');
  });
});
