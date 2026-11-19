import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { md5Base64, ObjectStore, objectStoreFromEnv } from './object-store';

/** Rails service name for the bucket (config/environments/*: active_storage.service = :minio). */
export const RAILS_SERVICE_NAME = 'minio';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface AttachedFile {
  id: number;
  filename: string;
  contentType: string | null;
  byteSize: number;
  url: string | null;
}

/**
 * Reads and writes Rails Active Storage records (active_storage_blobs / _attachments) so a
 * file uploaded here shows in the Rails admin and the app, and the other way round.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger('Storage');
  readonly store: ObjectStore;

  constructor(private readonly prisma: PrismaService) {
    this.store = objectStoreFromEnv();
    if (!this.store.configured) this.logger.warn('File storage is not configured: set the STORAGE_* variables to upload and show files.');
  }

  get configured(): boolean {
    return this.store.configured;
  }

  /** Files attached to one record, by attachment name (image, cheatsheet_pdf, ...). */
  async filesFor(recordType: string, recordId: bigint, names: string[]): Promise<Record<string, AttachedFile | null>> {
    const map = await this.filesForMany(recordType, [recordId], names);
    return map.get(recordId.toString()) ?? Object.fromEntries(names.map((n) => [n, null]));
  }

  async filesForMany(recordType: string, recordIds: bigint[], names: string[]) {
    const result = new Map<string, Record<string, AttachedFile | null>>();
    for (const id of recordIds) result.set(id.toString(), Object.fromEntries(names.map((n) => [n, null])));
    if (!recordIds.length) return result;
    const attachments = await this.prisma.storageAttachment.findMany({
      where: { recordType, recordId: { in: recordIds }, name: { in: names } },
      orderBy: { id: 'asc' },
    });
    const blobs = await this.prisma.storageBlob.findMany({ where: { id: { in: attachments.map((a) => a.blobId) } } });
    const blobById = new Map(blobs.map((b) => [b.id.toString(), b]));
    for (const attachment of attachments) {
      const blob = blobById.get(attachment.blobId.toString());
      if (!blob) continue;
      result.get(attachment.recordId.toString())![attachment.name] = {
        id: Number(blob.id),
        filename: blob.filename,
        contentType: blob.contentType,
        byteSize: Number(blob.byteSize),
        url: await this.store.url(blob.key, blob.filename, blob.contentType),
      };
    }
    return result;
  }

  /** Uploads the file and makes it the record's only attachment with that name (has_one_attached). */
  async attach(recordType: string, recordId: bigint, name: string, file: UploadedFile): Promise<void> {
    if (!this.store.configured) {
      throw new ServiceUnavailableException('File storage is not configured yet, so files cannot be uploaded.');
    }
    const key = railsBlobKey();
    await this.store.put(key, file.buffer, file.mimetype, file.originalname);
    const blob = await this.prisma.storageBlob.create({
      data: {
        key,
        filename: file.originalname,
        contentType: file.mimetype,
        metadata: JSON.stringify({ identified: true }),
        byteSize: BigInt(file.size),
        checksum: md5Base64(file.buffer),
        serviceName: RAILS_SERVICE_NAME,
      },
    });
    const old = await this.prisma.storageAttachment.findMany({ where: { recordType, recordId, name } });
    await this.prisma.storageAttachment.create({ data: { name, recordType, recordId, blobId: blob.id } });
    for (const attachment of old) await this.detach(attachment.id, attachment.blobId);
  }

  /** Removes every attachment of a record, e.g. when it is deleted (Rails purges them too). */
  async purgeAll(recordType: string, recordId: bigint): Promise<void> {
    const attachments = await this.prisma.storageAttachment.findMany({ where: { recordType, recordId } });
    for (const attachment of attachments) await this.detach(attachment.id, attachment.blobId);
  }

  async purge(recordType: string, recordId: bigint, name: string): Promise<void> {
    const attachments = await this.prisma.storageAttachment.findMany({ where: { recordType, recordId, name } });
    for (const attachment of attachments) await this.detach(attachment.id, attachment.blobId);
  }

  private async detach(attachmentId: bigint, blobId: bigint): Promise<void> {
    await this.prisma.storageAttachment.delete({ where: { id: attachmentId } });
    const stillUsed = await this.prisma.storageAttachment.count({ where: { blobId } });
    if (stillUsed) return;
    const blob = await this.prisma.storageBlob.delete({ where: { id: blobId } });
    await this.store.remove(blob.key).catch((error: unknown) =>
      this.logger.warn(`Could not delete file ${blob.key}: ${error instanceof Error ? error.message : error}`),
    );
  }
}

/** Same format as Rails `SecureRandom.base36(28)`: 28 lowercase letters and digits. */
export function railsBlobKey(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 28; i++) key += alphabet.charAt(randomInt(alphabet.length));
  return key;
}
