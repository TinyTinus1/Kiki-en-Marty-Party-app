import { describe, expect, it } from "vitest";
import {
  demoMemories,
  memoryView,
  recordMoment,
  photoDimensions,
  prepareMemoryPhoto,
} from "./memoryData";
const members = [
  { user_id: "demo-kiki", display_name: "Kiek", persona: "kiki" as const },
  { user_id: "demo-marty", display_name: "Marty", persona: "marty" as const },
];
describe("persoonlijke momenten", () => {
  it("onthult de eerste tekst niet aan de ander, ook niet via de gegevens van de pagina", () => {
    const raw = demoMemories(members)[0];
    expect(memoryView(raw, "demo-kiki").stories[0].body).toContain(
      "warme chocolademelk",
    );
    const other = memoryView(raw, "demo-marty");
    expect(other.stories[0].submitted).toBe(true);
    expect(other.stories[0].body).toBeNull();
    expect(JSON.stringify(other)).not.toContain("warme chocolademelk");
  });
  it("onthult beide teksten pas na twee bewaarde momenten en behoudt de onthulling bij wijzigen", () => {
    const raw = demoMemories(members)[0];
    const complete = recordMoment(raw, "demo-marty", "  Samen aan zee  ");
    expect(complete.revealed_at).not.toBeNull();
    expect(memoryView(complete, "demo-marty").stories[0].body).not.toBeNull();
    const edited = recordMoment(complete, "demo-kiki", "Een aanvulling");
    expect(edited.revealed_at).toBe(complete.revealed_at);
    expect(edited.stories[1].body).toBe("Samen aan zee");
  });
  it("telt een leeg of te lang verhaal niet als een bewaard moment", () => {
    const raw = demoMemories(members)[0];
    expect(() => recordMoment(raw, "demo-marty", "   ")).toThrow();
    expect(() => recordMoment(raw, "demo-marty", "a".repeat(5001))).toThrow();
    expect(raw.revealed_at).toBeNull();
  });
});
describe("foto voorbereiden", () => {
  it("verkleint liggende en staande foto’s zonder de verhouding te wijzigen of kleine foto’s te vergroten", () => {
    expect(photoDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(photoDimensions(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(photoDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(() => photoDimensions(0, 0)).toThrow();
    expect(() => photoDimensions(10000, 10000)).toThrow();
  });
  it("weigert niet-foto’s voordat een afbeeldingsdecoder wordt geopend", async () => {
    await expect(
      prepareMemoryPhoto(
        new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }),
      ),
    ).rejects.toThrow("Kies een foto");
  });
});
