import { NextResponse } from 'next/server';
import { hasPermission, parseCsv, readStockUpload, STOCK_UPLOAD_MAX_ROWS, type StockUploadProblem } from '@shop/core';
import { bulkStockSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { bulkUpdateStock, type BulkStockFailure } from '~/lib/admin/bulk-stock';
import { revalidateCatalog } from '~/lib/cache';
import { enforceRateLimit } from '~/lib/rate-limit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 재고 일괄 수정.
 *
 * 파일에서 이미 틀린 줄(숫자가 아님, 같은 SKU 에 다른 숫자)은 적용하지 않고 줄 번호와 이유로
 * 돌려주고, 나머지는 적용한다. 한 줄의 오타 때문에 수백 개 옵션의 실사 반영을 막으면 그 사이
 * 없는 물건이 팔린다.
 */

const PROBLEM_MESSAGE: Record<Exclude<StockUploadProblem['kind'], 'NO_HEADER'>, string> = {
  INVALID_STOCK: '재고는 0 이상의 정수여야 합니다.',
  INVALID_ACTIVE: '판매 칸은 판매중·판매중지 중 하나로 적어 주세요.',
  CONFLICT: '같은 SKU 에 다른 값이 적혀 있습니다. 한 줄만 남겨 주세요.',
};

export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  // 권한을 본문보다 먼저 본다 — 반대면 무엇을 보내야 통과하는지 알려 주게 된다
  if (!hasPermission(actor, 'product:write')) {
    return await forbidden();
  }

  const limited = await enforceRateLimit('stockBulk', request, actor.id);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }
  const parsed = bulkStockSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const upload = readStockUpload(parseCsv(parsed.data.csv));
  const header = upload.problems.find((p) => p.kind === 'NO_HEADER');
  if (header && header.kind === 'NO_HEADER') {
    return NextResponse.json(
      { code: 'NO_HEADER', message: `필요한 머리칸이 없습니다: ${header.missing.join(', ')}. 재고 내려받기 파일을 그대로 쓰면 됩니다.` },
      { status: 400 },
    );
  }
  if (upload.entries.length > STOCK_UPLOAD_MAX_ROWS) {
    return NextResponse.json(
      { code: 'TOO_MANY', message: `한 번에 ${STOCK_UPLOAD_MAX_ROWS.toLocaleString('ko-KR')}개까지 올릴 수 있습니다. 나눠 올려 주세요.` },
      { status: 413 },
    );
  }

  const fileFailures: BulkStockFailure[] = upload.problems.flatMap((p) =>
    p.kind === 'NO_HEADER'
      ? []
      : [{
          sku: p.sku,
          lines: 'lines' in p ? p.lines : [p.line],
          code: p.kind,
          message: 'value' in p ? `${PROBLEM_MESSAGE[p.kind]} (${p.value})` : PROBLEM_MESSAGE[p.kind],
        }],
  );

  const result = await bulkUpdateStock(actor, upload.entries, request);
  // 품절이던 것이 다시 팔려야 하고, 줄인 것은 더 안 팔려야 한다
  if (result.updated > 0) revalidateCatalog();

  return NextResponse.json({
    updated: result.updated,
    unchanged: result.unchanged,
    skipped: upload.skipped,
    failures: [...fileFailures, ...result.failures],
  });
}
