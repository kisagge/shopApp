/**
 * 스키마를 걸어서 **문구가 붙지 않은 제약**을 찾는다.
 *
 * 소스를 정규식으로 훑는 방법을 먼저 썼는데, 주석과 응답 스키마가 섞여 들어와
 * 세 배 넘게 부풀었다. Zod 4 는 검사 하나하나를 객체로 들고 있고 사용자 문구를
 * 준 것에만 `error` 가 붙는다 — 그래서 실제 스키마를 걸으면 정확하다.
 */

export interface MissingCheck {
  readonly path: string;
  /** min_length · max_length · greater_than … */
  readonly check: string;
}

/** 값을 바꾸기만 하고 실패하지 않는 것(`.trim()` 같은 것) */
const NEVER_FAILS = new Set(['overwrite']);

/** 여기서 멈춘다 — 실패해도 기본값으로 넘어가 사람에게 보이지 않는다 */
const SWALLOWS_FAILURE = new Set(['catch']);

type Node = { readonly _zod?: { readonly def?: Record<string, unknown> } };

const defOf = (node: unknown): Record<string, unknown> | null => {
  const def = (node as Node | null)?._zod?.def;
  return def && typeof def['type'] === 'string' ? def : null;
};

export function isSchema(value: unknown): boolean {
  return defOf(value) !== null;
}

export function checksWithoutMessage(schema: unknown): readonly MissingCheck[] {
  const found: MissingCheck[] = [];
  const seen = new Set<unknown>();

  const visit = (node: unknown, path: string): void => {
    const def = defOf(node);
    if (def === null || seen.has(node)) return;
    seen.add(node);

    if (SWALLOWS_FAILURE.has(def['type'] as string)) return;

    for (const check of (def['checks'] as unknown[] | undefined) ?? []) {
      const cdef = (check as Node)._zod?.def;
      if (!cdef) continue;
      const raw = cdef['check'];
      const name = typeof raw === 'string' ? raw : 'unknown';
      if (NEVER_FAILS.has(name) || cdef['error'] !== undefined) continue;
      found.push({ path: path || '.', check: name });
    }

    for (const key of ['innerType', 'in', 'out', 'element', 'valueType', 'keyType', 'left', 'right']) {
      if (def[key]) visit(def[key], path);
    }
    if (typeof def['getter'] === 'function') visit((def['getter'] as () => unknown)(), path);

    const shape = def['shape'] as Record<string, unknown> | undefined;
    if (shape) {
      for (const [key, value] of Object.entries(shape)) {
        visit(value, path ? `${path}.${key}` : key);
      }
    }

    for (const key of ['options', 'items']) {
      const list = def[key] as unknown[] | undefined;
      if (Array.isArray(list)) for (const item of list) visit(item, path);
    }
  };

  visit(schema, '');
  return found;
}
