// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NOTIFICATION_SAMPLE_PARAMS } from '@shop/core';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { TemplateForm } = await import('~/app/admin/notification-templates/template-form');

/** 알림 문구 한 칸 — 적는 대로 미리 보고, 틀리면 저장 전에 글로 알린다 */
const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ body: 'x' }));
});

const draw = (customBody: string | null = null) =>
  render(
    <TemplateForm
      kind="COUPON_ISSUED"
      locale="ko"
      title="쿠폰 지급"
      where="매장 알림함"
      defaultBody="{couponName} 쿠폰이 도착했습니다"
      customBody={customBody}
      updatedAt={customBody ? '2026-09-15T00:00:00.000Z' : null}
      params={[{ name: 'couponName', label: '쿠폰 이름' }]}
      sample={NOTIFICATION_SAMPLE_PARAMS}
    />,
  );

describe('알림 문구 폼', () => {
  it('제목이 붙은 영역에 기본 문구 상태와 쓸 수 있는 값을 적고, 예시 값으로 미리 본다', () => {
    draw();
    const region = screen.getByRole('region', { name: /쿠폰 지급/ });
    expect(within(region).getByText(/매장 알림함 · 기본 문구/)).toBeTruthy();
    const box = within(region).getByLabelText('문구');
    expect(document.getElementById(box.getAttribute('aria-describedby')!)?.textContent).toContain('{couponName} 쿠폰 이름');
    expect(within(region).getByRole('status', { name: '미리보기 (예시 값)' }).textContent).toBe('가을 10% 쿠폰 쿠폰이 도착했습니다');
    // 바꾼 것이 없으면 저장할 것도 없다. 기본 문구에는 되돌리기가 없다
    expect(within(region).getByRole('button', { name: '저장' }).hasAttribute('disabled')).toBe(true);
    expect(within(region).queryByRole('button', { name: '기본 문구로' })).toBeNull();
  });

  it('없는 값을 적으면 입력이 틀렸다고 표시하고, 이유를 설명에 잇고, 저장을 막는다', async () => {
    draw();
    const box = screen.getByLabelText('문구');
    await userEvent.setup().clear(box);
    await userEvent.setup().type(box, '{{orderNo} 쿠폰');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    const described = box.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)?.textContent).join(' ');
    expect(described).toContain('이 알림에 없는 값입니다: {orderNo}');
    expect(screen.getByRole('status', { name: '미리보기 (예시 값)' }).textContent).toBe('—');
    expect(screen.getByRole('button', { name: '저장' }).hasAttribute('disabled')).toBe(true);
  });

  it('고쳐 저장하면 종류·말·문구를 보내고, 되돌리기는 null 을 보낸다', async () => {
    const user = userEvent.setup();
    draw('{couponName} 받아 가세요');
    const box = screen.getByLabelText('문구');
    await user.clear(box);
    await user.type(box, '{{couponName} 지금 받기');
    expect(screen.getByRole('status', { name: '미리보기 (예시 값)' }).textContent).toBe('가을 10% 쿠폰 지금 받기');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ kind: 'COUPON_ISSUED', locale: 'ko', body: '{couponName} 지금 받기' });
    expect(screen.getByText('저장했습니다.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '기본 문구로' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ kind: 'COUPON_ISSUED', locale: 'ko', body: null });
    await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('문구').value).toBe('{couponName} 쿠폰이 도착했습니다'));
  });

  it('서버가 거절하면 알림으로 읽힌다', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: '중괄호 짝이 맞지 않습니다.' }, { status: 400 }));
    const user = userEvent.setup();
    draw();
    await user.type(screen.getByLabelText('문구'), '!');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('중괄호'));
    expect(refresh).not.toHaveBeenCalled();
  });
});
