'use client';

import { useEffect } from 'react';
import { onLCP, onINP, onCLS, onTTFB, onFCP, type Metric } from 'web-vitals';
import { rateVital, isWebVital } from '@shop/core';
import { track } from '~/lib/analytics/client';

/**
 * 실사용자 성능을 기록한다.
 *
 * **내 기계에서 잰 숫자는 아무것도 말해 주지 않는다.** 이 저장소에서 잰
 * "첫 바이트 14.9ms" 같은 값은 DB 가 같은 기계에 있고 캐시가 데워진
 * 상태에서 나온 것이다. 지하철에서 여는 사람의 화면과는 관계가 없다.
 *
 * 재는 것을 손으로 만들지 않고 web-vitals 를 쓴다. LCP 는 PerformanceObserver
 * 로 흉내 낼 수 있지만 **INP 는 그렇지 않다** — 입력마다 처리·렌더·표시까지의
 * 지연을 모아 최악에 가까운 하나를 고르는 규칙이고, 직접 쓰면 틀린 숫자를
 * 자신 있게 보게 된다. 3KB 를 쓰고 맞는 숫자를 얻는 편이 낫다.
 *
 * 보내는 길은 이미 있는 이벤트 파이프라인 그대로다 — 배치, 이탈 직전
 * sendBeacon, 동의 게이트, 요청 제한이 전부 그쪽에 있다.
 */
export function WebVitalsReporter() {
  useEffect(() => {
    const report = (metric: Metric) => {
      // 라이브러리가 우리가 모르는 지표를 더해도 조용히 넘긴다
      if (!isWebVital(metric.name)) return;

      track('web_vitals', {
        metric: metric.name,
        /*
         * CLS 만 소수라 그대로 두고 나머지는 밀리초로 반올림한다.
         * 0.0001 초 단위까지 저장해 봐야 읽는 사람에게 뜻이 없다.
         */
        value: metric.name === 'CLS' ? Number(metric.value.toFixed(4)) : Math.round(metric.value),
        rating: rateVital(metric.name, metric.value),
        navigationType: metric.navigationType,
      });
    };

    /*
     * **화면을 떠날 때 한 번 더 보고한다(reportAllChanges 없이 기본 동작).**
     * LCP 와 CLS 는 사람이 스크롤하고 누르는 동안 값이 바뀌므로, 중간값을
     * 여러 번 보내면 백분위가 낙관적으로 기운다. 라이브러리가 확정된 값을
     * 한 번만 준다.
     */
    onLCP(report);
    onINP(report);
    onCLS(report);
    onTTFB(report);
    onFCP(report);
  }, []);

  return null;
}
