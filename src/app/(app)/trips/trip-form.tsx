"use client";

import { Home, MapPin, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useFormAction } from "@/components/use-form-action";
import { Button, Field, Notice, buttonClass, cx, describedBy } from "@/components/ui";
import { demoEstimateMiles } from "@/lib/distance";
import { SiteSelect } from "@/components/site-select";
import { dollarsToCents, formatCents, formatRate, mileageAmountCents, normalizeMiles } from "@/lib/money";
import type { TripErrors } from "@/lib/requests/mileage";
import type { TripFormOptions } from "@/lib/requests/mileage";
import type { SaveTripState } from "./actions";

type PointState = { place: string; address: string };

/** In the words of the paper mileage claim form. */
const COST_TYPES = [
  { value: "direct", label: "Direct", hint: "Directly involved with students, like buying materials or going to a tournament." },
  { value: "indirect", label: "Indirect", hint: "Meetings, trainings, or picking up and dropping off materials at the Ping office." },
] as const;
type StopState = PointState & { key: number };

export type TripFormValues = {
  date: string;
  from: PointState;
  stops: PointState[];
  to: PointState;
  roundTrip: boolean;
  miles: string | null;
  overrideReason: string;
  purpose: string;
  siteId: string;
  costType: "direct" | "indirect" | "";
  /** Dollars, as typed ("" for none). */
  parking: string;
  notes: string;
};

type Props = {
  options: TripFormOptions;
  initial: TripFormValues;
  action: (prev: SaveTripState, formData: FormData) => Promise<SaveTripState>;
  submitLabel: string;
  cancelHref: string;
  allowAnother?: boolean;
};

export function TripForm({ options, initial, action, submitLabel, cancelHref, allowAnother = false }: Props) {
  const [state, onSubmit, pending] = useFormAction<SaveTripState>(action, {});
  const errors: TripErrors = state.errors ?? {};

  const [date, setDate] = useState(initial.date);
  const [from, setFrom] = useState<PointState>(initial.from);
  const [to, setTo] = useState<PointState>(initial.to);
  const [stops, setStops] = useState<StopState[]>(initial.stops.map((s, i) => ({ ...s, key: i })));
  const [roundTrip, setRoundTrip] = useState(initial.roundTrip);
  const [milesInput, setMilesInput] = useState(initial.miles ?? "");
  const [milesTouched, setMilesTouched] = useState(initial.miles !== null);
  const [overrideReason, setOverrideReason] = useState(initial.overrideReason);
  const [purpose, setPurpose] = useState(initial.purpose);
  const [siteId, setSiteId] = useState(initial.siteId);
  const [costType, setCostType] = useState(initial.costType);
  const [parking, setParking] = useState(initial.parking);
  const [notes, setNotes] = useState(initial.notes);

  const placeById = useMemo(() => new Map(options.places.map((p) => [p.id, p])), [options.places]);
  const points = [from, ...stops, to];
  const pointCoords = points.map((p) => {
    const place = p.place && p.place !== "other" ? placeById.get(p.place) : undefined;
    return { lat: place?.lat ?? null, lng: place?.lng ?? null, chosen: Boolean(place || (p.place === "other" && p.address.trim())) };
  });
  const allChosen = pointCoords.every((p) => p.chosen);
  const estimate = allChosen ? demoEstimateMiles(pointCoords, roundTrip) : null;
  const estimateText = estimate === null ? null : normalizeMiles(estimate);
  const miles = milesTouched ? milesInput : (estimateText ?? milesInput);
  const normalized = normalizeMiles(miles);
  const changedFromEstimate = Boolean(estimateText && normalized && normalized !== estimateText);
  const involvesHome = points.some((p) => p.place && placeById.get(p.place)?.isHome);

  const rate = options.rates.find((r) => r.effectiveFrom <= date) ?? null;
  const mileageCents = normalized && rate && Number(normalized) > 0 ? mileageAmountCents(normalized, rate.rateCents) : null;
  const parkingCents = dollarsToCents(parking) ?? 0;
  const amount = mileageCents === null ? (parkingCents > 0 ? parkingCents : null) : mileageCents + parkingCents;

  const addStop = () => setStops((s) => [...s, { key: Date.now(), place: "", address: "" }]);

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {errors.form ? <Notice tone="error">{errors.form}</Notice> : null}
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}

      <section className="card space-y-5 p-5 sm:p-6">
        <Field label="Date" htmlFor="date" error={errors.date}>
          <input
            id="date"
            name="date"
            type="date"
            className="field sm:max-w-56"
            value={date}
            max={options.today}
            onChange={(e) => setDate(e.target.value)}
            required
            {...describedBy("date", { error: errors.date })}
          />
        </Field>

        <PlacePicker
          name="from"
          label="Where did you start?"
          value={from}
          onChange={setFrom}
          options={options}
          error={errors.from}
        />

        {stops.map((stop, i) => (
          <div key={stop.key} className="flex items-end gap-2">
            <PlacePicker
              className="flex-1"
              name="stop"
              label={`Stop ${i + 1}`}
              value={stop}
              onChange={(v) => setStops((all) => all.map((s) => (s.key === stop.key ? { ...s, ...v } : s)))}
              options={options}
              error={errors.stops && !(stop.place && stop.place !== "other") && !stop.address.trim() ? errors.stops : undefined}
            />
            <button
              type="button"
              onClick={() => setStops((all) => all.filter((s) => s.key !== stop.key))}
              className="mb-0.5 grid size-11 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-ink-300 text-ink-700 hover:border-brand-600 hover:text-brand-700"
            >
              <Trash2 aria-hidden className="size-5" />
              <span className="sr-only">Remove stop {i + 1}</span>
            </button>
          </div>
        ))}
        {stops.length < 8 ? (
          <button type="button" onClick={addStop} className={buttonClass("ghost", "sm", "-ml-2")}>
            <Plus aria-hidden className="size-4" /> Add a stop on the way
          </button>
        ) : null}

        <PlacePicker name="to" label="Where did you go?" value={to} onChange={setTo} options={options} error={errors.to} />

        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-[var(--radius-btn)] border border-ink-100 p-3 hover:bg-surface">
          <input
            type="checkbox"
            name="round_trip"
            checked={roundTrip}
            onChange={(e) => setRoundTrip(e.target.checked)}
            className="mt-0.5 size-5"
          />
          <span>
            <span className="block font-semibold">Round trip</span>
            <span className="block text-sm text-ink-500">Adds the drive back to where you started.</span>
          </span>
        </label>

        {involvesHome && options.homeTripRule !== "allow" ? (
          <Notice tone={options.homeTripRule === "block" ? "error" : "warning"}>
            <span className="flex gap-2">
              <Home aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {options.homeTripRule === "block"
                  ? "Trips that start or end at home can't be logged. Please start from your usual workplace."
                  : "This trip starts or ends at home, so your coordinator will see a flag. Your normal commute isn't reimbursable. Add a note if this was different."}
              </span>
            </span>
          </Notice>
        ) : null}
      </section>

      <section className="card space-y-5 p-5 sm:p-6">
        <Field
          label="Miles"
          htmlFor="miles"
          error={errors.miles}
          hint={
            estimateText
              ? `Estimated ${estimateText} mi from your saved places (demo estimate).`
              : "Enter the miles from your odometer or map app."
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="miles"
              name="miles"
              inputMode="decimal"
              className="field max-w-36 text-lg"
              value={miles}
              onChange={(e) => {
                setMilesTouched(true);
                setMilesInput(e.target.value.replace(/[^\d.]/g, ""));
              }}
              placeholder="0.0"
              {...describedBy("miles", { hint: true, error: errors.miles })}
            />
            {milesTouched && estimateText && changedFromEstimate ? (
              <button
                type="button"
                className={buttonClass("ghost", "sm")}
                onClick={() => {
                  setMilesTouched(false);
                  setMilesInput("");
                  setOverrideReason("");
                }}
              >
                Use the estimate ({estimateText})
              </button>
            ) : null}
          </div>
        </Field>

        {changedFromEstimate ? (
          <Field
            label="Why is it different from the estimate?"
            htmlFor="override_reason"
            error={errors.overrideReason}
            hint="For example: a detour for road work, or parking a few blocks away."
          >
            <input
              id="override_reason"
              name="override_reason"
              className="field"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              {...describedBy("override_reason", { hint: true, error: errors.overrideReason })}
            />
          </Field>
        ) : null}

        <Field
          label="Parking"
          htmlFor="parking"
          optional
          error={errors.parking}
          hint="What you paid to park on this trip, if anything."
        >
          <div className="relative max-w-36">
            <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500">
              $
            </span>
            <input
              id="parking"
              name="parking"
              inputMode="decimal"
              className="field pl-7"
              value={parking}
              onChange={(e) => setParking(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0.00"
              {...describedBy("parking", { hint: true, error: errors.parking })}
            />
          </div>
        </Field>
      </section>

      <section className="card space-y-5 p-5 sm:p-6">
        <Field label="What was the trip for?" htmlFor="purpose" error={errors.purpose} hint="For example: Parent workshop at Cedar Grove">
          <input
            id="purpose"
            name="purpose"
            className="field"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            required
            {...describedBy("purpose", { hint: true, error: errors.purpose })}
          />
        </Field>

        <fieldset aria-describedby={errors.costType ? "cost_type-error" : undefined}>
          <legend className="field-label">Direct or indirect?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {COST_TYPES.map((c) => (
              <label
                key={c.value}
                className={cx(
                  "flex cursor-pointer items-start gap-3 rounded-[var(--radius-btn)] border p-3 transition-colors",
                  costType === c.value ? "border-brand-600 bg-brand-50/50" : "border-ink-100 hover:bg-surface",
                )}
              >
                <input
                  type="radio"
                  name="cost_type"
                  value={c.value}
                  checked={costType === c.value}
                  onChange={() => setCostType(c.value)}
                  className="mt-0.5 size-5 shrink-0"
                />
                <span>
                  <span className="block font-semibold">{c.label}</span>
                  <span className="block text-sm text-ink-500">{c.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.costType ? (
            <p id="cost_type-error" className="field-error">
              {errors.costType}
            </p>
          ) : null}
        </fieldset>

        <Field
          label="School or site"
          htmlFor="site_id"
          error={errors.siteId}
          optional={!options.requireSite}
          hint="The school or site this trip was for. Your usual one is filled in."
        >
          <SiteSelect
            id="site_id"
            name="site_id"
            groups={options.siteGroups}
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            {...describedBy("site_id", { hint: true, error: errors.siteId })}
          />
        </Field>

        <Field label="Notes" htmlFor="notes" optional hint="Anything your coordinator should know.">
          <textarea
            id="notes"
            name="notes"
            rows={2}
            className="field"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            {...describedBy("notes", { hint: true })}
          />
        </Field>
      </section>

      {/* Running total, like the bottom line of the spreadsheet. Stays in view above the phone tab bar. */}
      <div className="card sticky bottom-[5.5rem] z-10 flex items-center justify-between gap-4 px-4 py-3 shadow-[var(--shadow-card)] lg:bottom-4 sm:px-5">
        <div aria-live="polite" className="min-w-0">
          <p className="truncate text-sm text-ink-500">
            {normalized && Number(normalized) > 0 ? `${normalized} mi` : "Miles"}
            {rate ? ` × ${formatRate(rate.rateCents)}` : ""}
            {parkingCents > 0 ? ` + ${formatCents(parkingCents)} parking` : ""}
          </p>
          <p className="font-display text-2xl font-semibold text-brand-600">{amount !== null ? formatCents(amount) : "$0.00"}</p>
        </div>
        <Button type="submit" name="intent" value="save" disabled={pending} className="shrink-0">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {allowAnother ? (
          <Button type="submit" name="intent" value="another" variant="secondary" disabled={pending}>
            Save and add another
          </Button>
        ) : null}
        <Link href={cancelHref} className={buttonClass("secondary")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

function PlacePicker({
  name,
  label,
  value,
  onChange,
  options,
  error,
  className,
}: {
  name: "from" | "to" | "stop";
  label: string;
  value: PointState;
  onChange: (v: PointState) => void;
  options: TripFormOptions;
  error?: string;
  className?: string;
}) {
  const id = useId();
  const shared = options.places.filter((p) => p.shared);
  const mine = options.places.filter((p) => !p.shared);
  return (
    <div className={cx("space-y-2", className)}>
      <Field label={label} htmlFor={`${id}-place`} error={value.place === "other" ? undefined : error}>
        <div className="relative">
          <MapPin aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-500" />
          <select
            id={`${id}-place`}
            name={`${name}_place`}
            className="field pl-10"
            value={value.place}
            onChange={(e) => onChange({ place: e.target.value, address: e.target.value === "other" ? value.address : "" })}
            {...describedBy(`${id}-place`, { error: value.place === "other" ? undefined : error })}
          >
            <option value="">Choose a place…</option>
            <optgroup label="Saved places">
              {shared.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            {mine.length ? (
              <optgroup label="My places">
                {mine.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <option value="other">Another address…</option>
          </select>
        </div>
      </Field>
      {value.place === "other" ? (
        <Field label="Address" htmlFor={`${id}-address`} error={error}>
          <input
            id={`${id}-address`}
            name={`${name}_address`}
            className="field"
            autoComplete="street-address"
            placeholder="Street, city"
            value={value.address}
            onChange={(e) => onChange({ place: "other", address: e.target.value })}
            {...describedBy(`${id}-address`, { error })}
          />
        </Field>
      ) : (
        // Keep stop fields aligned with their places when the form is posted.
        name === "stop" ? <input type="hidden" name="stop_address" value="" /> : null
      )}
    </div>
  );
}
