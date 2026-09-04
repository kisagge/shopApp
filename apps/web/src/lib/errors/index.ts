import 'server-only';
import {
  fingerprintOf, redactHeaders, redactPath, severityOf,
  shouldNotify, pruneSeen, type ErrorReport,
} from '@shop/core';
import { getMailer } from '@shop/mail';

/**
 * 오류 보고.
 *
 * **이것이 생기기 전까지 배포된 뒤의 실패는 아무도 몰랐다.** Vercel 로그에
 * 스택이 찍히긴 하지만 누군가 열어 보지 않으면 그대로 지나간다. 결제와
 * 정산이 도는 서비스에서 그건 눈을 감고 있는 것에 가깝다.
 *
 * 결제 게이트웨이·이벤트 싱크·메일과 같은 구조다. 인터페이스를 두고 기본
 * 구현은 콘솔, 실제 서비스는 나중에 하나 더 끼우면 된다.
 */

export interface ErrorSink {
  readonly name: string;
  report(report: ErrorReport, context: ErrorContext): Promise<void>;
}

export interface ErrorContext {
  /** 가려진 뒤의 헤더. 원본이 여기까지 오지 않는다. */
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * 한 줄 JSON 으로 남긴다.
 *
 * 사람이 읽기에는 여러 줄이 낫지만, 로그는 대개 **검색으로** 읽는다.
 * 한 줄이어야 지문이나 경로로 걸러낼 수 있고, 스택이 여러 줄이라도
 * 기록 하나가 쪼개지지 않는다.
 */
export const consoleSink: ErrorSink = {
  name: 'console',
  report(report, context) {
    console.error(
      JSON.stringify({
        tag: 'error-report',
        severity: report.severity,
        fingerprint: report.fingerprint,
        name: report.name,
        message: report.message,
        digest: report.digest,
        route: report.routePath,
        routeType: report.routeType,
        method: report.method,
        path: report.path,
        at: report.occurredAt.toISOString(),
        stack: report.stack,
        headers: context.headers,
      }),
    );
    return Promise.resolve();
  },
};

/**
 * 메일로 알린다.
 *
 * 로그만으로는 "누가 보고 있지 않으면 모른다" 는 문제가 그대로 남는다.
 * 받는 주소가 설정돼 있을 때만 켜지고, **같은 지문은 한 시간에 한 번만**
 * 나간다 — 오류는 몰려서 나기 때문에 한 건마다 보내면 받는 쪽이 곧 알림을
 * 무시하게 되고, 그러면 알림이 없는 것과 같아진다.
 */
const seen = new Map<string, number>();

export function mailSink(to: string): ErrorSink {
  return {
    name: 'mail',
    async report(report) {
      const now = Date.now();
      pruneSeen(seen, now);
      if (!shouldNotify(report.fingerprint, seen, now)) return;
      seen.set(report.fingerprint, now);

      const subject = `[PLAIN] ${report.severity === 'fatal' ? '화면 오류' : '오류'} — ${report.routePath}`;
      const lines = [
        `${report.name}: ${report.message}`,
        '',
        `경로   ${report.method} ${report.path}`,
        `라우트 ${report.routePath} (${report.routeType})`,
        `시각   ${report.occurredAt.toISOString()}`,
        report.digest ? `digest ${report.digest}` : null,
        '',
        report.stack ?? '(스택 없음)',
        '',
        /**
         * 링크를 넣지 않는다.
         *
         * 주소를 만들려면 인증 쪽 헬퍼를 가져와야 하는데, 그러면 오류 보고
         * 경로에 Prisma 와 Better Auth 가 통째로 딸려 온다. 오류가 난 요청에서
         * 무거운 모듈을 새로 불러오는 것은 그 자체로 위험하다.
         */
        `같은 오류는 한 시간에 한 번만 보냅니다. 전체 기록은 로그에서 ${report.fingerprint} 로 찾을 수 있습니다.`,
      ].filter((line): line is string => line !== null);

      await getMailer().send({
        to,
        subject,
        text: lines.join('\n'),
        // 오류 메일에 HTML 을 꾸미지 않는다. 스택은 그대로 읽히는 것이 낫다.
        html: `<pre style="font:13px/1.6 ui-monospace,monospace;white-space:pre-wrap">${escapeHtmlText(lines.join('\n'))}</pre>`,
      });
    },
  };
}

/** 스택에는 사용자 입력이 섞여 들어온다. 메일 본문에 그대로 넣지 않는다. */
function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

let sinks: ErrorSink[] | null = null;

function resolveSinks(): ErrorSink[] {
  if (sinks) return sinks;
  const to = process.env['ERROR_ALERT_EMAIL'];
  sinks = to ? [consoleSink, mailSink(to)] : [consoleSink];
  return sinks;
}

/** 테스트에서 갈아 끼운다. null 을 주면 환경을 다시 본다. */
export function setErrorSinksForTest(list: ErrorSink[] | null): void {
  sinks = list;
  seen.clear();
}

interface ReportInput {
  readonly error: unknown;
  readonly path: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly routePath: string;
  readonly routeType: string;
  readonly now?: Date;
}

/**
 * 오류 하나를 싱크들로 보낸다.
 *
 * **절대 던지지 않는다.** 오류를 보고하다 오류가 나서 요청이 더 깨지면
 * 원래 문제를 찾기만 더 어려워진다.
 */
export async function reportError(input: ReportInput): Promise<ErrorReport> {
  const err = input.error;
  const name = err instanceof Error ? err.name : typeof err;
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    err !== null && typeof err === 'object' && 'digest' in err && typeof err.digest === 'string'
      ? err.digest
      : null;

  const report: ErrorReport = {
    fingerprint: fingerprintOf({ name, message, routePath: input.routePath }),
    severity: severityOf(input.routeType),
    name,
    message,
    stack: err instanceof Error ? (err.stack ?? null) : null,
    digest,
    routePath: input.routePath,
    routeType: input.routeType,
    method: input.method,
    path: redactPath(input.path),
    occurredAt: input.now ?? new Date(),
  };

  const context: ErrorContext = { headers: redactHeaders(input.headers) };

  const results = await Promise.allSettled(
    resolveSinks().map((sink) => sink.report(report, context)),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      // 여기서 또 던지면 원래 오류가 묻힌다. 마지막 수단으로 한 줄만 남긴다.
      console.error('[error-report] 싱크 실패', result.reason);
    }
  }

  return report;
}
