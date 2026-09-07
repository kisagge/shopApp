// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import GlobalError from '~/app/global-error';

/**
 * 문구가 파일에 있는지가 아니라 **실제로 그 말로 그려지는지** 본다.
 *
 * 표만 확인하면 표를 안 읽는 버그를 놓친다 — 세 말을 다 적어 두고 늘 기본값을
 * 쓰는 코드도 문자열 검사는 통과한다.
 */

function setLanguages(languages: readonly string[]): void {
  Object.defineProperty(window.navigator, 'languages', {
    value: languages,
    configurable: true,
  });
}

afterEach(() => {
  document.cookie = 'shop.locale=; max-age=0; path=/';
});

const error = new Error('터졌다');

describe('루트까지 깨졌을 때의 화면', () => {
  it('기기 언어가 일본어면 일본어로 그린다', async () => {
    setLanguages(['ja-JP', 'en-US']);
    render(<GlobalError error={error} />);

    await waitFor(() => expect(screen.getByText('問題が発生しました')).toBeInTheDocument());
    expect(document.documentElement.lang).toBe('ja-JP');
  });

  it('기기 언어가 영어면 영어로 그린다', async () => {
    setLanguages(['en-GB']);
    render(<GlobalError error={error} />);

    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());
  });

  it('모르는 말이면 한국어로 둔다', async () => {
    // 못 고른 채 빈 화면을 두는 것보다 한 말로라도 보여 주는 편이 낫다
    setLanguages(['fr-FR']);
    render(<GlobalError error={error} />);

    await waitFor(() => expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument());
  });

  it('사용자가 고른 말이 기기 언어를 이긴다', async () => {
    // 평소 화면과 같은 규칙이다. 여기서만 다르면 고르는 버튼이 있으나 마나다.
    document.cookie = 'shop.locale=ja; path=/';
    setLanguages(['en-US']);
    render(<GlobalError error={error} />);

    await waitFor(() => expect(screen.getByText('問題が発生しました')).toBeInTheDocument());
  });

  it('오류 번호가 있으면 그 말로 함께 보여 준다', async () => {
    setLanguages(['en-US']);
    const withDigest = Object.assign(new Error('터졌다'), { digest: 'abc123' });
    render(<GlobalError error={withDigest} />);

    await waitFor(() => expect(screen.getByText(/Error ID abc123/)).toBeInTheDocument());
  });
});
