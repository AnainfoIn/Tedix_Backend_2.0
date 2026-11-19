import { createHash } from 'crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Where file bytes live. Rails Active Storage keeps them in an S3 bucket (Hetzner Object Storage). */
export interface ObjectStore {
  readonly configured: boolean;
  put(key: string, body: Buffer, contentType: string, filename: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** A temporary link to view or download the file. */
  url(key: string, filename: string, contentType: string | null): Promise<string | null>;
}

const URL_TTL_SECONDS = 60 * 60;

/** Same settings and defaults as the Rails `minio` service in config/storage.yml. */
export class S3ObjectStore implements ObjectStore {
  readonly configured = true;
  private readonly client: S3Client;

  constructor(private readonly bucket: string, endpoint: string, region: string, accessKeyId: string, secretAccessKey: string) {
    this.client = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  }

  async put(key: string, body: Buffer, contentType: string, filename: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentMD5: md5Base64(body),
        ContentDisposition: `inline; filename="${asciiFilename(filename)}"`,
      }),
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  url(key: string, filename: string, contentType: string | null): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `inline; filename="${asciiFilename(filename)}"`,
        ResponseContentType: contentType ?? undefined,
      }),
      { expiresIn: URL_TTL_SECONDS },
    );
  }
}

/** Keeps files in memory. Only for tests. */
export class MemoryObjectStore implements ObjectStore {
  readonly configured = true;
  readonly files = new Map<string, Buffer>();
  async put(key: string, body: Buffer): Promise<void> {
    this.files.set(key, body);
  }
  async remove(key: string): Promise<void> {
    this.files.delete(key);
  }
  async url(key: string): Promise<string> {
    return `memory://${key}`;
  }
}

/** Used until the STORAGE_* variables are set: files can't be uploaded or shown. */
export class MissingObjectStore implements ObjectStore {
  readonly configured = false;
  async put(): Promise<void> {
    throw new Error('File storage is not configured (set the STORAGE_* environment variables)');
  }
  async remove(): Promise<void> {}
  async url(): Promise<null> {
    return null;
  }
}

export function objectStoreFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStore {
  if (env.STORAGE_SERVICE === 'memory') return new MemoryObjectStore();
  const { STORAGE_ACCESS_KEY, STORAGE_SECRET_ACCESS_KEY, STORAGE_BUCKET, STORAGE_ENDPOINT } = env;
  if (!STORAGE_ACCESS_KEY || !STORAGE_SECRET_ACCESS_KEY || !STORAGE_BUCKET || !STORAGE_ENDPOINT) {
    return new MissingObjectStore();
  }
  return new S3ObjectStore(STORAGE_BUCKET, STORAGE_ENDPOINT, env.STORAGE_REGION || 'hel1', STORAGE_ACCESS_KEY, STORAGE_SECRET_ACCESS_KEY);
}


export function md5Base64(body: Buffer): string {
  return createHash('md5').update(body).digest('base64');
}

function asciiFilename(name: string): string {
  return name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
}
