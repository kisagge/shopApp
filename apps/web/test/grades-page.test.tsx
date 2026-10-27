// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTranslator } from '@shop/i18n/all';
import { MEMBER_GRADE, GRADE_THRESHOLD, GRADE_REWARD_PERCENT } from '@shop/core';
import { GRADE_KEY } from '~/lib/i18n/enum-labels';

/** 화면이 쓰는 그 번역기로 이름을 읽는다 — 사전을 바로 색인하면 복수형 객체가 섞인다 */
const ko = createTranslator('ko');

/**
 * 회원 등급 안내.
 *
 * **정책은 core 에 있는데 보여 주는 화면이 없었다.** `GRADE_THRESHOLD` 가 `grade.ts` 안에서만 쓰이고 있어서,
 * 손님은 내 등급과 다음 한 칸만 보고 **"VIP 는 얼마냐" 를 알 길이 없었다.**
 *
 * 그래서 이 검사의 무게 중심은 **전수**다. 등급이 하나 늘면(예: PLATINUM) 화면에 저절로 들어와야 하고,
 * 들어오지 않으면 여기서 져야 한다 — 손 목록은 늘 늦게 자란다(접근성 훑기·요청 제한에서 이미 겪었다).
 *
 * 그리고 **지금 등급을 색으로만 알리지 않는다.** 네 줄이 낭독기에 똑같이 들리면 안내가 반쪽이다.
 */

const getViewer = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/viewer', () => ({ getViewer }));

const getEffectiveGrade = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/grade/effective', () => ({ getEffectiveGrade }));

vi.mock('~/lib/i18n/server', () => ({
  getT: () => Promise.resolve(createTranslator('ko')),
  getLocale: () => Promise.resolve('ko'),
}));

const Page = (await import('~/app/(shop)/grades/page')).default;

const open = () => Page().then(render);

/** 등급 한 줄 — 줄 머리가 등급 이름이다 */
const rowOf = (grade: (typeof MEMBER_GRADE)[number]) =>
  screen.getByRole('rowheader', { name: new RegExp(ko(GRADE_KEY[grade])) }).closest('tr')!;

beforeEach(() => {
  vi.clearAllMocks();
  getViewer.mockResolvedValue(null);
});

describe('등급 사다리 전체', () => {
  it('제목이 하나 있다', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 1, name: '회원 등급 안내' })).toBeInTheDocument();
  });

  it('표로 그린다 — 등급·조건·적립률을 견주는 자리다', async () => {
    await open();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['회원 등급 안내', '조건', '적립률']);
  });

  it.each(MEMBER_GRADE)('%s 가 줄 머리로 선다', async (grade) => {
    /*
     * 등급을 하나 더하면 이 검사가 저절로 늘어난다 — 화면이 목록을 손으로 들고 있으면 거기서 진다.
     */
    await open();
    expect(rowOf(grade)).not.toBeNull();
  });

  it('줄은 등급 수만큼이고 차례도 같다 — 낮은 등급부터 올라간다', async () => {
    await open();
    expect(screen.getAllByRole('rowheader').map((h) => h.textContent?.trim())).toEqual(
      MEMBER_GRADE.map((g) => ko(GRADE_KEY[g])),
    );
  });
});

describe('적립률', () => {
  it.each(MEMBER_GRADE)('%s 의 적립률을 적는다', async (grade) => {
    await open();
    expect(rowOf(grade).textContent).toContain(`${GRADE_REWARD_PERCENT[grade]}%`);
  });

  it('등급이 오르면 적립률도 오른다 — 표가 그 순서로 서 있다', async () => {
    // 사다리의 뜻이다. 어긋나면 "더 써도 덜 받는" 칸이 생긴다
    const percents = MEMBER_GRADE.map((g) => GRADE_REWARD_PERCENT[g]);
    expect([...percents].sort((a, b) => a - b)).toEqual(percents);
  });
});

describe('조건', () => {
  it('가입 등급은 금액이 아니라 "가입하면 바로" 라고 적는다', async () => {
    /*
     * 기준이 0원인 것을 "0원 이상" 으로 쓰면 조건이 없다는 말을 조건처럼 읽게 된다.
     */
    await open();
    expect(rowOf('BASIC').textContent).toContain('가입하면 바로');
    expect(rowOf('BASIC').textContent).not.toContain('0원 이상');
  });

  it.each(MEMBER_GRADE.filter((g) => GRADE_THRESHOLD[g] > 0))(
    '%s 는 기준 금액을 적는다',
    async (grade) => {
      await open();
      expect(rowOf(grade).textContent).toContain(
        `${GRADE_THRESHOLD[grade].toLocaleString('ko-KR')}원 이상`,
      );
    },
  );

  it('구매확정 기준임을 밝힌다 — 취소한 금액은 빠진다', async () => {
    await open();
    expect(screen.getByText(/구매확정 금액의 누계/)).toBeInTheDocument();
  });

  it('운영진이 올려 준 등급은 유지된다고 적는다', async () => {
    // effectiveGrade 가 "둘 중 높은 쪽" 을 쓰는 것이 화면의 약속이기도 하다
    await open();
    expect(screen.getByText(/누계가 모자라도 그대로 유지/)).toBeInTheDocument();
  });
});

describe('로그인하지 않았으면', () => {
  it('지금 등급 표시가 없다', async () => {
    await open();
    expect(screen.queryByText('현재 등급')).toBeNull();
  });

  it('등급을 알아보러 가지도 않는다', async () => {
    await open();
    expect(getEffectiveGrade).not.toHaveBeenCalled();
  });

  it('로그인으로 가는 길을 준다', async () => {
    await open();
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login');
  });
});

describe('로그인했으면', () => {
  beforeEach(() => {
    getViewer.mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', merchantId: null, name: '김손님' });
    getEffectiveGrade.mockResolvedValue({ grade: 'GOLD', totalSpent: 1_200_000, rewardPercent: 3 });
  });

  it('지금 등급 줄에 글자로 표시한다 — 색으로만 알리지 않는다', async () => {
    await open();
    expect(within(rowOf('GOLD')).getByText('현재 등급')).toBeInTheDocument();
  });

  it('표시는 한 줄에만 붙는다', async () => {
    await open();
    expect(screen.getAllByText('현재 등급')).toHaveLength(1);
  });

  it('실제로 적용되는 등급을 쓴다 — 저장된 등급이 아니다', async () => {
    /*
     * 운영진이 올려 준 등급과 구매액이 말하는 등급 중 높은 쪽을 쓴다(effectiveGrade).
     * 저장된 값을 그대로 그리면 "골드 뱃지를 달고 골드까지 남았다" 는 모순이 화면에 나온다.
     */
    await open();
    expect(getEffectiveGrade).toHaveBeenCalledWith('u-1');
  });

  it('마이페이지로 가는 길을 준다 — 내 누계와 남은 금액은 거기 있다', async () => {
    await open();
    expect(screen.getByRole('link', { name: '마이페이지' })).toHaveAttribute('href', '/mypage');
  });
});
