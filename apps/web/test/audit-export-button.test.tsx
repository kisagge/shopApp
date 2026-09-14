// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const save = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/csv/save-download', () => ({ saveResponseAsFile: save }));

const { AuditExport } = await import('~/app/admin/audit/audit-export');

/** 감사 로그 내려받기 단추 — 적용된 조건 그대로 보내고, 결과를 글로 알린다 */
const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response('csv', { status: 200 }));
});

describe('감사 로그 내려받기 단추', () => {
  it('걸린 조건만 주소에 싣고 POST 로 부른 뒤 파일로 저장한다', async () => {
    render(<AuditExport filter={{ actor: 'u-a', from: '2026-09-01', to: undefined, action: '' }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'CSV 내려받기' }));

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.any(Response), 'audit.csv'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/audit/export?actor=u-a&from=2026-09-01');
    expect(init).toEqual({ method: 'POST' });
    expect(screen.getByText('감사 로그를 내려받았습니다.')).toBeTruthy();
  });

  it('단추 설명이 받은 기록도 남는다고 알린다', () => {
    render(<AuditExport filter={{}} />);
    const button = screen.getByRole('button', { name: 'CSV 내려받기' });
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toContain('감사 로그에 남습니다');
  });

  it('서버가 거절하면 그 말을 알림으로 읽힌다(한도 초과 등)', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: '기간이나 행위자로 좁혀 주세요.' }, { status: 413 }));
    render(<AuditExport filter={{}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'CSV 내려받기' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('좁혀 주세요'));
    expect(save).not.toHaveBeenCalled();
  });
});
