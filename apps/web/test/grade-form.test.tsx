// @vitest-environment jsdom
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

const { GradeForm } = await import('~/app/admin/users/grade-form');

/**
 * 회원 등급 올려 주기.
 *
 * **올려 주는 창구다.** 실제 등급은 언제나 누적 구매액에서 계산되고, 여기서 적는 값은 그보다 낮아질 수
 * 없는 바닥이다 — 낮은 값을 골라 봐야 화면이 그대로이고, 운영자는 눌렀는데 아무 일도 안 일어난 것으로 본다.
 */

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

const open = async (current: 'BASIC' | 'SILVER' | 'GOLD' | 'VIP' = 'BASIC') => {
  const user = userEvent.setup();
  render(<GradeForm userId="u-1" userName="홍길동" current={current} />);
  await user.click(screen.getByRole('button', { name: '등급 올리기' }));
  return user;
};

describe('고를 수 있는 등급', () => {
  it('지금보다 높은 것만 고를 수 있다', async () => {
    await open('SILVER');

    const options = [...screen.getByRole('combobox').querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toEqual(['고르세요', '골드', 'VIP']);
  });

  it('가장 높은 등급이면 폼을 열지 않고 그렇게 말한다', () => {
    render(<GradeForm userId="u-1" userName="홍길동" current="VIP" />);

    expect(screen.queryByRole('button', { name: '등급 올리기' })).toBeNull();
    expect(screen.getByText('이미 가장 높은 등급입니다.')).toBeTruthy();
  });

  it('탈퇴한 계정이면 왜 안 되는지 적는다', () => {
    render(<GradeForm userId="u-1" userName="홍길동" current="BASIC" disabledReason="탈퇴한 계정" />);

    expect(screen.getByText('탈퇴한 계정')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '등급 올리기' })).toBeNull();
  });
});

describe('보내기', () => {
  it('고른 등급과 사유를 함께 보낸다', async () => {
    const user = await open();

    await user.selectOptions(screen.getByRole('combobox'), 'GOLD');
    await user.type(screen.getByLabelText('사유 (필수)'), '제휴 보상');
    await user.click(screen.getByRole('button', { name: '등급 올리기' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/u-1/grade', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ grade: 'GOLD', reason: '제휴 보상' }),
    }));
    expect(refresh, '올린 뒤 화면을 다시 그려야 새 등급이 보인다').toHaveBeenCalled();
  });

  it('사유 없이는 보내지 않는다 — 나중에 "왜 이 사람만" 에 답할 수 있어야 한다', async () => {
    const user = await open();

    await user.selectOptions(screen.getByRole('combobox'), 'GOLD');
    await user.click(screen.getByRole('button', { name: '등급 올리기' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('실패하면 서버가 말한 까닭을 그 자리에 보여 준다', async () => {
    const user = await open();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: '지금 등급보다 높은 등급만 올려 줄 수 있습니다' }), { status: 409 }),
    );

    await user.selectOptions(screen.getByRole('combobox'), 'GOLD');
    await user.type(screen.getByLabelText('사유 (필수)'), 'x');
    await user.click(screen.getByRole('button', { name: '등급 올리기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('높은 등급만');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('적립률이 함께 올라간다는 것을 적어 둔다 — 이건 곧 돈이다', async () => {
    await open();

    expect(screen.getByText(/적립률이 함께 올라갑니다/)).toBeTruthy();
  });
});
