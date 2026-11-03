import 'server-only';
import { uploadBodyLimit } from '@shop/core';

/**
 * 본문이 너무 큰지 **읽기 전에** 본다.
 *
 * 업로드 창구들은 `await request.formData()` 로 읽는다. 그 한 줄이 끝나는 순간 **본문
 * 전체가 이미 메모리에 올라와 있다.** 그런데 여섯 자리가 그 아래에서 `file.size` 를 보며
 * "바이트를 메모리에 올리기 전에 크기를 먼저 본다" 고 적어 두었다 — 파일 하나를
 * `arrayBuffer()` 로 다시 읽는 것에 비하면 맞는 말이지만, **본문에 대해서는 틀린 말이다.**
 * 5MB 상한을 두고 500MB 를 다 받아 낸 뒤에 거절하는 셈이었다.
 *
 * **한계를 분명히 적는다 — 이것으로 끝나지 않는다.**
 *
 *   - `Content-Length` 가 없는 요청(chunked)은 **그냥 통과한다.** 읽기 전에 알 수 있는
 *     값이 없기 때문이다. 작정한 쪽은 그 길로 돌아갈 수 있다.
 *   - 작게 거짓으로 적으면 서버는 그만큼만 읽으므로 **제 업로드를 자기가 끊는다** —
 *     공격자에게 이득이 없다.
 *
 * 그래서 이것은 **실수로 큰 파일을 올리는 경우와 게으른 쪽을 값싸게 끊는 문지기**다.
 * 작정한 쪽까지 막으려면 앞단(플랫폼·프록시)의 본문 상한이 필요하고, 그것은 소스가 아니라
 * 배포 설정에 있다 — 이 저장소에는 그 설정이 없다.
 */
export function bodyTooLarge(request: Request, maxFiles: number): boolean {
  const declared = request.headers.get('content-length');
  if (declared === null) return false;

  const length = Number(declared);
  // 숫자가 아니면 판단을 미룬다 — 아래의 파일별 검사가 여전히 본다
  if (!Number.isFinite(length)) return false;

  return length > uploadBodyLimit(maxFiles);
}
