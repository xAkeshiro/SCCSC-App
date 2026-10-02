import type { TripRecord } from "@/lib/data/trips";
import { formatDay } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { formatMonth } from "@/lib/requests/phone";
import { siteLabel } from "@/lib/sites";

/** "September 2026", or "August–September 2026" when the trips span months. */
export function tripMonths(dates: string[]) {
  if (dates.length === 0) return "—";
  const months = [...new Set(dates.map((d) => `${d.slice(0, 7)}-01`))].sort();
  const first = months[0];
  const last = months[months.length - 1];
  if (first === last) return formatMonth(first);
  return first.slice(0, 4) === last.slice(0, 4)
    ? `${formatMonth(first, { withYear: false })}–${formatMonth(last)}`
    : `${formatMonth(first)}–${formatMonth(last)}`;
}

/** "$0.76", "$0.725". */
const perMile = (rateCents: string | number) =>
  `$${(Number(rateCents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;

/**
 * The trips laid out like the paper Mileage Claim Voucher: date, school or site, purpose, origin,
 * destination, indirect miles, direct miles and parking, then the subtotals, the cost per mile and
 * the total.
 */
export function MileageVoucher({ trips }: { trips: TripRecord[] }) {
  const miles = (t: TripRecord) => Number(t.miles);
  const sum = (list: TripRecord[], f: (t: TripRecord) => number) => list.reduce((n, t) => n + f(t), 0);
  const direct = trips.filter((t) => t.costType === "direct");
  const indirect = trips.filter((t) => t.costType !== "direct");
  const mileageCents = (t: TripRecord) => t.amountCents - t.parkingCents;
  const rates = [...new Set(trips.map((t) => Number(t.rateCents)))];
  const parking = sum(trips, (t) => t.parkingCents);
  const cell = "py-1.5 pr-2";
  const num = `${cell} text-right tabular-nums`;

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-ink align-bottom text-[12px]">
          <th scope="col" className={`${cell} font-semibold`}>Date</th>
          <th scope="col" className={`${cell} font-semibold`}>School or site</th>
          <th scope="col" className={`${cell} font-semibold`}>Purpose</th>
          <th scope="col" className={`${cell} font-semibold`}>Origin</th>
          <th scope="col" className={`${cell} font-semibold`}>Destination</th>
          <th scope="col" className={`${num} font-semibold`}>Indirect miles</th>
          <th scope="col" className={`${num} font-semibold`}>Direct miles</th>
          <th scope="col" className="py-1.5 text-right font-semibold">Parking fee</th>
        </tr>
      </thead>
      <tbody>
        {trips.map((t) => (
          <tr key={t.id} className="border-b border-ink-100 align-top">
            <td className={`${cell} whitespace-nowrap`}>{formatDay(t.date, { withYear: true, weekday: false })}</td>
            <td className={cell}>{siteLabel(t.siteCode ? { code: t.siteCode, name: t.siteName ?? "" } : null)}</td>
            <td className={cell}>
              {t.purpose}
              {t.overrideReason ? <div className="text-[11px] text-ink-500">Miles changed: {t.overrideReason}</div> : null}
            </td>
            <td className={cell}>{t.fromLabel}</td>
            <td className={cell}>
              {[...t.stops.map((s) => s.label), t.toLabel].join(", then ")}
              {t.roundTrip ? <div className="text-[11px] text-ink-500">Round trip</div> : null}
            </td>
            <td className={num}>{t.costType !== "direct" ? miles(t).toFixed(1) : ""}</td>
            <td className={num}>{t.costType === "direct" ? miles(t).toFixed(1) : ""}</td>
            <td className="py-1.5 text-right tabular-nums">{t.parkingCents ? formatCents(t.parkingCents) : ""}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="tabular-nums">
        <tr className="border-t-2 border-ink">
          <td className="py-1.5 pr-2 text-right font-semibold" colSpan={5}>
            Subtotal
          </td>
          <td className={num}>{sum(indirect, miles).toFixed(1)}</td>
          <td className={num}>{sum(direct, miles).toFixed(1)}</td>
          <td className="py-1.5 text-right">{formatCents(parking)}</td>
        </tr>
        <tr>
          <td className="py-1.5 pr-2 text-right" colSpan={5}>
            {rates.length === 1 ? `Cost per mile × ${perMile(rates[0])}` : `Cost per mile (${rates.map(perMile).join(" or ")}, by the rate on each trip's date)`}
          </td>
          <td className={num}>{formatCents(sum(indirect, mileageCents))}</td>
          <td className={num}>{formatCents(sum(direct, mileageCents))}</td>
          <td />
        </tr>
        <tr className="border-t border-ink font-semibold">
          <td className="py-2 pr-2 text-right" colSpan={5}>
            Total ({trips.length} {trips.length === 1 ? "trip" : "trips"})
          </td>
          <td className="py-2 text-right font-display text-base" colSpan={3}>
            {formatCents(sum(trips, (t) => t.amountCents))}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
