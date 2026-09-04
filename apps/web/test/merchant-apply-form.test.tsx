// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { MerchantApplyForm } = await import('~/components/merchant-apply-form');

const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response('{"application":{}}', { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
});

const setup = () => render(<MerchantApplyForm defaultEmail="me@plain.test" />);
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}\\* \\(필수\\)$`));

async function fill() {
  await userEvent.type(field('가맹점 이름'), '무어');
  await userEvent.type(field('브랜드 이름'), 'MOOR');
  await userEvent.type(field('상호'), '무어상사');
  await userEvent.type(field('사업자등록번호'), '1234567890');
  await userEvent.type(field('대표자'), '홍길동');
  await userEvent.type(field('전화번호'), '010-1111-2222');
}

describe('입력', () => {
  it('로그인한 이메일이 미리 채워진다', () => {
    // 다시 적게 하면 오타가 나고, 심사 결과가 엉뚱한 데로 간다
    setup();
    expect((field('이메일') as HTMLInputElement).value).toBe('me@plain.test');
  });

  it('묶음마다 이름이 붙어 있다', () => {
    // 입력이 많아 묶지 않으면 스크린리더로는 어디까지가 한 묶음인지 알 수 없다
    setup();
    for (const name of ['브랜드', '사업자 정보', '연락처']) {
      expect(screen.getByRole('group', { name }), name).toBeDefined();
    }
  });

  it('하이픈 없이 적어도 된다고 알려 준다', () => {
    setup();
    expect(screen.getByText(/하이픈 없이 적으셔도 됩니다/)).toBeDefined();
  });
});

describe('보내기', () => {
  it('적은 값을 그대로 보낸다', async () => {
    setup();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: '입점 신청' }));

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toMatchObject({
      name: '무어', brandName: 'MOOR', businessNumber: '1234567890',
      contactEmail: 'me@plain.test',
    });
  });

  it('성공하면 화면을 다시 읽는다 — 같은 주소가 현황으로 바뀐다', async () => {
    setup();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: '입점 신청' }));

    expect(refresh).toHaveBeenCalled();
  });
});

describe('실패', () => {
  it('필드 오류를 해당 입력 옆에 붙인다', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: '입력값을 확인해 주세요.',
          fields: { businessNumber: '사업자등록번호 형식이 아닙니다 (000-00-00000)' },
        }),
        { status: 400 },
      ),
    );
    setup();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: '입점 신청' }));

    expect(await screen.findByText(/사업자등록번호 형식이 아닙니다/)).toBeDefined();
  });

  it('겹친 이름은 폼 전체 오류로 읽힌다', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"message":"같은 이름의 가맹점이 이미 있습니다."}', { status: 409 }),
    );
    setup();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: '입점 신청' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('네트워크가 끊겨도 버튼이 잠기지 않는다', async () => {
    fetchMock.mockRejectedValue(new Error('오프라인'));
    setup();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: '입점 신청' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: '입점 신청' })).toHaveProperty('disabled', false);
  });
});
