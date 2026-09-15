// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAIL_TEMPLATE_MAX } from '@shop/core';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { MailTemplateForm } = await import('~/app/admin/mail-templates/mail-template-form');

/** 메일 문구 폼 — 비우면 기본 문구, 실제 메일 미리보기 */
const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const draw = (saved = { subject: null, heading: null, lead: null } as Record<'subject' | 'heading' | 'lead', string | null>) =>
  render(
    <MailTemplateForm
      kind="ORDER_DEPOSITED"
      locale="ko"
      title="입금 확인"
      defaults={{ subject: '[PLAIN] 입금이 확인되었습니다 · {orderNo}', heading: '입금이 확인되었습니다', lead: '입금이 확인되어 주문이 확정되었습니다.' }}
      saved={saved}
      params={{ subject: [{ name: 'orderNo', label: '주문번호' }], heading: [], lead: [] }}
      max={MAIL_TEMPLATE_MAX}
    />,
  );

const described = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');

describe('메일 문구 폼', () => {
  it('칸마다 기본 문구를 흐리게 보여 주고, 쓸 수 있는 값을 설명에 잇는다', () => {
    draw();
    const subject = screen.getByLabelText<HTMLInputElement>('제목');
    expect(subject.placeholder).toBe('[PLAIN] 입금이 확인되었습니다 · {orderNo}');
    expect(described(subject)).toContain('{orderNo} 주문번호');
    expect(described(screen.getByLabelText('첫 문장'))).toContain('끼울 수 있는 값이 없습니다');
    // 저장된 문구가 없으면 되돌리기 단추도 없다
    expect(screen.queryByRole('button', { name: '모두 기본 문구로' })).toBeNull();
  });

  it('쓸 수 없는 값을 적으면 그 칸이 틀렸다고 알리고 저장·미리보기를 막는다', async () => {
    const user = userEvent.setup();
    draw();
    const lead = screen.getByLabelText('첫 문장');
    await user.type(lead, '{{name}님');
    expect(lead.getAttribute('aria-invalid')).toBe('true');
    expect(described(lead)).toContain('이 알림에 없는 값입니다: {name}');
    expect(screen.getByRole('button', { name: '저장' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '미리보기' }).hasAttribute('disabled')).toBe(true);
  });

  it('미리보기는 서버가 만든 메일을 제목과 격리한 틀로 보여 준다', async () => {
    fetchMock.mockResolvedValue(Response.json({ subject: '입금 끝! 20260915-1234567', html: '<p>메일</p>', text: 'x' }));
    const user = userEvent.setup();
    draw();
    await user.type(screen.getByLabelText('제목'), '입금 끝! {{orderNo}');
    await user.click(screen.getByRole('button', { name: '미리보기' }));

    const frame = await screen.findByTitle('입금 확인 메일 미리보기');
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toBe('<p>메일</p>');
    expect(screen.getByText('입금 끝! 20260915-1234567')).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/mail-templates/preview');
    expect(JSON.parse(init.body)).toEqual({ kind: 'ORDER_DEPOSITED', locale: 'ko', subject: '입금 끝! {orderNo}', heading: null, lead: null });
  });

  it('저장은 빈 칸을 null 로, 되돌리기는 세 칸 모두 null 로 보낸다', async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    const user = userEvent.setup();
    draw({ subject: '옛 제목 {orderNo}', heading: null, lead: null });
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ subject: '옛 제목 {orderNo}', heading: null, lead: null });

    await user.click(screen.getByRole('button', { name: '모두 기본 문구로' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toMatchObject({ subject: null, heading: null, lead: null });
    await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('제목').value).toBe(''));
  });
});
