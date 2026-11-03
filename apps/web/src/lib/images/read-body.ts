import 'server-only';
import { ImageError, MAX_IMAGE_BYTES, type ImageErrorCode } from '@shop/core';
import { bodyTooLarge } from '~/lib/api/body-size';
import type { ImageFile } from './upload-files';

/**
 * 사진이 있으면 multipart(`data` 칸에 JSON, `images` 칸에 파일), 없으면 JSON 으로 온다 — 리뷰와 문의가 같은 모양이다.
 * 사진 없는 글이 대부분이라 JSON 경로를 없애지 않는다.
 *
 * **본문부터 끊고, 그다음에 파일마다 본다.** 예전에는 `formData()` 아래에서 `entry.size` 를 보며 "읽기 전에 크기를 본다" 고
 * 적어 두었는데, **그 윗줄이 이미 본문 전체를 메모리에 올린 뒤였다** — 5MB 제한을 두고 500MB 를 받아 낸 뒤에 거절하는
 * 셈이었다. 그래서 `formData()` 앞에서 Content-Length 로 자릿수를 끊는다(그 한계는 `body-size` 에 적었다).
 * 파일마다 보는 검사는 그대로 남는다 — 본문 상한은 넉넉하고, 한 바이트를 가리는 것은 그쪽 일이다.
 *
 * 형식이 틀리면 SyntaxError 를, 사진 규칙에 어긋나면 ImageError 를 던진다(부르는 창구가 둘을 다르게 답한다).
 */
export async function readJsonWithImages(
  request: Request,
  limit: { readonly max: number; readonly tooMany: ImageErrorCode },
): Promise<{ fields: unknown; files: ImageFile[] }> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('multipart/form-data')) {
    return { fields: await request.json(), files: [] };
  }

  if (bodyTooLarge(request, limit.max)) throw new ImageError('TOO_LARGE');

  const form = await request.formData();
  const raw = form.get('data');
  const fields: unknown = typeof raw === 'string' ? JSON.parse(raw) : {};

  const files: ImageFile[] = [];
  for (const entry of form.getAll('images')) {
    if (typeof entry === 'string') continue;
    if (entry.size > MAX_IMAGE_BYTES) throw new ImageError('TOO_LARGE');
    // 다 읽기 전에 개수를 끊는다
    if (files.length >= limit.max) throw new ImageError(limit.tooMany);
    files.push({ bytes: new Uint8Array(await entry.arrayBuffer()), declaredType: entry.type });
  }
  return { fields, files };
}
