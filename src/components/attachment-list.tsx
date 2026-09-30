"use client";

import { Download, Eye, EyeOff, FileImage, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchAttachment } from "@/app/(app)/claims/actions";
import { FILE_TYPES, formatBytes, type FileType } from "@/lib/files";

type FileInfo = { id: string; fileName: string; contentType: FileType; sizeBytes: number };
type Loaded = { url: string; type: string; name: string };

/**
 * The files sent with a claim, such as the phone bill. "View" shows a photo or PDF on the page;
 * "Download" saves it. Files load through a server action on request (RLS checks the viewer).
 */
export function AttachmentList({ files }: { files: FileInfo[] }) {
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function load(file: FileInfo): Promise<Loaded | null> {
    if (loaded[file.id]) return loaded[file.id];
    setBusy(file.id);
    setError(null);
    try {
      const res = await fetchAttachment(file.id);
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: res.contentType }));
      urls.current.push(url);
      const item = { url, type: res.contentType, name: res.fileName };
      setLoaded((prev) => ({ ...prev, [file.id]: item }));
      return item;
    } catch {
      setError("That file couldn't be opened. Please try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function view(file: FileInfo) {
    if (open === file.id) return setOpen(null);
    if (await load(file)) setOpen(file.id);
  }

  async function download(file: FileInfo) {
    const item = await load(file);
    if (!item) return;
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="field-error mb-2">
          {error}
        </p>
      ) : null}
      <ul className="card divide-y divide-ink-100">
        {files.map((f) => {
          const Icon = f.contentType === "application/pdf" ? FileText : FileImage;
          const item = loaded[f.id];
          const canShow = f.contentType !== "image/heic";
          return (
            <li key={f.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded bg-brand-50 text-brand-600">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="min-w-[9rem] flex-1">
                  <span className="block font-medium break-all">{f.fileName}</span>
                  <span className="block text-sm text-ink-500">
                    {FILE_TYPES[f.contentType].label} · {formatBytes(f.sizeBytes)}
                  </span>
                </span>
                <span className="flex gap-1">
                  {canShow ? (
                    <button
                      type="button"
                      onClick={() => void view(f)}
                      aria-expanded={open === f.id}
                      disabled={busy === f.id}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-btn)] px-3 font-display text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                    >
                      {open === f.id ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                      {busy === f.id ? "Opening…" : open === f.id ? "Hide" : "View"}
                      <span className="sr-only"> {f.fileName}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void download(f)}
                    disabled={busy === f.id}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-btn)] px-3 font-display text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                  >
                    <Download aria-hidden className="size-4" /> Download<span className="sr-only"> {f.fileName}</span>
                  </button>
                </span>
              </div>
              {open === f.id && item ? (
                <div className="mt-3">
                  {item.type === "application/pdf" ? (
                    <>
                      <iframe src={item.url} title={f.fileName} className="mb-2 hidden h-[36rem] w-full rounded border border-ink-100 sm:block" />
                      {/* Some browsers (and most phones) don't show a PDF inside the page. */}
                      <a href={item.url} target="_blank" rel="noopener" className="font-display font-medium text-brand-600 underline">
                        Open the PDF in a new tab
                      </a>
                    </>
                  ) : (
                    // A photo of the bill from the claim (an object URL), so next/image doesn't apply.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={`Phone bill: ${f.fileName}`} className="max-h-[36rem] w-auto rounded border border-ink-100" />
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
