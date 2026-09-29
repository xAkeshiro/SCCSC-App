import Image from "next/image";
import Link from "next/link";
import { cx } from "./ui";

/**
 * The 心 mark with a lowercase wordmark, echoing the "thecenter" logo: a small charcoal word
 * next to a larger red one, in a serif. "mileage tracker" for this first module.
 */
export function Logo({ href = "/", inverted = false, compact = false }: { href?: string; inverted?: boolean; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-flex shrink-0 items-center gap-2.5" aria-label="Mileage tracker home">
      <Image src="/brand/xin-mark-square.svg" alt="" width={40} height={40} priority className="size-9 sm:size-10" />
      <Wordmark inverted={inverted} compact={compact} />
    </Link>
  );
}

export function Wordmark({ inverted = false, compact = false }: { inverted?: boolean; compact?: boolean }) {
  return (
    <span className="flex flex-col leading-none">
      <span className="font-serif whitespace-nowrap">
        <span className={cx("text-lg sm:text-xl", inverted ? "text-white" : "text-ink-700")}>mileage</span>
        <span className={cx("ml-1 text-[1.65rem] sm:text-[1.9rem]", inverted ? "text-white" : "text-brand-600")}>tracker</span>
      </span>
      {compact ? null : (
        <span className={cx("mt-0.5 hidden font-serif text-[0.68rem] sm:block", inverted ? "text-white/80" : "text-ink-700")}>
          sacramento chinese community service center
        </span>
      )}
    </span>
  );
}
