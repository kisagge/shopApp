'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { canSuggest, SUGGEST_MIN_LENGTH, normalizeSearchTerm } from '@shop/core';
import type { SearchSuggestion } from '~/lib/queries/catalog/suggest';
import { useT } from '~/lib/i18n/client';

/**
 * 자동완성이 붙은 검색창.
 *
 * **폼은 그대로 둔다.** 스크립트가 없거나 제안을 못 받아도 GET 폼으로
 * 검색은 된다 — 자동완성은 얹는 것이지 대신하는 것이 아니다.
 *
 * 접근성은 콤보박스 규칙을 그대로 따른다: 입력칸이 `combobox` 로서 열림
 * 상태와 목록을 가리키고, 지금 고른 항목을 `aria-activedescendant` 로
 * 말한다. **초점은 입력칸에 그대로 둔다** — 화살표로 옮겨 다니는 동안에도
 * 글자를 계속 칠 수 있어야 한다.
 *
 * 제안 개수는 조용히 바뀌면 안 되므로 live 영역으로 알린다.
 */

const DEBOUNCE_MS = 150;

export function SearchBox({
  id,
  variant = 'header',
}: {
  id: string;
  /** 'header' 는 한 줄, 'menu' 는 모바일 메뉴 안의 넓은 배치 */
  variant?: 'header' | 'menu';
}) {
  const t = useT();
  const router = useRouter();
  const listId = useId();

  const [term, setTerm] = useState('');
  const [items, setItems] = useState<SearchSuggestion[]>([]);
  /**
   * `items` 가 **어느 글자에 대한 답인가.**
   *
   * 이것이 없으면 "제안이 없다" 를 아직 답이 오기 전에 말하게 된다 — 치는
   * 도중에는 언제나 목록이 비어 있기 때문이다.
   */
  const [answeredFor, setAnsweredFor] = useState('');
  /**
   * 사용자가 **닫았는가**. "열렸는가" 가 아니다.
   *
   * 열림을 상태로 두면 글자를 지웠을 때 이펙트 안에서 곧바로 닫아야 하고,
   * 그 동기 setState 가 렌더를 한 번 더 부른다. 닫힘만 사용자의 동작으로
   * 두고 나머지는 지금 값에서 끌어내면 그럴 일이 없다.
   */
  const [closed, setClosed] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * 마지막으로 답을 받은 글자. 상태와 같은 값을 들고 있지만 **이펙트 안에서
   * 지금 값을 봐야** 해서 따로 둔다.
   */
  const answeredRef = useRef('');

  const eligible = canSuggest(term);

  /**
   * 너무 짧아서 화면을 통째로 바꿀 수는 없다고 말한 자리.
   *
   * **예전에는 검색 화면으로 보내 놓고 거기서 말했다.** 두 글자를 안 쳤다는
   * 이유로 보던 화면이 사라지고, 돌아오려면 뒤로 가기를 눌러야 했다 —
   * 알려 주려고 한 일이 오히려 하던 일을 끊는다. 여기서 막고 여기서 말한다.
   *
   * **자바스크립트가 없으면 그대로 넘어간다.** 그때는 검색 화면이 같은 말을
   * 하므로 길이 막히지는 않는다 — 이 자리는 그 위에 얹는 편의다.
   */
  const [tooShort, setTooShort] = useState(false);

  /*
   * **지우는 이펙트를 두지 않는다.** 글자가 다시 쓸 만해지면 저절로
   * 사라져야 하는데, 그걸 이펙트에서 setState 로 되돌리면 렌더가 한 번 더
   * 돈다. 이 파일이 `closed` 를 다루는 방식과 같다 — 사용자가 한 일만
   * 상태로 두고 나머지는 지금 값에서 끌어낸다.
   *
   * 판단은 core 가 한다. 여기서 길이를 세면 검색이 무엇을 받아 주는지가
   * 두 곳에 적히고, 한글 한 음절 같은 예외에서 곧바로 갈라진다.
   */
  const showTooShort = tooShort && normalizeSearchTerm(term) === null;

  /*
   * **폼은 우리 것이 아니다.** 헤더와 메뉴가 각자 <form> 을 두르고 이
   * 상자를 안에 넣는다 — 자바스크립트 없이도 검색이 되게 하려고 그렇게
   * 짜여 있다. 그래서 감싸고 있는 폼을 찾아 제출을 가로챈다.
   */
  useEffect(() => {
    const form = rootRef.current?.closest('form');
    if (!form) return;

    const onSubmit = (event: SubmitEvent) => {
      const input = form.querySelector('input[name="q"]');
      const value = input instanceof HTMLInputElement ? input.value : '';
      if (normalizeSearchTerm(value) !== null) return;

      // 너무 짧다. 화면을 바꾸지 않고 이 자리에서 말한다.
      event.preventDefault();
      setTooShort(true);
    };

    form.addEventListener('submit', onSubmit);
    return () => form.removeEventListener('submit', onSubmit);
  }, []);

  // 글자마다 부르지 않는다. 치는 도중의 중간 글자는 대부분 버려진다.
  useEffect(() => {
    if (!canSuggest(term)) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((body: { suggestions: SearchSuggestion[] }) => {
          setItems(body.suggestions);
          /*
           * **같은 글자에 대한 답이 다시 오면 고른 자리를 흔들지 않는다.**
           * 목록이 그대로인데 화살표로 짚어 둔 것만 풀리면, 화살표를 누른
           * 직후 150ms 안에 답이 도착한 사람에게는 키가 씹힌 것처럼 보인다.
           * 글자가 바뀌었을 때만 되돌린다 — 그때는 자리 번호가 옛 목록의
           * 것이라 그대로 두는 쪽이 틀린다.
           */
          if (answeredRef.current !== term) setActive(-1);
          answeredRef.current = term;
          setAnsweredFor(term);
        })
        .catch(() => {
          // 제안을 못 받아도 검색 자체는 폼으로 된다
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  // 바깥을 누르면 닫는다
  useEffect(() => {
    const onOutside = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setClosed(true);
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, []);

  const answered = !closed && eligible && answeredFor === term;
  const showing = answered && items.length > 0;

  function go(item: SearchSuggestion) {
    setClosed(true);
    router.push(item.href as never);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      /*
       * **브라우저가 칸을 비우는 것을 막는다.**
       *
       * type="search" 인 칸에서 Escape 는 브라우저가 값을 지우는 기본
       * 동작이다. 그런데 이 칸은 React 가 값을 들고 있어서, 지워지는 것은
       * 화면뿐이고 상태는 그대로 남는다 — 사람 눈에는 비어 있는데 폼은
       * 옛 값을 들고 있는, 둘이 어긋난 상태가 된다.
       *
       * 실제로 그 상태에서 엔터를 누르면 **빈 검색**이 나갔다. 명세가
       * 주소 모양만 보고 있어서 `/search?q=` 로도 통과해 아무도 몰랐다.
       *
       * Escape 로 하려던 일은 목록을 닫는 것이다. 친 글자를 지우는 것이
       * 아니다.
       */
      event.preventDefault();
      setClosed(true);
      return;
    }
    if (!showing) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const down = event.key === 'ArrowDown';
      setActive((i) =>
        /*
         * 아직 아무것도 고르지 않았을 때(-1)는 감기 계산에 넣지 않는다.
         * 넣으면 위로 올렸을 때 마지막이 아니라 두 번째가 걸린다.
         */
        i === -1
          ? down
            ? 0
            : items.length - 1
          : (i + (down ? 1 : -1) + items.length) % items.length,
      );
      return;
    }
    if (event.key === 'Enter' && active >= 0) {
      // 고른 것이 있으면 폼 전송 대신 그리로 간다
      event.preventDefault();
      go(items[active]!);
    }
  }

  const KIND_LABEL: Record<SearchSuggestion['kind'], string> = {
    product: t('suggest.product'),
    brand: t('suggest.brand'),
    category: t('suggest.category'),
  };

  const menu = variant === 'menu';

  return (
    /*
     * **min-w-0 이 있어야 줄어든다.** flex 자식은 기본이 min-width:auto 라
     * 안쪽 최소 폭보다 좁아지지 못한다. 그대로 두었더니 좁은 화면에서 이
     * 상자가 폼 밖으로 20px 밀려 나가, 검색 단추가 화면 오른쪽으로 잘렸다.
     * 데스크톱 브라우저 375px 에서는 안 나고 실제 기기(411px)에서 났다 —
     * 안쪽 최소 폭이 글꼴에 따라 달라지기 때문이다.
     */
    <div ref={rootRef} className={menu ? 'relative flex min-w-0 flex-1 gap-2' : 'relative'}>
      <label htmlFor={id} className="sr-only">
        {t('nav.searchLabel')}
      </label>
      <input
        id={id}
        type="search"
        name="q"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          // 다시 치기 시작하면 닫아 둔 것을 연다
          setClosed(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setClosed(false)}
        placeholder={t('nav.searchPlaceholder')}
        maxLength={60}
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={
          menu
            ? 'h-11 min-w-0 flex-1 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus-visible:border-n-500'
            : 'h-9 w-36 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus-visible:border-n-500 md:w-48'
        }
      />

      {menu && (
        <button
          type="submit"
          className="h-11 shrink-0 rounded-sm bg-[var(--brand)] px-4 text-sm font-medium text-[var(--bg)]"
        >
          {t('common.search')}
        </button>
      )}

      {/*
        **입력칸 바로 아래에 붙인다.** 화면 구석에 띄우면 무엇에 대한 말인지
        눈으로 이어 붙여야 하고, 낭독기에서는 더 그렇다. 잘못된 자리 옆이
        가장 짧은 거리다. role=status 라 하던 말을 끊지 않는다.
      */}
      {showTooShort && (
        <p
          role="status"
          className={`absolute top-full z-30 mt-1 rounded-sm bg-[var(--brand)] px-3 py-2 text-[12px] text-[var(--bg)] ${menu ? 'inset-x-0' : 'right-0 left-0 whitespace-nowrap'}`}
        >
          {t('search.tooShort', { min: SUGGEST_MIN_LENGTH })}
        </p>
      )}

      {/*
        몇 개가 떴는지는 눈으로만 보인다 — 소리로도 알린다. **없다는 것도
        알린다**: 답이 온 뒤의 침묵은 "아직 오지 않았다" 와 구별되지 않는다.
      */}
      <p role="status" className="sr-only">
        {showing
          ? t('suggest.count', { count: items.length })
          : answered && items.length === 0
            ? t('suggest.none')
            : ''}
      </p>

      <ul
        id={listId}
        role="listbox"
        aria-label={t('suggest.label')}
        hidden={!showing}
        className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-sm border border-[var(--border)] bg-[var(--bg)] py-1 shadow-lg"
      >
        {items.map((item, i) => (
          /*
            키보드는 입력칸이 맡는다 — 콤보박스 규칙대로 초점을 옮기지 않고
            aria-activedescendant 로 가리킨다. 그래서 이 항목에는 키 처리기가
            없고, 그것이 이 패턴에서는 맞다.
          */
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={`${item.kind}:${item.href}`}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            /* 눌러서 초점이 옮겨 가면 입력칸이 닫히므로 기본 동작을 막는다 */
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => go(item)}
            className={`flex cursor-pointer items-baseline gap-2 px-3 py-2 text-[13px] ${
              i === active ? 'bg-[var(--surface-2)]' : ''
            }`}
          >
            <span className="shrink-0 text-[10px] text-[var(--fg-muted)]">
              {KIND_LABEL[item.kind]}
            </span>
            <span className="truncate">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { SUGGEST_MIN_LENGTH };
