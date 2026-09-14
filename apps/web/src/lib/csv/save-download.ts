/**
 * 받은 응답을 파일로 저장하게 한다(브라우저 전용).
 *
 * 주문·재고·감사 로그 내려받기가 같은 몇 줄을 복사해 쓰고 있었다. 내려받기는 POST 로 받아야 하는 곳이 있어(링크 미리
 * 받기만으로 파일이 만들어지면 안 된다) `<a href download>` 로 못 하고, 응답을 blob 으로 받아 임시 주소를 만든다.
 *
 * 파일 이름은 서버가 정한다(content-disposition). 못 읽으면 `fallbackName`.
 */
export async function saveResponseAsFile(response: Response, fallbackName: string): Promise<void> {
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;

  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // 클릭 직후 끊으면 일부 브라우저가 받기를 시작하기 전에 주소가 사라진다
  setTimeout(() => URL.revokeObjectURL(href), 1_000);
}
