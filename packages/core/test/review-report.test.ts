import { describe, it, expect } from 'vitest';
import {
  reportPriority, moderationState, isReportReason,
  AUTO_HIDE_ON_REPORTS,
} from '../src/review-report';

describe('신고 사유', () => {
  it('모르는 값은 사유가 아니다', () => {
    expect(isReportReason('SPAM')).toBe(true);
    expect(isReportReason('spam')).toBe(false);
    expect(isReportReason('WHATEVER')).toBe(false);
  });
});

describe('처리 순서', () => {
  it('신고가 없으면 0 이다', () => {
    expect(reportPriority([])).toBe(0);
  });

  it('개인정보는 다른 사유보다 위로 온다', () => {
    // 남아 있는 동안 계속 새어 나간다. 급이 다르다.
    const privacy = reportPriority([{ reason: 'PRIVACY' }]);
    const abuse = reportPriority([{ reason: 'ABUSE' }]);
    const spam = reportPriority([{ reason: 'SPAM' }]);

    expect(privacy).toBeGreaterThan(abuse);
    expect(abuse).toBeGreaterThan(spam);
  });

  it('사유가 갈리는 쪽이 같은 사유가 쌓인 쪽보다 위다', () => {
    /*
     * 같은 사유 여러 건은 한 사람이 계정을 나눠 눌렀을 수 있다.
     * 사유가 갈린다는 것은 서로 다른 이유로 눈에 걸렸다는 뜻이다.
     */
    const same = reportPriority([
      { reason: 'SPAM' }, { reason: 'SPAM' }, { reason: 'SPAM' }, { reason: 'SPAM' },
    ]);
    const mixed = reportPriority([{ reason: 'SPAM' }, { reason: 'ABUSE' }]);

    expect(mixed).toBeGreaterThan(same);
  });

  it('그래도 건수를 무시하지는 않는다 — 진짜 도배를 놓치면 안 된다', () => {
    const one = reportPriority([{ reason: 'SPAM' }]);
    const many = reportPriority([{ reason: 'SPAM' }, { reason: 'SPAM' }, { reason: 'SPAM' }]);

    expect(many).toBeGreaterThan(one);
  });
});

describe('자동 숨김', () => {
  it('신고가 쌓여도 자동으로 내리지 않는다', () => {
    /*
     * 켜는 순간 계정 몇 개로 정당한 혹평을 지울 수 있는 버튼이 된다.
     * 값이 바뀌면 이 결정이 뒤집힌 것이므로 여기서 걸려야 한다.
     */
    expect(AUTO_HIDE_ON_REPORTS).toBe(false);
  });
});

describe('처리 상태', () => {
  it('신고가 없으면 clean', () => {
    expect(moderationState({ removedByModerator: false, openReports: 0, totalReports: 0 }))
      .toBe('clean');
  });

  it('대기 중인 신고가 있으면 reported', () => {
    expect(moderationState({ removedByModerator: false, openReports: 2, totalReports: 3 }))
      .toBe('reported');
  });

  it('다 닫혔으면 kept — 한 번 보고 넘긴 글임을 남긴다', () => {
    expect(moderationState({ removedByModerator: false, openReports: 0, totalReports: 3 }))
      .toBe('kept');
  });

  it('내려간 글은 신고가 남아 있어도 removed', () => {
    // 이미 끝난 건이다. 대기줄에 다시 세우면 같은 일을 두 번 한다.
    expect(moderationState({ removedByModerator: true, openReports: 5, totalReports: 5 }))
      .toBe('removed');
  });
});
