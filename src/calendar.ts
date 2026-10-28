import { Temporal } from "@js-temporal/polyfill";
import type { Attendance, Occurrence, Plan } from "./types";
export const zone = "Europe/Amsterdam";
export const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localInput = (iso: string) =>
  Temporal.Instant.from(iso)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
// PostgreSQL resolves repeated wall times to the later (standard-time) instant.
export const toInstant = (local: string) =>
  Temporal.PlainDateTime.from(local)
    .toZonedDateTime(zone, { disambiguation: "later" })
    .toInstant()
    .toString();
export const shiftDate = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();
// Include today and the same calendar date next month (clamped at month end).
export function upcomingRange(now: Date) {
  const first = Temporal.Instant.fromEpochMilliseconds(+now)
    .toZonedDateTimeISO(zone)
    .toPlainDate();
  const last = first.add({ months: 1 });
  return {
    first: first.toString(),
    last: last.toString(),
    start: new Date(toInstant(first.toString() + "T00:00")),
    end: new Date(toInstant(last.add({ days: 1 }).toString() + "T00:00")),
  };
}
// Date ranges shown to people include the last day. iCalendar ends are exclusive.
export function activityTimes(start: string, end: string, allDay: boolean) {
  if (allDay && end < start)
    throw new Error("De einddatum mag niet vóór de begindatum liggen.");
  return {
    starts_at: toInstant(allDay ? start + "T00:00" : start),
    ends_at: toInstant(allDay ? shiftDate(end, 1) + "T00:00" : end),
  };
}
export const formatDate = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: zone, ...options }).format(
    new Date(iso),
  );
export const repeatLabel = {
  none: "Niet herhalen",
  daily: "Elke dag",
  weekly: "Elke week",
  yearly: "Elk jaar",
};
export function expand(
  plans: Plan[],
  attendance: Attendance[],
  start: Date,
  end: Date,
): Occurrence[] {
  if (end <= start || +end - +start > 371 * 86400000)
    throw new Error("Kies een periode van maximaal één jaar.");
  const result: Occurrence[] = [];
  for (const plan of plans) {
    const anchor = Temporal.Instant.from(plan.starts_at)
      .toZonedDateTimeISO(zone)
      .toPlainDateTime();
    const finish = Temporal.Instant.from(plan.ends_at)
      .toZonedDateTimeISO(zone)
      .toPlainDateTime();
    const wallDuration = anchor.until(finish, { largestUnit: "days" });
    const push = (candidate: Temporal.PlainDateTime) => {
      const occurrence_start = candidate
        .toZonedDateTime(zone, { disambiguation: "later" })
        .toInstant()
        .toString();
      let occurrence_end = candidate
        .add(wallDuration)
        .toZonedDateTime(zone, { disambiguation: "later" })
        .toInstant()
        .toString();
      if (Date.parse(occurrence_end) <= Date.parse(occurrence_start))
        occurrence_end = new Date(
          Date.parse(occurrence_start) +
            Date.parse(plan.ends_at) -
            Date.parse(plan.starts_at),
        ).toISOString();
      if (
        Date.parse(occurrence_start) >= +end ||
        Date.parse(occurrence_end) <= +start
      )
        return;
      const rows = attendance.filter((a) => a.event_id === plan.id);
      const people = [...new Set(rows.map((a) => a.user_id))];
      const attendees = people.filter((id) => {
        const single = rows.find(
          (a) =>
            a.user_id === id &&
            a.occurrence_start &&
            Date.parse(a.occurrence_start) === Date.parse(occurrence_start),
        );
        return single
          ? single.attending
          : rows.some(
              (a) =>
                a.user_id === id && a.occurrence_start === null && a.attending,
            );
      });
      result.push({ ...plan, occurrence_start, occurrence_end, attendees });
    };
    if (plan.recurrence === "none") {
      push(anchor);
      continue;
    }
    const startLocal = Temporal.Instant.fromEpochMilliseconds(+start)
      .toZonedDateTimeISO(zone)
      .toPlainDate();
    if (plan.recurrence === "yearly") {
      for (
        let year = Math.max(anchor.year, startLocal.year - 1);
        year <= end.getFullYear() + 1;
        year++
      )
        push(anchor.add({ years: year - anchor.year }));
    } else {
      const step = plan.recurrence === "weekly" ? 7 : 1;
      const days = anchor
        .toPlainDate()
        .until(startLocal, { largestUnit: "days" }).days;
      const durationDays =
        Math.ceil(
          (Date.parse(plan.ends_at) - Date.parse(plan.starts_at)) / 86400000,
        ) + 2;
      for (
        let n = Math.max(0, Math.floor((days - durationDays) / step));
        ;
        n++
      ) {
        const candidate = anchor.add({ days: n * step });
        if (
          Number(
            candidate.toZonedDateTime(zone, { disambiguation: "later" })
              .epochMilliseconds,
          ) >= +end
        )
          break;
        push(candidate);
      }
    }
  }
  return result.sort(
    (a, b) =>
      Date.parse(a.occurrence_start) - Date.parse(b.occurrence_start) ||
      a.title.localeCompare(b.title),
  );
}
export function overlapsDay(event: Occurrence, key: string) {
  const day = Temporal.PlainDate.from(key),
    start = day.toZonedDateTime(zone),
    end = day.add({ days: 1 }).toZonedDateTime(zone);
  return (
    Date.parse(event.occurrence_start) < Number(end.epochMilliseconds) &&
    Date.parse(event.occurrence_end) > Number(start.epochMilliseconds)
  );
}
export function calendarDays(month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from(
    { length: 42 },
    (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}
