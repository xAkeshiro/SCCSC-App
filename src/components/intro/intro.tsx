"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import styles from "./intro.module.css";
import { CENTER, SUBTITLE, THE, XIN_STROKES } from "./logo-paths";
import { SEEN_KEY } from "./script";

/**
 * The opening animation: the SCCSC logo on white. The red seal stamps in, 心 is written stroke by
 * stroke, then "thecenter" and the name follow, and the screen fades into the app.
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
        <g fill="#333" fillRule="evenodd">
          {THE.map((d, i) => (
            <path key={i} d={d} className={styles.the} style={order(i)} />
          ))}
        </g>
        <g fill="#D0112B" fillRule="evenodd">
          {CENTER.map((d, i) => (
            <path key={i} d={d} className={styles.center} style={order(i)} />
          ))}
        </g>
        <g fill="#333" fillRule="evenodd">
          {SUBTITLE.map((d, i) => (
            <path key={i} d={d} className={styles.name} style={order(i)} />
          ))}
        </g>
      </svg>
    </div>
  );
}

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
