import 'server-only';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { PutObjectInput, S3Config, StorageAdapter } from './index';
import { StorageError } from './index';

/**
 * S3 호환 스토리지 — 로컬 MinIO, 배포 시 S3 · R2.
 *
 * 읽기는 이 코드를 거치지 않는다. DB 에 저장한 공개 URL 로 브라우저가 직접
 * 가져간다. 이미지를 우리 함수로 프록시하면 요청마다 함수가 깨어나고
 * 서버리스 실행 시간을 이미지 전송에 쓰게 된다.
 */
export class S3Storage implements StorageAdapter {
  readonly name = 's3';
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(input: PutObjectInput): Promise<{ url: string }> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          // 상품 이미지는 키에 임의 토큰이 들어가 내용이 바뀌면 키도 바뀐다.
          // 그래서 오래 캐시해도 안전하다.
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch (error) {
      throw new StorageError(
        'PUT_FAILED',
        `이미지를 저장하지 못했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
      );
    }

    return { url: `${this.config.publicBaseUrl}/${input.key}` };
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
    } catch (error) {
      throw new StorageError(
        'DELETE_FAILED',
        `이미지를 지우지 못했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
      );
    }
  }
}
