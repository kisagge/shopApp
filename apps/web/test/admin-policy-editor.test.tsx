// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { POLICY_PATH, type RichTextDoc } from '@shop/core';
import type { PolicyItem } from '~/app/admin/policies/policy-editor';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
// 편집기는 따로 받아 오는 무거운 조각이다 — 여기서 보는 것은 그 바깥이다
vi.mock('~/app/admin/support/rich-editor', () => ({ RichEditor: () => <div /> }));

const { PolicyEditor } = await import('~/app/admin/policies/policy-editor');

/**
 * 약관·개인정보처리방침 편집 — **가입·결제 화면이 가리키는 한 벌짜리 약속.**
 *
 * 검사가 한 줄도 없었다. 계약을 먼저 읽고 들어갔더니 둘이 나왔다.
 *
 * **본문이 비어도 저장 단추가 눌렸다.** 계약은 빈 본문을 거절한다(`valid.bodyRequired`).
 * 아직 한 번도 안 쓴 방침을 열면 편집기가 빈 문서로 시작하므로, **처음 쓰러 온 사람이 가장
 * 먼저 만나는 거절**이었다.
 *
 * **제목 한 자도 눌렸다.** 계약은 다듬어 두 자를 요구한다(`valid.titleRequired`).
 */

const body = (text: string): RichTextDoc =>
  ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] });

const item = (over: Partial<PolicyItem> = {}): PolicyItem => ({
  kind: 'PRIVACY',
  title: '개인정보처리방침',
  bodyRich: body('수집하는 항목은 다음과 같습니다.'),
  effectiveOn: '2026-10-01',
  updatedAt: '2026-10-01T00:00:00.000Z',
  lastEdit: { at: '2026-10-01T00:00:00.000Z', by: '운영자' },
  revisionCount: 2,
  ...over,
});

const open = (over: Partial<PolicyItem> = {}) => render(<PolicyEditor item={item(over)} />);

const save = () => screen.getByRole('button', { name: '새 판으로 저장' });
const titleBox = () => screen.getByLabelText(/^제목/);

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', reply({ ok: true }));
});

/**
 * **계약이 막는 것을 화면이 먼저 말한다.** 서버도 막지만 눌러 보고 나서 알게 하지 않는다.
 */
describe('저장하기 전에 거르는 것', () => {
  it('본문이 비면 저장할 수 없고 까닭을 적는다', () => {
    open({ bodyRich: null });

    expect(save()).toBeDisabled();
    expect(screen.getByText('본문을 적어야 저장할 수 있습니다.')).toBeDefined();
  });

  /** 빈 문단 하나도 "비어 있음" 이다 — 그 판단은 계약이 쓰는 함수가 한다 */
  it('빈 문단만 있어도 비어 있는 것으로 본다', () => {
    open({ bodyRich: body('') });

    expect(save()).toBeDisabled();
  });

  it('본문이 있으면 그 말을 하지 않는다', () => {
    open();

    expect(save()).toBeEnabled();
    expect(screen.queryByText('본문을 적어야 저장할 수 있습니다.')).toBeNull();
  });

  it('제목이 한 자면 저장할 수 없다', async () => {
    open();

    await userEvent.clear(titleBox());
    await userEvent.type(titleBox(), '약');

    expect(save()).toBeDisabled();
  });

  it('공백만 적어도 저장할 수 없다', async () => {
    open();

    await userEvent.clear(titleBox());
    await userEvent.type(titleBox(), '   ');

    expect(save()).toBeDisabled();
  });

  it('두 자부터는 저장할 수 있다', async () => {
    open();

    await userEvent.clear(titleBox());
    await userEvent.type(titleBox(), '약관');

    expect(save()).toBeEnabled();
  });
});

/**
 * **저장하면 지금 내용이 지난 방침으로 남고 새 내용이 올라간다.** 덮어쓰기가 아니라는 것을
 * 단추 곁에 적는다 — 오타 하나를 고쳐도 판이 하나 생기므로, 그 사실을 모르면 이력이
 * 잔글씨로 채워진다.
 */
describe('저장할 때', () => {
  it('제목·시행일·본문을 그 종류의 창구로 보낸다', async () => {
    open();

    await userEvent.click(save());

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/policies/PRIVACY');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      title: '개인정보처리방침',
      effectiveOn: '2026-10-01',
    });
  });

  it('덮어쓰기가 아니라는 것을 단추 곁에 적는다', () => {
    open();

    expect(screen.getByText(/저장하면 지금 내용이 지난 방침으로 남습니다/)).toBeDefined();
  });

  it('되면 무엇이 일어났는지 말한다', async () => {
    open();

    await userEvent.click(save());

    expect(await screen.findByRole('status'))
      .toHaveTextContent('바뀌기 전 내용은 지난 방침으로 남았습니다');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('보내는 동안 눌리지 않는다', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}', { status: 200 }));
    })));
    open();

    await userEvent.click(save());

    expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('거절당하면 그 까닭을 말한다', async () => {
    vi.stubGlobal('fetch', reply({ message: '시행일이 올바르지 않습니다.' }, 422));
    open();

    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('시행일이 올바르지 않습니다.');
    expect(refresh).not.toHaveBeenCalled();
  });

  /** 502 가 HTML 을 주면 json() 이 터진다 — 서버가 답한 것을 네트워크 탓으로 돌리지 않는다 */
  it('응답이 JSON 이 아니어도 네트워크 오류라고 하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    open();

    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했습니다.');
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});

/**
 * **시행일을 따로 받는다.** 오늘 올리면서 다음 주부터 적용한다고 적을 수 있어야 한다 —
 * 개인정보처리방침은 바꾸기 전에 미리 알려야 한다.
 */
describe('화면이 알려 주는 것', () => {
  it('시행일이 올린 날이 아니라는 것을 적어 둔다', () => {
    open();

    expect(screen.getByText(/올린 날이 아니라 이 내용이 효력을 갖는 날입니다/)).toBeDefined();
  });

  it('지난 방침이 있으면 그 수와 함께 볼 길을 연다', () => {
    open({ revisionCount: 3 });

    const link = screen.getByRole('link', { name: /지난 방침 3개/ });
    expect(link).toHaveAttribute('href', `${POLICY_PATH.PRIVACY}#past-policies`);
  });

  it('지난 방침이 없으면 그 자리를 두지 않는다', () => {
    open({ revisionCount: 0 });

    expect(screen.queryByRole('link', { name: /지난 방침/ })).toBeNull();
  });

  it('손님 화면으로 가는 길이 있다', () => {
    open();

    expect(screen.getByRole('link', { name: '손님 화면에서 보기' }))
      .toHaveAttribute('href', POLICY_PATH.PRIVACY);
  });
});
