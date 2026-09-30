/**
 * Files people send with a claim (a photo or PDF of a phone bill). Used in the browser (to check
 * and shrink files before upload) and on the server (to check them again).
 *
 * The type is worked out from the file's first bytes, never from its name or what the browser
 * says, and only photos and PDFs are accepted (no SVG or HTML, which could run scripts).
 */

export const FILE_TYPES = {
  "image/jpeg": { label: "Photo", ext: "jpg" },
  "image/png": { label: "Image", ext: "png" },
  "image/webp": { label: "Image", ext: "webp" },
  "image/heic": { label: "iPhone photo", ext: "heic" },
  "application/pdf": { label: "PDF", ext: "pdf" },
} as const;

export type FileType = keyof typeof FILE_TYPES;

/** Largest single file. Photos are shrunk in the browser first, so they rarely come close. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** Largest upload in one go (Vercel caps a request at 4.5 MB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_FILES_PER_CLAIM = 5;
/** What the file picker offers. */
export const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,.heic,application/pdf";

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** The file's real type, from its first bytes, or null if it isn't a photo or PDF we accept. */
export function detectFileType(bytes: Uint8Array): FileType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  if (ascii(bytes, 4, 4) === "ftyp" && ["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(ascii(bytes, 8, 4))) {
    return "image/heic";
  }
  return null;
}

/** A tidy name to store and show: no folders, not too long, with the right extension. */
export function cleanFileName(name: string, type: FileType): string {
  const ext = FILE_TYPES[type].ext;
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .trim()
    .slice(0, 80);
  return `${base || "phone-bill"}.${ext}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
