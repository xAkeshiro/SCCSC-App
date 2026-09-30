/**
 * Files sent with a claim. Runs as the signed-in user, so RLS decides who can see and add them:
 * the same people who can see the claim. See drizzle/0006_attachment_security.sql.
 */
import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { requestAttachments } from "@/db/schema";
import { withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import { UserError } from "@/lib/errors";
import {
  FILE_TYPES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_CLAIM,
  MAX_UPLOAD_BYTES,
  cleanFileName,
  detectFileType,
  formatBytes,
  type FileType,
} from "@/lib/files";

const isUuid = (id: string) => z.string().uuid().safeParse(id).success;

export type AttachmentMeta = {
  id: string;
  requestId: string;
  fileName: string;
  contentType: FileType;
  sizeBytes: number;
  createdAt: Date;
};

/** A file as it arrived: its name and bytes. */
export type IncomingFile = { name: string; bytes: Uint8Array };
/** A file that passed the checks, with its real type and a clean name. */
export type CheckedFile = { name: string; type: FileType; bytes: Uint8Array };

/** Checks files before saving: photos or PDFs only, not too big, not too many. */
export function checkFiles(files: IncomingFile[], alreadyAttached = 0): CheckedFile[] {
  const list = files.filter((f) => f.bytes.length > 0);
  if (alreadyAttached + list.length > MAX_FILES_PER_CLAIM) {
    throw new UserError(`A claim can have up to ${MAX_FILES_PER_CLAIM} files.`);
  }
  const total = list.reduce((n, f) => n + f.bytes.length, 0);
  if (total > MAX_UPLOAD_BYTES) {
    throw new UserError(`Those files add up to ${formatBytes(total)}. Please keep them under ${formatBytes(MAX_UPLOAD_BYTES)} in all.`);
  }
  return list.map((f) => {
    const type = detectFileType(f.bytes);
    if (!type) throw new UserError(`"${f.name.slice(0, 80)}" isn't a photo or PDF. Please add a photo (JPG or PNG) or a PDF of the bill.`);
    if (f.bytes.length > MAX_FILE_BYTES) {
      throw new UserError(`"${f.name.slice(0, 80)}" is ${formatBytes(f.bytes.length)}. Please keep each file under ${formatBytes(MAX_FILE_BYTES)}.`);
    }
    return { name: cleanFileName(f.name, type), type, bytes: f.bytes };
  });
}

export async function saveAttachments(tx: Tx, staffId: string, requestId: string, files: CheckedFile[]) {
  if (files.length === 0) return;
  await tx.insert(requestAttachments).values(
    files.map((f) => ({ requestId, ownerId: staffId, fileName: f.name, contentType: f.type, sizeBytes: f.bytes.length, data: f.bytes })),
  );
}

/** The files on these claims (names and sizes, not the bytes). */
export async function attachmentsFor(tx: Tx, requestIds: string[]): Promise<AttachmentMeta[]> {
  if (requestIds.length === 0) return [];
  const list = await tx
    .select({
      id: requestAttachments.id,
      requestId: requestAttachments.requestId,
      fileName: requestAttachments.fileName,
      contentType: requestAttachments.contentType,
      sizeBytes: requestAttachments.sizeBytes,
      createdAt: requestAttachments.createdAt,
    })
    .from(requestAttachments)
    .where(inArray(requestAttachments.requestId, requestIds))
    .orderBy(asc(requestAttachments.createdAt), asc(requestAttachments.fileName));
  return list.map((a) => ({ ...a, contentType: a.contentType as FileType }));
}

export async function countAttachments(tx: Tx, requestId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(requestAttachments)
    .where(eq(requestAttachments.requestId, requestId));
  return row?.n ?? 0;
}

/** Removes files from a draft or returned claim (RLS and a trigger refuse anything else). */
export async function removeAttachments(tx: Tx, requestId: string, ids: string[]) {
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return;
  await tx.delete(requestAttachments).where(and(eq(requestAttachments.requestId, requestId), inArray(requestAttachments.id, valid)));
}

/** One file with its bytes, if the viewer can see the claim it's on. */
export async function attachmentFile(viewer: Viewer, id: string) {
  if (!isUuid(id)) return null;
  return withUser(viewer.userId, async (tx) => {
    const [file] = await tx
      .select({ fileName: requestAttachments.fileName, contentType: requestAttachments.contentType, data: requestAttachments.data })
      .from(requestAttachments)
      .where(eq(requestAttachments.id, id))
      .limit(1);
    return file ? { ...file, contentType: file.contentType as FileType, label: FILE_TYPES[file.contentType as FileType].label } : null;
  });
}
