import { test, expect, type APIRequestContext } from '@playwright/test';
import { STATE_FILE, ready } from './state';

/**
 * 관리자가 못 하는 셋 — 권한 부여 · 입점 승인 · 정산 지급.
 *
 * 이 저장소의 권한은 네 층(고객·가맹점·관리자·슈퍼관리자)인데, **그중 가장
 * 중요한 선은 관리자와 슈퍼관리자 사이에 있다.** 계정을 만들어 스스로 권한을
 * 올리거나, 가맹점을 스스로 승인하고 그 가맹점에 돈을 보내는 길을 한 사람이
 * 완결하지 못하게 나눈 것이다. 정산도 **확정과 지급을 갈라** 두었다.
 *
 * **그런데 그 선을 밟아 보는 검사가 하나도 없었다.** 가맹점이 막히는 것은
 * merchant.spec.ts 가 확인하지만, 관리자가 막히는지는 아무도 안 봤다.
 * 권한표(authz)의 단위 검사는 표를 읽을 뿐이고, 표에 적힌 것이 실제로
 * 서버에서 불리는지는 말해 주지 않는다.
 *
 * **화면에서 감추는 것은 울타리가 아니다.** 단추를 숨겨도 주소를 아는 사람은
 * 그대로 부른다. 그래서 화면과 서버를 둘 다 본다.
 *
 * **거절만 확인하면 눈을 감고 통과한다.** 기능이 아예 없어도, 주소가 틀려도
 * 403 이 아닌 무언가로 다 거절된다. 그래서 같은 요청을 슈퍼관리자로도 보내
 * **다른 이유로** 막히는 것을 본다 — 없는 대상이라 404 다. 권한은 지났다는
 * 뜻이다.
 */

test.use({ storageState: STATE_FILE.admin });

/** 있을 리 없는 id. 슈퍼관리자가 불러도 아무것도 바뀌지 않는다. */
const NOWHERE = 'e2e000000000000000000000';

interface SuperOnly {
  readonly what: string;
  readonly call: (request: APIRequestContext) => Promise<import('@playwright/test').APIResponse>;
  /** 권한을 지난 사람이 없는 대상을 만났을 때의 코드 */
  readonly missing: string;
}

const SUPER_ONLY: readonly SuperOnly[] = [
  {
    what: '정산 지급',
    call: (request) => request.post(`/api/admin/settlements/${NOWHERE}/pay`),
    missing: 'NOT_FOUND',
  },
  {
    what: '권한 부여',
    call: (request) =>
      request.patch(`/api/admin/users/${NOWHERE}/role`, {
        data: { role: 'CUSTOMER', reason: '검사가 보내는 요청입니다' },
      }),
    missing: 'USER_NOT_FOUND',
  },
  {
    what: '입점 승인',
    call: (request) =>
      request.patch(`/api/admin/merchants/${NOWHERE}/status`, {
        data: { status: 'APPROVED' },
      }),
    missing: 'MERCHANT_NOT_FOUND',
  },
];

test.describe('서버가 막는다 — 화면에서 감추는 것과 다른 이야기다', () => {
  for (const { what, call } of SUPER_ONLY) {
    test(`관리자가 ${what}을 직접 불러도 거절당한다`, async ({ request }) => {
      const res = await call(request);

      expect(res.status(), `${what} 이 ${res.status()} 로 답했다`).toBe(403);
      const body = (await res.json()) as { code?: string };
      /*
       * 코드까지 본다. 상태만 보면 **다른 이유로 난 403** 과 구별되지
       * 않는다 — 권한 부여는 자기 자신을 바꿀 때도 403 을 준다.
       */
      expect(body.code, '권한이 아니라 다른 이유로 막혔다').toBe('FORBIDDEN');
    });
  }

  for (const { what, call, missing } of SUPER_ONLY) {
    test(`슈퍼관리자에게는 ${what}의 문이 열려 있다`, async ({ browser }) => {
      const superAdmin = await browser.newContext({ storageState: STATE_FILE.superAdmin });
      try {
        const res = await call(superAdmin.request);

        /*
         * **없는 대상을 고른 것은 일부러다.** 진짜 정산을 지급하거나 진짜
         * 계정의 권한을 올리면 시드가 망가지고 다음 실행이 달라진다.
         * 권한을 지났는지만 알면 되는데, 그건 "없다" 는 답으로 충분하다.
         */
        expect(res.status(), `${what} 이 ${res.status()} 로 답했다`).toBe(404);
        const body = (await res.json()) as { code?: string };
        expect(body.code, '권한에서 막혔다 — 슈퍼관리자가 아닌 것처럼 굴었다').toBe(missing);
      } finally {
        await superAdmin.close();
      }
    });
  }
});

test.describe('화면도 같은 선을 긋는다', () => {
  /*
   * **`exact` 를 쓴다.** 이름 맞추기는 기본이 부분 일치라 '지급' 이 옆 표의
   * **'지급액'** 에 걸리고, '상태 변경' 도 마찬가지로 헐겁게 걸린다 —
   * 처음에 그렇게 짰다가 관리자 화면에도 지급 칸이 있다고 읽었다.
   * 검사가 화면을 잘못 읽은 것이었다.
   *
   * **정산은 여기서 화면으로 재지 않는다.** 지급 칸은 정산 행이 있어야
   * 그려지는데, 갓 시드한 DB 에는 정산이 한 건도 없다(정산은 월 마감 배치가
   * 만든다). 내 기계에서는 통과하고 CI 에서는 지는 검사가 된다 —
   * 실제로 그렇게 한 번 졌다. 그 자리는 위의 서버 검사가 대신한다.
   */

  test('관리자의 회원 화면에는 권한 변경 칸이 없고, 그 이유를 말한다', async ({ page, browser }) => {
    await page.goto('/admin/users');
    await ready(page);
    await expect(page.getByText('조회만 할 수 있습니다')).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: '권한 변경', exact: true }),
    ).toHaveCount(0);

    const superAdmin = await browser.newContext({ storageState: STATE_FILE.superAdmin });
    try {
      const sp = await superAdmin.newPage();
      await sp.goto('/admin/users');
      await ready(sp);
      await expect(
        sp.getByRole('columnheader', { name: '권한 변경', exact: true }),
      ).toBeVisible();
    } finally {
      await superAdmin.close();
    }
  });

  test('관리자의 가맹점 화면은 승인이 자기 일이 아니라고 밝힌다', async ({ page, browser }) => {
    await page.goto('/admin/merchants');
    await ready(page);
    await expect(page.getByText('입점 승인은 슈퍼관리자만 할 수 있습니다')).toBeVisible();

    const superAdmin = await browser.newContext({ storageState: STATE_FILE.superAdmin });
    try {
      const sp = await superAdmin.newPage();
      await sp.goto('/admin/merchants');
      await ready(sp);
      await expect(sp.getByText('입점 승인은 슈퍼관리자만 할 수 있습니다')).toHaveCount(0);
      await expect(
        sp.getByRole('columnheader', { name: '상태 변경', exact: true }),
      ).toBeVisible();
    } finally {
      await superAdmin.close();
    }
  });
});
