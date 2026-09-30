import { describe, expect, it } from "vitest";
import { cleanFileName, detectFileType, formatBytes } from "@/lib/files";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)).concat(Array(16).fill(0)));

describe("bill files", () => {
  it("works out the type from the file's contents, not its name", () => {
    expect(detectFileType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectFileType(bytes([0x89], "PNG\r\n"))).toBe("image/png");
    expect(detectFileType(bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe("image/webp");
    expect(detectFileType(bytes("%PDF-1.7"))).toBe("application/pdf");
    expect(detectFileType(bytes([0, 0, 0, 24], "ftypheic"))).toBe("image/heic");
  });

  it("refuses anything that isn't a photo or PDF", () => {
    expect(detectFileType(bytes("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
    expect(detectFileType(bytes("<!doctype html>"))).toBeNull();
    expect(detectFileType(bytes("GIF89a"))).toBeNull();
    expect(detectFileType(new Uint8Array(4))).toBeNull();
  });

  it("keeps names tidy, with the right extension", () => {
    expect(cleanFileName("C:\\fakepath\\Verizon bill.PDF", "application/pdf")).toBe("Verizon bill.pdf");
    expect(cleanFileName("IMG_0042.HEIC", "image/jpeg")).toBe("IMG_0042.jpg");
    expect(cleanFileName("", "image/png")).toBe("phone-bill.png");
    expect(cleanFileName("a<b>c.jpg", "image/jpeg")).toBe("abc.jpg");
  });

  it("shows sizes in plain units", () => {
    expect(formatBytes(900)).toBe("900 bytes");
    expect(formatBytes(250 * 1024)).toBe("250 KB");
    expect(formatBytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
  });
});
