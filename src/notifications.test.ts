import { describe, it, expect } from "vitest";
import { render, type Job } from "../supabase/functions/notify/render";
const job: Job = {
  id: "fixture",
  lease: "lease",
  recipient: "fixture@example.com",
  name: "Marty <test>",
  kind: "activity",
  item: {
    title: "<img src=x onerror=alert(1)>",
    starts_at: "2026-10-28T18:00:00Z",
    location: "Utrecht & omgeving",
  },
};
describe("meldingsmails", () => {
  it("toont hele dag zonder een misleidende middernachttijd", () => {
    const result = render(
      [
        {
          ...job,
          item: {
            ...job.item,
            starts_at: "2026-10-24T22:00:00Z",
            all_day: true,
          },
        },
      ],
      "https://example.com/",
    );
    expect(result.html).toContain("Hele dag");
    expect(result.html).not.toContain("00:00");
  });
  it("escaped alle gebruikersinhoud en bundelt meerdere activiteiten", () => {
    const result = render(
      [job, { ...job, id: "second" }],
      "https://example.com/",
    );
    expect(result.subject).toBe("Nieuwe plannen voor jullie");
    expect(result.html).not.toContain("<img");
    expect(result.html).toContain("&lt;img");
    expect(result.html).toContain("Utrecht &amp; omgeving");
    expect(result.html).toContain("Marty &lt;test&gt;");
  });
  it("gebruikt voor goedkeuring een inlogknop zonder toegangstoken", () => {
    const result = render(
      [{ ...job, kind: "approval", item: { name: "Kiki" } }],
      "https://example.com/",
    );
    expect(result.subject).toContain("toegelaten");
    expect(result.html).toContain("https://example.com/");
    expect(result.html).not.toContain("token=");
    expect(result.html).toContain("dezelfde beheerrechten");
  });
});
