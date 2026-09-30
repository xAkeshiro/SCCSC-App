"use client";

import { FileText, Undo2, Upload, X } from "lucide-react";
import { useState } from "react";
import { cx } from "@/components/ui";
import { ACCEPT, MAX_FILE_BYTES, MAX_FILES_PER_CLAIM, MAX_UPLOAD_BYTES, detectFileType, formatBytes } from "@/lib/files";

export type PickedFile = { key: string; file: File; previewUrl: string | null };
export type ExistingFile = { id: string; fileName: string; contentType: string; sizeBytes: number };

/** Photos bigger than this are made smaller before sending (phone cameras take large ones). */
const SHRINK_OVER_BYTES = 1_500_000;
const MAX_SIDE_PX = 2000;

/**
 * Checks a chosen file and shrinks big photos to a sharp, readable JPEG (about 2000px on the long
 * side), so a photo of a bill uploads quickly on a phone connection. PDFs and iPhone HEIC photos
 * are sent as they are.
 */
async function prepare(file: File): Promise<File> {
  const type = detectFileType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!type) throw new Error(`"${file.name}" isn't a photo or PDF.`);
  if (type === "application/pdf" || type === "image/heic" || file.size <= SHRINK_OVER_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * "Your phone bill": add photos or PDFs, see what's added, and take files off. On a returned
 * claim it also lists the files already sent, which can be removed.
 */
export function BillPicker({
  picked,
  onPickedChange,
  existing = [],
  removed,
  onRemovedChange,
  error,
}: {
  picked: PickedFile[];
  onPickedChange: (files: PickedFile[]) => void;
  existing?: ExistingFile[];
  removed: Set<string>;
  onRemovedChange: (ids: Set<string>) => void;
  error?: string;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kept = existing.filter((f) => !removed.has(f.id)).length;

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setProblem(null);
    const next = [...picked];
    try {
      for (const original of Array.from(list)) {
        if (kept + next.length >= MAX_FILES_PER_CLAIM) throw new Error(`A claim can have up to ${MAX_FILES_PER_CLAIM} files.`);
        const file = await prepare(original);
        if (file.size > MAX_FILE_BYTES) throw new Error(`"${original.name}" is ${formatBytes(file.size)}. Please keep each file under ${formatBytes(MAX_FILE_BYTES)}.`);
        const total = next.reduce((n, p) => n + p.file.size, 0) + file.size;
        if (total > MAX_UPLOAD_BYTES) throw new Error(`That's more than ${formatBytes(MAX_UPLOAD_BYTES)} of files. Please add fewer or smaller files.`);
        const isImage = file.type.startsWith("image/") && file.type !== "image/heic";
        next.push({ key: `${Date.now()}-${next.length}-${file.name}`, file, previewUrl: isImage ? URL.createObjectURL(file) : null });
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That file couldn't be added.");
    } finally {
      onPickedChange(next);
      setBusy(false);
    }
  }

  function drop(key: string) {
    const gone = picked.find((p) => p.key === key);
    if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
    onPickedChange(picked.filter((p) => p.key !== key));
  }

  function toggleRemoved(id: string) {
    const next = new Set(removed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onRemovedChange(next);
  }

  const message = problem ?? error;
  return (
    <fieldset aria-describedby="bill-hint">
      <legend className="field-label">Your phone bill</legend>
      <p id="bill-hint" className="-mt-0.5 mb-3 text-sm text-ink-500">
        Take a photo of the bill, or add the PDF from your phone company. Up to {MAX_FILES_PER_CLAIM} files.
      </p>

      {existing.length > 0 || picked.length > 0 ? (
        <ul className="mb-3 grid gap-2">
          {existing.map((f) => {
            const gone = removed.has(f.id);
            return (
              <li key={f.id} className={cx("flex items-center gap-3 rounded-[var(--radius-btn)] border border-ink-100 p-2.5", gone && "bg-ink-50 text-ink-500")}>
                <FileThumb previewUrl={null} />
                <span className="min-w-0 flex-1">
                  <span className={cx("block truncate font-medium", gone && "line-through")}>{f.fileName}</span>
                  <span className="block text-sm text-ink-500">{gone ? "Will be taken off" : `Sent before · ${formatBytes(f.sizeBytes)}`}</span>
                </span>
                <button
                  type="button"
                  onClick={() => toggleRemoved(f.id)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-btn)] px-2.5 font-display text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  {gone ? <Undo2 aria-hidden className="size-4" /> : <X aria-hidden className="size-4" />}
                  {gone ? "Keep" : "Remove"}
                  <span className="sr-only"> {f.fileName}</span>
                </button>
              </li>
            );
          })}
          {picked.map((p) => (
            <li key={p.key} className="flex items-center gap-3 rounded-[var(--radius-btn)] border border-brand-600/30 bg-brand-50/40 p-2.5">
              <FileThumb previewUrl={p.previewUrl} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.file.name}</span>
                <span className="block text-sm text-ink-500">{formatBytes(p.file.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => drop(p.key)}
                className="inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-btn)] px-2.5 font-display text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                <X aria-hidden className="size-4" /> Remove<span className="sr-only"> {p.file.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <label
        className={cx(
          "flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-btn)] border-2 border-dashed px-4 py-3 font-display font-medium text-brand-700 transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-brand-600 hover:bg-brand-50",
          message ? "border-brand-600" : "border-ink-300",
        )}
      >
        <Upload aria-hidden className="size-5" />
        {busy ? "Adding…" : picked.length + kept > 0 ? "Add another photo or PDF" : "Add a photo or PDF"}
        <input
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          aria-describedby="bill-hint"
          aria-invalid={message ? true : undefined}
          disabled={busy}
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {message ? (
        <p role="alert" className="field-error">
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}

function FileThumb({ previewUrl }: { previewUrl: string | null }) {
  return previewUrl ? (
    // A local preview of the chosen photo (an object URL), so next/image doesn't apply.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={previewUrl} alt="" className="size-12 shrink-0 rounded object-cover" />
  ) : (
    <span className="grid size-12 shrink-0 place-items-center rounded bg-ink-50 text-brand-600">
      <FileText aria-hidden className="size-6" />
    </span>
  );
}
