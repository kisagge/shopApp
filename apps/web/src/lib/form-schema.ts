'use client';

import { useEffect, useRef } from 'react';

/**
 * 검증 스키마를 **첫 그림 뒤에** 받아 온다.
 *
 * 폼은 보내기 전에 스스로 거른다 — 오타 하나에 왕복을 쓰지 않으려는 것이고,
 * 그 판단은 그대로 둔다. 다만 그러자고 계약 패키지를 화면과 함께 받으면
 * **Zod 가 384KB 째로 첫 그림을 막는다.** 실제로 가입 화면이 1,180KB 였고
 * 그중 384KB 가 이것이었다.
 *
 * 그래서 늦게 받되, 누를 때까지 미루지 않는다. 화면이 그려진 뒤 조용히
 * 받아 두면 사람이 칸을 채우는 동안 도착한다 — 누르는 순간에는 이미 있다.
 * 아직 안 왔으면 그때 기다린다(어차피 곧바로 요청을 보낼 참이다).
 */
export function useLazySchema<T>(load: () => Promise<T>): () => Promise<T> {
  const pending = useRef<Promise<T> | null>(null);

  const get = (): Promise<T> => {
    pending.current ??= load();
    return pending.current;
  };

  useEffect(() => {
    // 첫 그림을 막지 않으려고 이펙트에서 시작한다
    void get();
    // load 는 매 렌더 새 함수라 의존성에 넣으면 매번 다시 부른다.
    // 한 번만 받으면 되므로 비워 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return get;
}
