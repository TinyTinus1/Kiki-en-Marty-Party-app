import type { Member, Persona } from "./types";

export type MemorySeed = {
  id?: string;
  title: string;
  memory_date: string;
  location: string;
  letter: string | null;
  source_key: string | null;
};
export type MemoryStory = {
  user_id: string;
  display_name: string;
  persona: Persona;
  submitted: boolean;
  body: string | null;
};
export type DateMemory = MemorySeed & {
  id: string;
  photo_path: string | null;
  revealed_at: string | null;
  created_at: string;
  stories: MemoryStory[];
};
export function memoryView(memory: DateMemory, userId: string): DateMemory {
  return {
    ...memory,
    stories: memory.stories.map((s) => ({
      ...s,
      body: s.user_id === userId || memory.revealed_at ? s.body : null,
    })),
  };
}
export function recordMoment(
  memory: DateMemory,
  userId: string,
  body: string,
): DateMemory {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 5000)
    throw new Error("Schrijf een moment van maximaal 5000 tekens.");
  const stories = memory.stories.map((s) =>
    s.user_id === userId ? { ...s, body: trimmed, submitted: true } : s,
  );
  return {
    ...memory,
    stories,
    revealed_at:
      memory.revealed_at ||
      (stories.length === 2 && stories.every((s) => s.submitted)
        ? new Date().toISOString()
        : null),
  };
}
export function demoMemories(members: Member[]): DateMemory[] {
  return [
    {
      id: "demo-memory-beach",
      title: "Uitwaaien aan zee",
      memory_date: "2026-10-24",
      location: "Bergen aan Zee",
      letter: "U",
      source_key: null,
      photo_path: import.meta.env.BASE_URL + "demo-memory-beach.png",
      revealed_at: null,
      created_at: "2026-10-24T12:00:00Z",
      stories: members.map((m) => ({
        ...m,
        submitted: m.persona === "kiki",
        body:
          m.persona === "kiki"
            ? "De wind in ons haar, warme chocolademelk en alle tijd om samen te zijn. Dit wil ik vaker doen."
            : null,
      })),
    },
  ];
}
export function photoDimensions(width: number, height: number) {
  if (!width || !height || width * height > 48000000)
    throw new Error("Deze foto is te groot. Kies een kleinere foto.");
  const scale = Math.min(1, 1600 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export async function prepareMemoryPhoto(file: File): Promise<Blob> {
  if (
    !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) ||
    file.size > 25 * 1024 * 1024
  )
    throw new Error(
      "Kies een foto als JPG, PNG, WebP of HEIC van maximaal 25 MB.",
    );
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error(
        "Deze foto kan hier niet worden geopend. Kies een JPG- of PNG-versie.",
      );
    }
    const size = photoDimensions(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("De foto kon niet worden voorbereid.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error("De foto kon niet worden voorbereid.")),
        "image/jpeg",
        0.86,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
