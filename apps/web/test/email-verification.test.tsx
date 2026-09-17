// @vitest-environment jsdom
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendVerificationEmail = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/client', () => ({ authClient: { sendVerificationEmail } }));

const { EmailVerification } = await import('~/components/email-verification');

/**
 * 이메일 인증 상태와 다시 보내기.
 *
 * 인증 메일은 가입할 때 한 번 나가고 끝이었다 — 지웠으면 다시 받을 길이 없었고, 인증했는지조차 손님 화면에
 * 보이지 않았다.
 */

beforeEach(() => {
  vi.clearAllMocks();
  sendVerificationEmail.mockResolvedValue({ data: { status: true }, error: null });
});

describe('인증한 주소', () => {
  it('인증됐다고만 적고, 다시 보낼 단추를 두지 않는다', () => {
    render(<EmailVerification email="a@plain.test" verified />);

    expect(screen.getByText('인증됨')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('인증 전 주소', () => {
  it('인증 전이라고 적고 다시 보낼 단추를 둔다', () => {
    render(<EmailVerification email="a@plain.test" verified={false} />);

    expect(screen.getByText('인증 전')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증 메일 다시 보내기' })).toBeInTheDocument();
  });

  it('누르면 이 주소로 보내고, 인증을 마치면 이 화면으로 돌아오게 한다', async () => {
    const user = userEvent.setup();
    render(<EmailVerification email="a@plain.test" verified={false} />);

    await user.click(screen.getByRole('button', { name: '인증 메일 다시 보내기' }));

    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: 'a@plain.test',
      callbackURL: '/mypage/account?verified=1',
    });
    expect(await screen.findByText('인증 메일을 보냈습니다. 메일함을 확인해 주세요.')).toBeInTheDocument();
  });

  it('결과를 말하는 자리는 처음부터 있다 — 누른 뒤에 생기면 낭독기가 놓친다', () => {
    render(<EmailVerification email="a@plain.test" verified={false} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('여러 번 눌러 막혔으면 방금 보냈다고 말한다', async () => {
    const user = userEvent.setup();
    sendVerificationEmail.mockResolvedValue({ data: null, error: { status: 429, message: 'Too many requests' } });
    render(<EmailVerification email="a@plain.test" verified={false} />);

    await user.click(screen.getByRole('button', { name: '인증 메일 다시 보내기' }));

    expect(await screen.findByRole('status')).toHaveTextContent('방금 보냈습니다. 1분쯤 뒤에 다시 보내 주세요.');
  });

  it('다른 실패와 네트워크 오류는 보내지 못했다고 말한다', async () => {
    const user = userEvent.setup();
    sendVerificationEmail
      .mockResolvedValueOnce({ data: null, error: { status: 500, message: 'boom' } })
      .mockRejectedValueOnce(new Error('offline'));
    render(<EmailVerification email="a@plain.test" verified={false} />);

    const button = screen.getByRole('button', { name: '인증 메일 다시 보내기' });
    await user.click(button);
    expect(await screen.findByText('메일을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.')).toBeInTheDocument();

    await user.click(button);
    expect(await screen.findByText('메일을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.')).toBeInTheDocument();
    expect(button).toBeEnabled();
  });
});
