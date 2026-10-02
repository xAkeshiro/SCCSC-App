"use client";

/** Saves text as a file in the browser (with a byte-order mark so Excel reads accents correctly). */
export function saveCsv(filename: string, csv: string) {
  save(filename, new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
}

/** Saves a file the server sent as base64, like an Excel file. */
export function saveBase64(filename: string, base64: string, contentType: string) {
  save(filename, new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: contentType }));
}

function save(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
