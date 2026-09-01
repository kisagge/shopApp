import 'server-only';
import type { ImageContentType } from '@shop/core';
import { S3Storage } from './s3';

/**
 * 오브젝트 스토리지 어댑터.
 *
 * 결제(PaymentGateway)·이벤트(EventSink) 와 같은 구조다. 로컬은 MinIO,
 * 배포는 S3 나 R2 — 어느 쪽이든 S3 호환 API 라 구현은 하나로 충분하고,
 * 설정이 없으면 **동작하는 척하지 않고 분명히 거절한다.**
 */

export interface PutObjectInput {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: ImageContentType;
}

export interface StorageAdapter {
  readonly name: string;
  put(input: PutObjectInput): Promise<{ url: string }>;
  remove(key: string): Promise<void>;
}

export class StorageError extends Error {
  constructor(readonly code: 'NOT_CONFIGURED' | 'PUT_FAILED' | 'DELETE_FAILED', message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export interface S3Config {
  readonly endpoint: string | undefined;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly publicBaseUrl: string;
  readonly forcePathStyle: boolean;
}

/**
 * 설정이 **전부** 있어야 쓴다.
 *
 * 토스 키를 형식까지 확인해 Mock 으로 떨어뜨린 것과 같은 이유다. 반쯤 채워진
 * 설정으로 실제 스토리지를 두드리면 무슨 일이 일어나는지 모르는 채로
 * 실패한다 — 실제로 플레이스홀더 키로 토스 API 를 때린 적이 있다.
 */
export function readS3Config(env: NodeJS.ProcessEnv = process.env): S3Config | null {
  const bucket = env['S3_BUCKET'];
  const accessKeyId = env['S3_ACCESS_KEY_ID'];
  const secretAccessKey = env['S3_SECRET_ACCESS_KEY'];
  const publicBaseUrl = env['S3_PUBLIC_BASE_URL'];

  if (!bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) return null;

  return {
    // MinIO 는 엔드포인트가 필요하고 AWS S3 는 필요 없다
    endpoint: env['S3_ENDPOINT'] || undefined,
    region: env['S3_REGION'] || 'ap-northeast-2',
    bucket,
    accessKeyId,
    secretAccessKey,
    // 끝의 슬래시는 붙는 쪽·안 붙는 쪽이 섞이므로 여기서 한 번 정리한다
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ''),
    // MinIO 는 가상 호스트 방식(bucket.host)을 기본으로 못 쓴다
    forcePathStyle: env['S3_FORCE_PATH_STYLE'] !== 'false',
  };
}

/** 설정이 없을 때. 조용히 성공한 척하지 않는다. */
class UnconfiguredStorage implements StorageAdapter {
  readonly name = 'unconfigured';

  put(): Promise<{ url: string }> {
    return Promise.reject(
      new StorageError(
        'NOT_CONFIGURED',
        '이미지 저장소가 설정되지 않았습니다. S3_BUCKET · S3_ACCESS_KEY_ID · S3_SECRET_ACCESS_KEY · S3_PUBLIC_BASE_URL 을 확인하세요.',
      ),
    );
  }

  remove(): Promise<void> {
    return Promise.reject(
      new StorageError('NOT_CONFIGURED', '이미지 저장소가 설정되지 않았습니다.'),
    );
  }
}

let cached: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  if (cached) return cached;
  const config = readS3Config();
  cached = config ? new S3Storage(config) : new UnconfiguredStorage();
  return cached;
}

/** 테스트에서 갈아 끼운다 */
export function setStorage(adapter: StorageAdapter | undefined): void {
  cached = adapter;
}

export function isStorageConfigured(): boolean {
  return readS3Config() !== null;
}
