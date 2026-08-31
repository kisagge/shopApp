import { describe, it, expect } from 'vitest';
import { GET } from '~/app/api/health/route';

describe('GET /api/health', () => {
  it('Capacitor 셸이 도달 여부를 판단할 수 있게 응답한다', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('shop-web');
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });
});
