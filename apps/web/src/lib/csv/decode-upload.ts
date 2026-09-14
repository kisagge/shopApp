/**
 * 올린 CSV 파일을 글자로 읽는다.
 *
 * **한국어 엑셀은 CSV 를 UTF-8 로 저장하지 않는다.** "CSV (쉼표로 분리)" 로
 * 저장하면 CP949(EUC-KR)로 나간다. 내려받은 파일(UTF-8)을 열어 송장번호를
 * 채우고 저장하는 순간 인코딩이 바뀐다 — 그대로 UTF-8 로 읽으면 머리칸이
 * 깨져서 "주문번호 칸이 없습니다" 가 뜨고, 운영자는 칸이 멀쩡히 있는 파일을
 * 들여다보게 된다.
 *
 * UTF-8 로 엄격하게 읽어 보고, 틀린 바이트가 나오면 CP949 로 다시 읽는다.
 * 순서가 반대면 안 된다 — UTF-8 한글은 CP949 로도 (깨진 채) 읽혀서 실패가
 * 나지 않는다.
 */
export function decodeUpload(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('euc-kr').decode(bytes);
  }
}
