"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import styles from "./intro.module.css";
import { XIN_STROKES } from "./logo-paths";
import { SEEN_KEY } from "./script";

/**
 * The opening animation: the SCCSC logo on white. The red seal stamps in, large, in the middle
 * of the screen, 心 is written stroke by stroke, then the seal glides to its place on the left as
 * "thecenter" and the name come out beside it, and the screen fades into the app.
 *
 * It plays once when the app is opened in a tab (not on each page), is skipped with a tap or
 * Escape, and never plays for people who ask their device for less motion. The script in the root
 * layout (INTRO_SCRIPT) marks it done before the page paints, so it doesn't flash on a reload.
 */
export function Intro() {
  const done = useSyncExternalStore(subscribe, isDone, () => false);
  // Skipping fades the screen out quickly instead of waiting for the end.
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (done) return;
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Storage blocked: it just plays again next time.
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSkipped(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done]);

  if (done) return null;
  return (
    <div
      aria-hidden="true"
      data-intro-screen=""
      className={skipped ? `${styles.screen} ${styles.skipped}` : styles.screen}
      onPointerDown={() => setSkipped(true)}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <svg viewBox="0 0 950 254" className={styles.logo} focusable="false">
        <defs>
          {XIN_STROKES.map((s, i) => (
            <mask key={s.name} id={`intro-brush-${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="91" height="91">
              <path d={s.brush} pathLength={1} strokeWidth={s.width} className={styles.brush} />
            </mask>
          ))}
        </defs>
        {/* "thecenter" in EB Garamond, one letter at a time so they can move on their own. */}
        {THE.map(([letter, x], i) => (
          <text key={i} x={x} y="126" className={styles.the} style={order(i)}>
            {letter}
          </text>
        ))}
        {CENTER.map(([letter, x], i) => (
          <text key={i} x={x} y="126" className={styles.center} style={order(i)}>
            {letter}
          </text>
        ))}
        {/* The organization's name as text (the app's Instrument Sans), in the logo's two lines. */}
        {NAME_LINES.map((line, i) => (
          <text key={line} x="223" y={190 + i * 52} className={styles.name} style={order(i)}>
            {line}
          </text>
        ))}
        {/* The seal starts large in the middle, then glides to its place in the logo. It's drawn
            last, so the words come out from behind it. */}
        <g className={styles.travel}>
          <g transform="translate(2 1) scale(1.9835)">
            <g className={styles.seal}>
              <rect width="91" height="91" fill="#D0112B" />
              <g fill="#fff">
                {XIN_STROKES.map((s, i) => (
                  <path key={s.name} d={s.d} mask={`url(#intro-brush-${i})`} />
                ))}
                {/* The finished character, in case a browser can't animate the brush masks. */}
                <path d={XIN_STROKES.map((s) => s.d).join("")} className={styles.inked} />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

/*
 * Where each letter of "the" (116 units) and "center" (251.3 units, a little tighter than the
 * font's own spacing) starts on the 126 baseline, with EB Garamond's kerning. They put the words
 * where the original logo has them: "the" from 225, "center" from 376 to the right edge at 947.
 */
const THE: [string, number][] = [
  ["t", 221.4],
  ["h", 257.8],
  ["e", 317.6],
];
const CENTER: [string, number][] = [
  ["c", 368.2],
  ["e", 463],
  ["n", 558.5],
  ["t", 688.6],
  ["e", 765],
  ["r", 860.5],
];

const NAME_LINES = ["sacramento chinese", "community service center"];

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isDone() {
  return document.documentElement.dataset.intro === "done";
}

function finish() {
  document.documentElement.dataset.intro = "done";
  listeners.forEach((l) => l());
}

/** A letter's place in its word, for the stagger in intro.module.css. */
const order = (i: number) => ({ "--i": i }) as CSSProperties;
