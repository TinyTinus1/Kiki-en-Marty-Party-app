export type Idea = {
  id: string;
  kind: "alphabet" | "date" | "location";
  letter: string | null;
  title: string;
  location: string;
  description: string;
  completed: boolean;
  archived: boolean;
};
export type IdeaDraft = Pick<Idea, "title" | "location" | "description">;
export const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export function completedLetters(ideas: Idea[]) {
  return new Set(
    ideas
      .filter((i) => i.kind === "alphabet" && i.completed && !i.archived)
      .map((i) => i.letter),
  );
}
export const exampleIdeas: Idea[] = [
  {
    id: "demo-a",
    kind: "alphabet",
    letter: "A",
    title: "Aardbeien plukken",
    location: "",
    description: "Een mandje vol en daarna samen iets bakken.",
    completed: true,
    archived: false,
  },
  {
    id: "demo-b",
    kind: "alphabet",
    letter: "B",
    title: "Bowlen & bitterballen",
    location: "",
    description: "Wie gooit de eerste strike?",
    completed: false,
    archived: false,
  },
  {
    id: "demo-date",
    kind: "date",
    letter: null,
    title: "Ons vaste avondje uit",
    location: "Ons favoriete restaurant",
    description: "Tijd voor ons twee.",
    completed: false,
    archived: false,
  },
  {
    id: "demo-place",
    kind: "location",
    letter: null,
    title: "Ons favoriete restaurant",
    location: "Ons favoriete restaurant",
    description: "Het liefst een plekje bij het raam.",
    completed: false,
    archived: false,
  },
];
