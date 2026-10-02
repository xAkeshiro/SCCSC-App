/**
 * Reads and writes simple Excel (.xlsx) workbooks without a library: an .xlsx file is a zip of
 * XML files. Enough for the Aplos files: the register import template (read, for budget codes)
 * and the register import (written, for payments). Server only (uses node:zlib).
 *
 * Reading keeps cell values only: text, numbers and true/false. Formulas give their saved result.
 */
import "server-only";

import { deflateRawSync, inflateRawSync } from "node:zlib";

export type CellValue = string | number | boolean | null;
export type ReadSheet = { name: string; rows: CellValue[][] };

const MAX_ENTRIES = 2000;
const MAX_UNZIPPED = 40 * 1024 * 1024;

export class XlsxError extends Error {}

// ---------------------------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------------------------

type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number };

function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end of central directory record is in the last 64 KB (after an optional comment).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("not a zip file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  if (count > MAX_ENTRIES) throw new XlsxError("too many files inside");
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new XlsxError("damaged zip directory");
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    entries.push({
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      size: view.getUint32(p + 24, true),
      offset: view.getUint32(p + 42, true),
      name: new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLength)),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  const files = new Map<string, Uint8Array>();
  let total = 0;
  for (const e of entries) {
    if (e.name.endsWith("/")) continue;
    if (e.compressedSize === 0xffffffff || e.offset === 0xffffffff) throw new XlsxError("zip64 isn't supported");
    if (view.getUint32(e.offset, true) !== 0x04034b50) throw new XlsxError("damaged zip entry");
    const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
    const raw = bytes.subarray(start, start + e.compressedSize);
    total += e.size;
    if (total > MAX_UNZIPPED) throw new XlsxError("file is too big unzipped");
    let data: Uint8Array;
    if (e.method === 0) data = raw;
    else if (e.method === 8) data = inflateRawSync(raw, { maxOutputLength: MAX_UNZIPPED });
    else throw new XlsxError(`unsupported compression (${e.method})`);
    files.set(e.name.replace(/^\/+/, ""), data);
  }
  return files;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  // A fixed timestamp (2026-01-01 00:00) keeps the output stable.
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = enc.encode(f.name);
    const compressed = deflateRawSync(f.data);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 8, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, compressed);
    centrals.push(central);
    offset += local.length + compressed.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// XML helpers (just enough for spreadsheet XML)
// ---------------------------------------------------------------------------------------------

function decodeXml(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const lower = e.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  });
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Characters XML 1.0 can't hold.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = decodeXml(m[2]);
  return out;
}

/** The text of every <t> in a shared string or inline string, skipping phonetic guides (<rPh>). */
function textOf(xml: string) {
  const withoutPhonetic = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let out = "";
  for (const m of withoutPhonetic.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)) out += decodeXml(m[1]);
  return out;
}

function columnIndex(ref: string) {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function columnLetters(index: number) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

/** Every sheet in the workbook, in tab order, as rows of cell values (empty cells are null). */
export function readXlsx(bytes: Uint8Array): ReadSheet[] {
  const files = unzip(bytes);
  const text = (name: string) => {
    const f = files.get(name);
    return f ? new TextDecoder().decode(f) : null;
  };
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new XlsxError("not an Excel workbook");

  const rels = new Map<string, string>();
  for (const m of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.Id && a.Target) rels.set(a.Id, a.Target.startsWith("/") ? a.Target.slice(1) : `xl/${a.Target}`);
  }

  const shared: string[] = [];
  for (const m of (text("xl/sharedStrings.xml") ?? "").matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)) {
    shared.push(m[1] ? textOf(m[1]) : "");
  }

  const sheets: ReadSheet[] = [];
  for (const m of workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*\/?>/g)) {
    const a = attrs(m[0]);
    // The relationship id, usually r:id (the prefix can differ).
    const relId = Object.entries(a).find(([k]) => k.endsWith(":id"))?.[1];
    const path = relId ? rels.get(relId) : undefined;
    const xml = path ? text(path.replace(/\/\.\//g, "/")) : null;
    if (!a.name || !xml) continue;
    sheets.push({ name: a.name, rows: readSheet(xml, shared) });
  }
  return sheets;
}

function readSheet(xml: string, shared: string[]): CellValue[][] {
  const rows: CellValue[][] = [];
  for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const rowAttrs = attrs(rowMatch[1]);
    const rowIndex = rowAttrs.r ? Number(rowAttrs.r) - 1 : rows.length;
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex > 100_000) continue;
    const row: CellValue[] = [];
    let nextColumn = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const a = attrs(cellMatch[1]);
      const column = a.r ? columnIndex(a.r) : nextColumn;
      nextColumn = column + 1;
      if (column > 500) continue;
      const inner = cellMatch[2] ?? "";
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1];
      let value: CellValue = null;
      if (a.t === "s") value = v === undefined ? null : (shared[Number(v)] ?? null);
      else if (a.t === "inlineStr") value = textOf(inner);
      else if (a.t === "str") value = v === undefined ? null : decodeXml(v);
      else if (a.t === "b") value = v === "1";
      else if (a.t === "e") value = null;
      else if (v !== undefined && v.trim() !== "") value = Number(v);
      while (row.length < column) row.push(null);
      row[column] = value;
    }
    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = row;
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------

/** A cell to write: text, a number, a date (yyyy-mm-dd, shown as mm/dd/yyyy) or money (two decimals). */
export type WriteCell = string | number | { date: string } | { money: number } | null;
export type WriteSheet = { name: string; widths?: number[]; rows: WriteCell[][]; boldFirstRow?: boolean };

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function excelDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / 86_400_000);
}

/** Builds an .xlsx file. Style ids: 0 plain, 1 date, 2 money, 3 bold. */
export function writeXlsx(sheets: WriteSheet[]): Uint8Array {
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const sharedId = (s: string) => {
    let id = stringIndex.get(s);
    if (id === undefined) {
      id = strings.length;
      strings.push(s);
      stringIndex.set(s, id);
    }
    return id;
  };

  const sheetXml = sheets.map((sheet) => {
    const cols = sheet.widths?.length
      ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
      : "";
    const body = sheet.rows
      .map((row, r) => {
        const cells = row
          .map((cell, c) => {
            if (cell === null || cell === "") return "";
            const ref = `${columnLetters(c)}${r + 1}`;
            const bold = sheet.boldFirstRow && r === 0 ? ' s="3"' : "";
            if (typeof cell === "string") return `<c r="${ref}" t="s"${bold}><v>${sharedId(cell)}</v></c>`;
            if (typeof cell === "number") return `<c r="${ref}"${bold}><v>${cell}</v></c>`;
            if ("date" in cell) return `<c r="${ref}" s="1"><v>${excelDate(cell.date)}</v></c>`;
            return `<c r="${ref}" s="2"><v>${Math.round(cell.money * 100) / 100}</v></c>`;
          })
          .join("");
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`;
  });

  const enc = new TextEncoder();
  const file = (name: string, xml: string) => ({ name, data: enc.encode(xml) });
  return zip([
    file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}</Types>`,
    ),
    file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    file(
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map((s, i) => `<sheet name="${escapeXml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
    file(
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    ),
    file(
      "xl/styles.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ),
    ...sheetXml.map((xml, i) => file(`xl/worksheets/sheet${i + 1}.xml`, xml)),
    file(
      "xl/sharedStrings.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings
        .map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`)
        .join("")}</sst>`,
    ),
  ]);
}
