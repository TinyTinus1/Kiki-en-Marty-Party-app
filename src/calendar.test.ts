import { describe, it, expect } from "vitest";
import {
  expand,
  toInstant,
  localInput,
  activityTimes,
  shiftDate,
} from "./calendar";
import { ical, parseCalendar, exportPlan } from "./ical";
import type { Plan } from "./types";
const plan: Plan = {
  id: "sample",
  owner_id: "marty",
  title: "Samen wandelen",
  starts_at: toInstant("2026-10-18T10:00"),
  ends_at: toInstant("2026-10-18T12:00"),
  location: "Park",
  description: "Koffie, taart; gezellig\nTot dan!",
  recurrence: "weekly",
  all_day: false,
  birthday_user_id: null,
};
describe("herhaalreeksen en aanwezigheid", () => {
  it("kiest bij de dubbele 02:30 dezelfde tijd als PostgreSQL", () => {
    expect(toInstant("2026-10-25T02:30")).toBe("2026-10-25T01:30:00Z");
    expect(toInstant("2026-03-29T02:30")).toBe("2026-03-29T01:30:00Z");
  });
  it("behoudt Nederlandse tijd tijdens de wintertijdwisseling", () => {
    const rows = expand(
      [plan],
      [],
      new Date("2026-10-17"),
      new Date("2026-11-03"),
    );
    expect(rows.map((r) => localInput(r.occurrence_start))).toEqual([
      "2026-10-18T10:00",
      "2026-10-25T10:00",
      "2026-11-01T10:00",
    ]);
    expect(rows[0].occurrence_start).toContain("08:00:00");
    expect(rows[1].occurrence_start).toContain("09:00:00");
  });
  it("laat een uitzondering voorgaan op aanwezigheid voor de hele reeks", () => {
    const rows = expand(
      [plan],
      [
        {
          event_id: plan.id,
          user_id: "kiki",
          occurrence_start: null,
          attending: true,
        },
        {
          event_id: plan.id,
          user_id: "kiki",
          occurrence_start: "2026-10-25T09:00:00+00:00",
          attending: false,
        },
      ],
      new Date("2026-10-17"),
      new Date("2026-11-03"),
    );
    expect(rows.map((r) => r.attendees)).toEqual([["kiki"], [], ["kiki"]]);
  });
  it("houdt een verjaardag op 29 februari op de laatste dag van februari", () => {
    const p = {
      ...plan,
      starts_at: toInstant("2000-02-29T00:00"),
      ends_at: toInstant("2000-03-01T00:00"),
      recurrence: "yearly" as const,
      all_day: true,
    };
    const rows = expand(
      [p],
      [],
      new Date("2027-02-01"),
      new Date("2027-03-03"),
    );
    expect(localInput(rows[0].occurrence_start)).toBe("2027-02-28T00:00");
    expect(localInput(rows[0].occurrence_end)).toBe("2027-03-01T00:00");
  });
  it("exporteert een datum zonder RRULE en een reeks met RRULE", () => {
    const row = expand(
      [plan],
      [],
      new Date("2026-10-24"),
      new Date("2026-10-27"),
    )[0];
    const one = ical([exportPlan(row, false)]),
      all = ical([exportPlan(row, true)]);
    expect(one).not.toContain("RRULE");
    expect(one).toContain("DTSTART:20261025T090000Z");
    expect(all).toContain("RRULE:FREQ=WEEKLY");
    expect(all).toContain("DTSTART;TZID=Europe/Amsterdam:20261018T100000");
  });
});
describe("iCalendar import en export", () => {
  it("bewaart een hele dag tijdens wintertijd en exporteert exclusieve einddatums", () => {
    const times = activityTimes("2026-10-25", "2026-10-25", true);
    expect(Date.parse(times.ends_at) - Date.parse(times.starts_at)).toBe(
      25 * 3600000,
    );
    const p = { ...plan, ...times, all_day: true, recurrence: "none" as const };
    expect(ical([p])).toContain(
      "DTSTART;VALUE=DATE:20261025\r\nDTEND;VALUE=DATE:20261026",
    );
    expect(shiftDate(localInput(p.ends_at).slice(0, 10), -1)).toBe(
      "2026-10-25",
    );
    expect(() => activityTimes("2026-10-26", "2026-10-25", true)).toThrow(
      "einddatum",
    );
  });
  it("importeert losse afspraken met tekstescaping en voorkomt dubbelen in een bestand", async () => {
    const p = { ...plan, recurrence: "none" as const };
    const text = ical([p, p]);
    const result = await parseCalendar(text);
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.rows[0].description).toBe(p.description);
    expect(Date.parse(result.rows[0].starts_at)).toBe(Date.parse(p.starts_at));
  });
  it("slaat externe herhaalreeksen expliciet over", async () => {
    const result = await parseCalendar(ical([plan]));
    expect(result.rows).toHaveLength(0);
    expect(result.skipped[0]).toContain("herhaalreeks");
  });
  it("interpreteert hele dagen als lokale middernacht, ook over wintertijd", async () => {
    const result = await parseCalendar(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:whole\r\nDTSTART;VALUE=DATE:20261025\r\nSUMMARY:Vrij\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
    );
    expect(result.rows).toHaveLength(1);
    expect(localInput(result.rows[0].starts_at)).toBe("2026-10-25T00:00");
    expect(localInput(result.rows[0].ends_at)).toBe("2026-10-26T00:00");
    expect(
      Date.parse(result.rows[0].ends_at) - Date.parse(result.rows[0].starts_at),
    ).toBe(25 * 3600000);
  });
});
