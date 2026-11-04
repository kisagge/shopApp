/**
 * CSV 한 칸·한 줄 만들기와 읽기.
 *
 * 순수 함수만 둔다. 내보내기와 올리기가 **같은 규칙**을 써야 한다 — 우리가
 * 내보낸 파일을 그대로 다시 올렸는데 못 읽으면 그건 규칙이 두 벌이라는 뜻이다.
 */

/**
 * **수식으로 읽히는 칸을 막는다.**
 *
 * 상품명·수령인·배송 메모는 사람이 적은 값이다. `=HYPERLINK("http://…")` 나
 * `@SUM(…)` 으로 시작하면 운영자가 엑셀로 여는 순간 **수식으로 실행된다** —
 * 이것이 CSV 주입이고, 손님이 배송 메모 한 칸으로 운영자의 기계에서 무언가를
 * 돌리게 할 수 있다.
 *
 * 앞에 작은따옴표를 붙여 글자로 읽히게 한다. 탭과 캐리지 리턴도 같은 취급을 받는
 * 표계산기가 있어 함께 막는다.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  // 숫자는 수식이 아니다 — 음수 금액에 따옴표를 붙이면 계산을 못 한다
  const text = typeof value !== 'number' && FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  // 쉼표·따옴표·줄바꿈이 있으면 감싸고, 안의 따옴표는 두 번 쓴다
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

/**
 * 파일 전체.
 *
 * **BOM 을 붙인다.** 안 붙이면 엑셀이 UTF-8 인 줄 모르고 한글을 깨뜨린다 — 국내
 * 운영자 대부분이 CSV 를 엑셀로 연다. 줄 끝은 CRLF 다(RFC 4180).
 */
export function csvDocument(
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return '\uFEFF' + [csvRow(header), ...rows.map(csvRow)].join('\r\n') + '\r\n';
}

/**
 * CSV 를 줄과 칸으로 읽는다.
 *
 * 따옴표로 감싼 칸 안의 쉼표·줄바꿈과 두 번 쓴 따옴표를 푼다. BOM 이 있으면
 * 걷어 낸다 — 엑셀로 저장하면 붙어 오고, 안 걷으면 첫 머리칸 이름이 틀려진다.
 * 빈 줄은 버린다.
 */
/**
 * 이 줄에 적힌 것이 있는가.
 *
 * **`parseCsv` 가 버리는 줄의 기준이자, 읽는 쪽이 조용히 건너뛰어도 되는 줄의 기준이다.**
 * 엑셀에서 내보내면 끝에 빈 행이 붙고 중간에도 빈 줄이 섞인다 — 그건 사람의 뜻이 아니라
 * 도구의 흔적이라 아무 말 없이 버린다.
 *
 * 둘이 같은 서술어를 써야 한다. 읽는 쪽이 더 넓게 버리면 **사람이 적은 줄이 말없이
 * 사라지고**, 더 좁게 버리면 도구의 흔적을 사람의 실수로 신고한다.
 */
export const hasContent = (row: readonly string[]): boolean => row.some((c) => c.trim() !== '');

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter(hasContent);
}
