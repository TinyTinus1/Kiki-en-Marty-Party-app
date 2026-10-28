import { describe, expect, it } from "vitest";
import { completedLetters, exampleIdeas } from "./dateIdeas";
import { expand, upcomingRange, toInstant } from "./calendar";
import type { Plan } from "./types";

describe("planning vanaf vandaag", () => {
  it("toont de laatste dag inclusief, ook over de jaargrens", () => {
    const range = upcomingRange(new Date("2026-12-28T12:00:00Z"));
    expect(range.first).toBe("2026-12-28");
    expect(range.last).toBe("2027-01-28");
    const make = (id: string, start: string, end: string): Plan => ({
      id,
      owner_id: "marty",
      title: id,
      starts_at: toInstant(start),
      ends_at: toInstant(end),
      location: "",
      description: "",
      recurrence: "none",
      all_day: false,
      birthday_user_id: null,
    });
    const rows = expand(
      [
        make("voorbij", "2026-12-27T19:00", "2026-12-27T21:00"),
        make("loopt-door", "2026-12-27T19:00", "2026-12-28T01:00"),
        make("vandaag", "2026-12-28T19:00", "2026-12-28T21:00"),
        make("laatste-dag", "2027-01-28T22:00", "2027-01-28T23:00"),
        make("te-laat", "2027-01-29T00:00", "2027-01-29T01:00"),
      ],
      [],
      range.start,
      range.end,
    );
    expect(rows.map((i) => i.id)).toEqual([
      "loopt-door",
      "vandaag",
      "laatste-dag",
    ]);
  });
  it("rekent met Amsterdamse dagen en een kalendermaand bij maandultimo", () => {
    expect(upcomingRange(new Date("2026-10-28T23:30:00Z")).first).toBe(
      "2026-10-29",
    );
    expect(upcomingRange(new Date("2028-01-31T12:00:00Z")).last).toBe(
      "2028-02-29",
    );
    expect(upcomingRange(new Date("2027-01-31T12:00:00Z")).last).toBe(
      "2027-02-28",
    );
  });
  it("behoudt lokale dagen over de zomertijdwisseling", () => {
    const range = upcomingRange(new Date("2026-03-28T12:00:00Z"));
    expect(range.start.toISOString()).toBe("2026-03-27T23:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-04-28T22:00:00.000Z");
  });
});
describe("alfabetvoortgang", () => {
  it("telt elke beleefde letter eenmaal en negeert weggelegde ideeën", () => {
    expect([
      ...completedLetters([
        ...exampleIdeas,
        { ...exampleIdeas[0], id: "duplicate" },
        { ...exampleIdeas[1], completed: true, archived: true },
      ]),
    ]).toEqual(["A"]);
    expect(
      completedLetters(exampleIdeas.map((i) => ({ ...i, completed: false })))
        .size,
    ).toBe(0);
  });
});
