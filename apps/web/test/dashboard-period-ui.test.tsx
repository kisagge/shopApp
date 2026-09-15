// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect } from 'vitest';
import { Compare, CustomPeriodForm } from '~/components/admin/dashboard-period';

/** 대시보드 — 지난 기간 대비 문구와 기간 직접 고르기 */
describe('지난 기간 대비', () => {
  const text = () => document.body.textContent ?? '';

  it('방향을 글로 적고 퍼센트·차이를 함께, 화살표는 읽히지 않게', () => {
    render(<Compare current={1_200_000} previous={1_000_000} unit="원" previousLabel="9월 1일 – 9월 7일" />);
    expect(text()).toContain('지난 기간 대비 20% 증가 (+200,000원)');
    expect(text()).toContain('지난 기간 9월 1일 – 9월 7일');
    expect(screen.getByText('▲', { exact: false }).getAttribute('aria-hidden')).toBe('true');
  });

  it('줄었으면 감소, 지난 기간이 0 이면 퍼센트 없이 차이만', () => {
    const { unmount } = render(<Compare current={3} previous={4} unit="건" previousLabel="어제" />);
    expect(text()).toContain('지난 기간 대비 25% 감소 (−1건)');
    unmount();
    render(<Compare current={5} previous={0} unit="건" previousLabel="어제" />);
    expect(text()).toContain('지난 기간 대비 증가 (+5건)');
    expect(text()).not.toContain('%');
  });

  it('전환율은 %p 로 — 퍼센트의 퍼센트를 적지 않는다', () => {
    render(<Compare current={2.4} previous={2} unit="%p" previousLabel="어제" points />);
    expect(text()).toContain('지난 기간 대비 증가 (+0.4%p)');
  });

  it('같으면 같다고', () => {
    render(<Compare current={0} previous={0} unit="원" previousLabel="어제" />);
    expect(text()).toContain('지난 기간과 같음');
  });
});

describe('기간 직접 고르기', () => {
  const NOW = new Date('2026-09-15T01:00:00Z');

  it('GET 폼에 이름 붙은 시작·종료일, 오늘과 90일 전으로 묶는다', () => {
    render(<CustomPeriodForm from="2026-09-09" to="2026-09-15" error={null} now={NOW} />);
    const form = screen.getByRole('form', { name: '기간 직접 고르기' });
    expect(form.getAttribute('method')).toBe('get');
    const from = screen.getByLabelText<HTMLInputElement>('시작일');
    expect(from.value).toBe('2026-09-09');
    expect(from.max).toBe('2026-09-15');
    expect(from.min).toBe('2026-06-18');
    expect(screen.getByLabelText('종료일').getAttribute('aria-invalid')).toBeNull();
  });

  it('틀린 기간이면 이유를 알리고 두 칸에 잇는다', () => {
    render(<CustomPeriodForm from="2026-09-09" to="2026-09-15" error="시작일이 종료일보다 뒤입니다." now={NOW} />);
    expect(screen.getByRole('alert').textContent).toContain('시작일이 종료일보다 뒤입니다. 최근 7일을 보여 줍니다.');
    for (const label of ['시작일', '종료일']) {
      const input = screen.getByLabelText(label);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe('period-error');
    }
  });
});
