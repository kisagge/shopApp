import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readBody } from '~/lib/api/read-body';

/**
 * 본문을 읽고 계약으로 거르는 한 자리.
 *
 * **같은 열 줄이 마흔여덟 곳에 있었다.** 본문을 못 읽으면 400, 계약에 안 맞으면 어느 칸이 틀렸는지와
 * 함께 400 — 창구마다 다를 이유가 없는 두 갈래인데 창구마다 적혀 있었다. 한 곳으로 모았으니
 * **여기서 한 번 확인한다.**
 */

const schema = z.object({
  recipient: z.string().min(1, 'valid.required'),
  quantity: z.number().int().positive(),
});

const post = (body: string): Request =>
  new Request('http://localhost/api/x', { method: 'POST', body });

describe('본문 읽기', () => {
  it('계약을 지나면 거른 값을 준다', async () => {
    const parsed = await readBody(post(JSON.stringify({ recipient: '장보영', quantity: 2 })), schema);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data).toEqual({ recipient: '장보영', quantity: 2 });
  });

  /** 계약이 깎아 낸 값만 넘어간다 — 요청이 더 실어 보낸 것은 여기서 사라진다 */
  it('계약에 없는 칸은 딸려 들어가지 않는다', async () => {
    const parsed = await readBody(
      post(JSON.stringify({ recipient: '장보영', quantity: 1, isAdmin: true })),
      schema,
    );

    expect(parsed.ok && 'isAdmin' in parsed.data).toBe(false);
  });

  it('글이 아니면 400 으로 돌려준다', async () => {
    const parsed = await readBody(post('{'), schema);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.response.status).toBe(400);
      expect((await parsed.response.json()).code).toBe('INVALID_JSON');
    }
  });

  it('본문이 비어도 같은 자리에서 막는다 — 창구까지 가지 않는다', async () => {
    const parsed = await readBody(new Request('http://localhost/api/x', { method: 'POST' }), schema);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.response.status).toBe(400);
  });

  /** 어느 칸이 틀렸는지 함께 준다 — 폼이 그 칸에 표시한다 */
  it('계약에 안 맞으면 어느 칸인지와 함께 400', async () => {
    const parsed = await readBody(post(JSON.stringify({ recipient: '', quantity: 0 })), schema);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      const body = await parsed.response.json();
      expect(parsed.response.status).toBe(400);
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(body.fields)).toContain('recipient');
    }
  });

  /**
   * **열쇠가 그대로 나가면 안 된다.** 계약의 Zod 문구는 사전 열쇠(`valid.*`)일 뿐이고, 번역은 응답을
   * 만드는 이 자리에서 한다 — 그러지 않으면 사람에게 `valid.required` 가 보인다.
   */
  it('계약의 열쇠가 아니라 사람이 읽을 문장이 나간다', async () => {
    const parsed = await readBody(post(JSON.stringify({ recipient: '', quantity: 1 })), schema);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      const body = await parsed.response.json();
      expect(body.fields.recipient).not.toContain('valid.');
      expect(body.fields.recipient.length).toBeGreaterThan(1);
    }
  });
});
