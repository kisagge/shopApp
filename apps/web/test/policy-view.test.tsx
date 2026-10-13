// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi } from 'vitest';
import { POLICY_PATH } from '@shop/core';
import type { PolicyDoc, PolicyRevisionDoc } from '~/lib/policies/policy';

vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}));
vi.mock('~/lib/i18n/server', async () => {
  const { ko } = await import('@shop/i18n/messages/ko');
  const t = Object.assign(
    (key: string, params?: Record<string, string>) =>
      (ko as unknown as Record<string, string>)[key]?.replace(/\{(\w+)\}/g, (_m, k: string) => params?.[k] ?? '') ?? key,
    { category: (_slug: string, name: string) => name },
  );
  return { getT: async () => t, getLocale: async () => 'ko' };
});

const { PolicyView } = await import('~/components/policy-view');

/**
 * 약관·방침 본문과 **지난 판으로 가는 길.**
 *
 * 이 화면의 안내문은 "바뀌기 전 내용입니다. **언제 동의했는지에 따라 적용되는 글이 다릅니다**"
 * 라고 약속한다. 그런데 줄에는 **시작일(시행일)만** 있었다.
 *
 * 그러면 "2026-05-10 에 동의했는데 어느 글인가" 에 답하려면 다음 판의 시행일과 견주어야
 * 하는데, 그건 틀린 셈법이다 — 새 방침은 앞날로 미리 올릴 수 있고(그동안 효력은 지난 방침에
 * 있다), 그래서 **시행일과 실제로 바뀐 시각이 다르다.** 답하는 값(`replacedAt`)은 이미 화면까지
 * 실려 와 있었고, 그리지만 않았다.
 */

const doc: PolicyDoc = {
  kind: 'PRIVACY',
  title: '개인정보처리방침',
  body: '지금 내용',
  bodyRich: null,
  effectiveAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

const revision = (over: Partial<PolicyRevisionDoc> = {}): PolicyRevisionDoc => ({
  id: 'rev-1',
  kind: 'PRIVACY',
  title: '개인정보처리방침',
  body: '지난 내용',
  bodyRich: null,
  effectiveAt: new Date('2026-03-02T00:00:00Z'),
  replacedAt: new Date('2026-08-31T15:00:00Z'),
  ...over,
});

const draw = async (over: {
  revisions?: PolicyRevisionDoc[];
  viewing?: PolicyRevisionDoc | null;
} = {}) =>
  render(
    await PolicyView({
      kind: 'PRIVACY',
      doc,
      revisions: over.revisions ?? [revision()],
      viewing: over.viewing ?? null,
    }),
  );

const past = () => screen.getByRole('region', { name: '지난 방침' });

describe('지난 방침 목록', () => {
  it('판마다 그 글로 가는 길이 있다', async () => {
    await draw();

    expect(within(past()).getByRole('link'))
      .toHaveAttribute('href', `${POLICY_PATH.PRIVACY}?v=rev-1`);
  });

  /*
   * 여기가 비어 있던 자리다. 시행일만으로는 "내가 동의한 날 무엇이 적용됐나" 에 답할 수 없다.
   */
  it('언제부터 언제까지 적용됐는지 둘 다 적는다', async () => {
    await draw();

    const line = within(past()).getByRole('listitem').textContent ?? '';
    expect(line, '시행일이 없다').toMatch(/시행일/);
    expect(line, '언제까지 적용됐는지가 없다 — 안내문의 약속에 답하지 못한다').toMatch(/까지 적용/);
  });

  /**
   * **시행일과 바뀐 시각은 다른 날일 수 있다.** 새 방침을 앞날로 미리 올려 두면 그동안 효력은
   * 지난 방침에 있다 — 그래서 다음 판의 시행일로 끝을 재면 틀린다.
   */
  it('끝나는 날은 다음 판의 시행일이 아니라 실제로 바뀐 날이다', async () => {
    await draw({
      revisions: [revision({
        effectiveAt: new Date('2026-03-02T00:00:00Z'),
        // 2026-09-01 시행인 새 판으로 바뀐 것은 KST 로 9월 1일이다
        replacedAt: new Date('2026-08-31T15:00:00Z'),
      })],
    });

    const line = within(past()).getByRole('listitem').textContent ?? '';
    expect(line).toContain('2026');
    // 한국 시각으로 읽는다 — UTC 로 자르면 8월 31일이 되어 하루 당겨진다
    expect(line, 'UTC 로 읽어 하루 당겨졌다').toMatch(/9월\s*1일까지 적용|2026\. 9\. 1\..*까지 적용/);
  });

  it('여러 판이면 저마다 기간을 가진다', async () => {
    await draw({
      revisions: [
        revision({ id: 'rev-2', effectiveAt: new Date('2026-06-01T00:00:00Z'), replacedAt: new Date('2026-08-31T15:00:00Z') }),
        revision({ id: 'rev-1', effectiveAt: new Date('2026-03-02T00:00:00Z'), replacedAt: new Date('2026-05-31T15:00:00Z') }),
      ],
    });

    const lines = within(past()).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line, line).toMatch(/까지 적용/);
  });

  /** 보고 있는 판을 색이 아니라 이름으로 알린다 */
  it('지금 보고 있는 판에 표가 붙는다', async () => {
    const shown = revision({ id: 'rev-2' });
    await draw({ revisions: [shown, revision({ id: 'rev-1' })], viewing: shown });

    const current = within(past())
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', `${POLICY_PATH.PRIVACY}?v=rev-2`);
  });

  /** 왜 지난 글이 남아 있는지 말한다 — 그 말이 없으면 옛 글이 지금 효력인 줄 안다 */
  it('무엇을 보고 있는지 설명이 함께 있다', async () => {
    await draw();

    expect(within(past()).getByText(/언제 동의했는지에 따라 적용되는 글이 다릅니다/)).toBeDefined();
  });

  it('지난 판이 없으면 그 자리를 두지 않는다', async () => {
    await draw({ revisions: [] });

    expect(screen.queryByRole('region', { name: '지난 방침' })).toBeNull();
  });
});
