import { describe, it, expect } from 'vitest';
import {
  INQUIRY_TOPIC, SUPPORT_POST_KIND, isInquiryTopic, isPublishedPost, topicRequired,
} from '../src/support';

describe('갈래', () => {
  it('아는 값만 갈래로 받는다', () => {
    for (const topic of INQUIRY_TOPIC) expect(isInquiryTopic(topic)).toBe(true);
    expect(isInquiryTopic('SHIPPING')).toBe(false);
    expect(isInquiryTopic(null)).toBe(false);
  });

  it('갈래에 이름표가 섞여 있지 않다', () => {
    // 이름표는 화면이 정한다. 여기 한국어가 들어오면 그 화면만 한국어로 굳는다.
    for (const topic of INQUIRY_TOPIC) expect(topic).toMatch(/^[A-Z]+$/);
  });
});

describe('글의 종류', () => {
  it('FAQ 는 갈래가 있어야 하고 공지는 없어야 한다', () => {
    // 갈래 없는 FAQ 는 어느 묶음에도 안 붙어 아무에게도 안 보인다
    expect(topicRequired('FAQ')).toBe(true);
    expect(topicRequired('NOTICE')).toBe(false);
  });

  it('두 종류뿐이다', () => {
    expect([...SUPPORT_POST_KIND]).toEqual(['NOTICE', 'FAQ']);
  });
});

describe('내보냈는가', () => {
  it('게시일이 있어야 내보낸 글이다', () => {
    expect(isPublishedPost({ publishedAt: new Date() })).toBe(true);
    expect(isPublishedPost({ publishedAt: null })).toBe(false);
  });
});
