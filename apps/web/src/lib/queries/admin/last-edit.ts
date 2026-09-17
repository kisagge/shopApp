import 'server-only';
import { prisma } from '@shop/db';
import { actorLabel, assertPermission, canEditReturnAddress, ForbiddenError, type Actor, type PolicyKind } from '@shop/core';
import { loadActors } from './actors';

/**
 * 한 벌짜리 설정을 마지막으로 고친 때와 사람.
 *
 * 배송 정책·반품지·약관은 고칠 때마다 `updatedById` 를 **적어 두기만 했다.** 설정 화면에는 지금 값만 있어서, "누가
 * 무료배송 기준을 바꿨지?" 는 감사 로그를 뒤져야 나왔다. 감사 로그가 진실이고 이것은 화면에 보여 줄 한 줄이다.
 *
 * 손님 화면과 캐시가 함께 읽는 조회(getShippingPolicy 등)에는 섞지 않는다 — 운영자 이름이 공개 캐시에 들어가면 안 된다.
 *
 * 권한은 **그 설정을 고칠 수 있는 사람**과 같다 — 고치는 화면에만 뜨는 줄이다.
 */
export interface LastEdit {
  readonly at: Date;
  /** core 의 actorLabel — 가맹점에게 운영진의 이름은 "운영진" 이다 */
  readonly by: string;
}

interface EditRow {
  readonly updatedAt: Date;
  readonly updatedById: string | null;
}

async function describe(actor: Actor, rows: readonly (EditRow | null)[]): Promise<(LastEdit | null)[]> {
  const people = await loadActors(rows.map((r) => r?.updatedById ?? null));
  return rows.map((row) => row && {
    at: row.updatedAt,
    by: actorLabel(actor, {
      id: row.updatedById,
      identity: row.updatedById ? people.get(row.updatedById) ?? null : null,
    }, '기록 없음'),
  });
}

const EDIT_SELECT = { updatedAt: true, updatedById: true } as const;

/** 배송 정책. 한 번도 저장하지 않았으면(기본값으로 도는 중) null */
export async function getShippingPolicyEdit(actor: Actor): Promise<LastEdit | null> {
  assertPermission(actor, 'shipping:write');
  const row = await prisma.shippingPolicy.findUnique({ where: { id: 'default' }, select: EDIT_SELECT });
  const [edit] = await describe(actor, [row]);
  return edit ?? null;
}

/** 반품지. merchantId 가 null 이면 자사 상품 반품지. 등록 전이면 null */
export async function getReturnAddressEdit(actor: Actor, merchantId: string | null): Promise<LastEdit | null> {
  const permission = merchantId === null ? 'shipping:write' : 'merchant:write';
  assertPermission(actor, permission);
  // 가맹점은 제 반품지만 — 남의 가맹점 것을 누가 고쳤는지는 알 일이 아니다
  if (!canEditReturnAddress(actor, merchantId)) throw new ForbiddenError(actor, permission);
  const row = await prisma.returnAddress.findFirst({ where: { merchantId }, select: EDIT_SELECT });
  const [edit] = await describe(actor, [row]);
  return edit ?? null;
}

/** 약관·방침마다. 아직 쓰지 않은 문서는 빠진다 */
export async function getPolicyEdits(actor: Actor): Promise<ReadonlyMap<PolicyKind, LastEdit>> {
  assertPermission(actor, 'support:write');
  const rows = await prisma.policy.findMany({ select: { kind: true, ...EDIT_SELECT } });
  const edits = await describe(actor, rows);
  return new Map(rows.flatMap((row, i) => {
    const edit = edits[i];
    return edit ? [[row.kind, edit] as const] : [];
  }));
}
