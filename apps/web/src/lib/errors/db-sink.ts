import 'server-only';
import { prisma } from '@shop/db';
import { reopensGroup, trimStack, MAX_ERROR_MESSAGE, type ErrorSource } from '@shop/core';
import type { ErrorSink } from './index';

/**
 * 오류를 남긴다.
 *
 * **콘솔과 메일만으로는 규모를 볼 수 없었다.** 로그는 누가 열어 봐야 하고, 메일은 같은 지문을 한 시간에 한 번만
 * 보낸다 — 그래서 "이 오류가 몇 번 났는가" 에 답할 곳이 어디에도 없었다. 지문 하나에 행 하나를 두고 센다.
 *
 * **여기서 던지지 않는다.** 오류를 적다 오류가 나서 요청이 더 깨지면 원래 문제를 찾기만 더 어려워진다 —
 * 부르는 쪽(reportError)이 allSettled 로 감싸지만, 이쪽에서도 조용히 끝낸다.
 */
export function dbSink(source: ErrorSource): ErrorSink {
  return {
    name: 'db',
    async report(report) {
      const message = report.message.slice(0, MAX_ERROR_MESSAGE);
      const stack = trimStack(report.stack);
      const at = report.occurredAt;

      const existing = await prisma.errorGroup.findUnique({
        where: { fingerprint: report.fingerprint },
        select: { resolvedAt: true },
      });

      if (existing === null) {
        await prisma.errorGroup.create({
          data: {
            fingerprint: report.fingerprint,
            source,
            severity: report.severity,
            name: report.name,
            message,
            stack,
            routePath: report.routePath,
            routeType: report.routeType,
            method: report.method,
            path: report.path,
            firstSeenAt: at,
            lastSeenAt: at,
          },
        });
        return;
      }

      await prisma.errorGroup.update({
        where: { fingerprint: report.fingerprint },
        data: {
          // 값은 **마지막 것**으로 갈아 끼운다. 지문이 같아도 메시지·스택은 조금씩 다르고, 고칠 때 보는 것은 최근 것이다.
          severity: report.severity,
          message,
          stack,
          method: report.method,
          path: report.path,
          count: { increment: 1 },
          lastSeenAt: at,
          /*
           * **처리했다고 닫아 둔 오류가 또 나면 다시 연다.** 조용히 횟수만 올리면 닫힌 목록 뒤에 숨어,
           * 처리 표시가 오히려 눈을 가린다.
           */
          ...(reopensGroup(existing, at) ? { resolvedAt: null, resolvedById: null } : {}),
        },
      });
    },
  };
}
