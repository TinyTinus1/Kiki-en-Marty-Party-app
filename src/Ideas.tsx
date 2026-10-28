import { useState, type FormEvent } from "react";
import {
  CalendarDays,
  Check,
  Heart,
  MapPin,
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  alphabet,
  completedLetters,
  type Idea,
  type IdeaDraft,
} from "./dateIdeas";

export function Ideas({
  mode,
  ideas,
  loading,
  error,
  onRetry,
  onSave,
  onPlan,
  onMemory,
  isRemembered,
}: {
  mode: "alphabet" | "favorites";
  ideas: Idea[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onSave: (idea: Idea) => Promise<void>;
  onPlan: (idea: IdeaDraft) => void;
  onMemory: (idea: Idea) => void;
  isRemembered: (idea: Idea) => boolean;
}) {
  const [letter, setLetter] = useState("A");
  const [category, setCategory] = useState<"date" | "location">("date");
  const [editing, setEditing] = useState<Idea | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const kind = mode === "alphabet" ? "alphabet" : category;
  const rows = ideas.filter(
    (i) =>
      !i.archived &&
      i.kind === kind &&
      (kind !== "alphabet" || i.letter === letter),
  );
  const done = completedLetters(ideas);
  function edit(idea?: Idea) {
    setFormError("");
    setRemoving(null);
    setEditing(
      idea || {
        id: crypto.randomUUID(),
        kind,
        letter: kind === "alphabet" ? letter : null,
        title: "",
        location: "",
        description: "",
        completed: false,
        archived: false,
      },
    );
  }
  async function change(idea: Idea) {
    setBusy(true);
    setFormError("");
    try {
      await onSave(idea);
      setEditing(null);
      setRemoving(null);
    } catch {
      setFormError(
        "Opslaan is niet gelukt. Controleer je verbinding en probeer opnieuw.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title")).trim();
    if (!title) {
      setFormError("Vul een naam in.");
      return;
    }
    void change({
      ...editing,
      title,
      location: String(f.get("location") || "").trim(),
      description: String(f.get("description")).trim(),
    });
  }
  return (
    <section
      className="ideas-page"
      aria-label={mode === "alphabet" ? "A–Z dates" : "Favorieten"}
    >
      <div className="collection-heading">
        <div>
          <span className="eyebrow">
            {mode === "alphabet"
              ? "26 LETTERS, JULLIE AVONTUREN"
              : "HIER KOMEN WE GRAAG TERUG"}
          </span>
          <h2>
            {mode === "alphabet" ? "Van A tot samen." : "Onze favorieten."}
          </h2>
          <p>
            {mode === "alphabet"
              ? "Bedenk een date bij elke letter, plan hem in en vink hem af zodra jullie geweest zijn."
              : "Bewaar fijne dates en locaties. Zo staat een volgend uitje zo weer in de agenda."}
          </p>
        </div>
        {mode === "alphabet" && (
          <div className="alphabet-progress">
            <strong>
              {done.size}
              <span> / 26</span>
            </strong>
            <span>letters beleefd</span>
            <progress
              aria-label="Afgeronde letters"
              value={done.size}
              max={26}
            />
          </div>
        )}
      </div>
      {mode === "alphabet" ? (
        <div className="alphabet-grid" aria-label="Kies een letter">
          {alphabet.map((l) => (
            <button
              key={l}
              className={
                "letter-button " +
                (l === letter ? "selected " : "") +
                (done.has(l) ? "completed" : "")
              }
              aria-pressed={l === letter}
              aria-label={`Letter ${l}${done.has(l) ? ", afgerond" : ""}`}
              onClick={() => {
                setLetter(l);
                setEditing(null);
                setFormError("");
                setRemoving(null);
              }}
            >
              {l}
              {done.has(l) && <Check size={12} />}
            </button>
          ))}
        </div>
      ) : (
        <div className="favorite-switch" aria-label="Soort favorieten">
          <button
            aria-pressed={category === "date"}
            onClick={() => {
              setCategory("date");
              setEditing(null);
              setFormError("");
              setRemoving(null);
            }}
          >
            <Heart size={17} />
            Favoriete dates
          </button>
          <button
            aria-pressed={category === "location"}
            onClick={() => {
              setCategory("location");
              setEditing(null);
              setFormError("");
              setRemoving(null);
            }}
          >
            <MapPin size={17} />
            Favoriete locaties
          </button>
        </div>
      )}
      {error && (
        <p className="error-inline" role="alert">
          {error}{" "}
          <button className="text-link" onClick={onRetry}>
            Opnieuw proberen
          </button>
        </p>
      )}
      <div className="collection-toolbar">
        <h3>
          {mode === "alphabet"
            ? `Dates met de ${letter}`
            : category === "date"
              ? "Om nog eens te doen"
              : "Onze fijne plekken"}
        </h3>
        <button
          className="primary"
          disabled={loading || !!error || busy}
          onClick={() => edit()}
        >
          <Plus size={17} />
          {kind === "location" ? "Locatie bewaren" : "Date bedenken"}
        </button>
      </div>
      {editing && (
        <form className="idea-editor" onSubmit={submit} key={editing.id}>
          <h3>
            {ideas.some((i) => i.id === editing.id)
              ? kind === "alphabet"
                ? "Date-idee aanpassen"
                : "Favoriet aanpassen"
              : kind === "location"
                ? "Een fijne plek bewaren"
                : "Een nieuw date-idee"}
          </h3>
          <label>
            {kind === "location" ? "Naam van de plek" : "Wat gaan we doen?"}
            <input
              name="title"
              defaultValue={editing.title}
              maxLength={100}
              required
              autoFocus
              placeholder={
                kind === "location"
                  ? "Bijvoorbeeld ons favoriete restaurant"
                  : `Bijvoorbeeld ${letter === "B" ? "bowlen" : "een avondje uit"}`
              }
            />
          </label>
          <label>
            {kind === "location" ? "Adres of plaats" : "Locatie (optioneel)"}
            <input
              name="location"
              defaultValue={editing.location}
              maxLength={200}
              list="saved-places"
              placeholder="Adres, plaats of naam"
            />
          </label>
          <label>
            {kind === "location" ? "Wat willen we onthouden?" : "Ons idee"}
            <textarea
              name="description"
              defaultValue={editing.description}
              maxLength={2000}
              rows={3}
              placeholder="Alles wat handig of leuk is om te onthouden…"
            />
          </label>
          {formError && (
            <p role="alert" className="error-inline">
              {formError}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setFormError("");
              }}
            >
              Annuleren
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Bewaren…" : "Bewaren"}
            </button>
          </div>
        </form>
      )}
      {formError && !editing && (
        <p role="alert" className="error-inline">
          {formError}
        </p>
      )}
      {loading ? (
        <p role="status">Jullie ideeën worden geladen…</p>
      ) : !error && !rows.length ? (
        <div className="empty">
          <Heart size={30} />
          <h3>
            {kind === "alphabet"
              ? `Wat gaan we met de ${letter} doen?`
              : "Hier begint een volgend uitje"}
          </h3>
          <p>
            {kind === "location"
              ? "Bewaar een locatie om deze later bij een activiteit te kiezen."
              : "Bewaar jullie eerste idee. Een datum kiezen kan later."}
          </p>
        </div>
      ) : (
        <div className="idea-cards">
          {rows.map((idea) => (
            <article
              className={
                "idea-card " + (idea.completed ? "idea-completed" : "")
              }
              key={idea.id}
            >
              <div className="idea-card-top">
                <span className="idea-symbol">
                  {idea.letter ||
                    (kind === "location" ? (
                      <MapPin size={22} />
                    ) : (
                      <Heart size={22} />
                    ))}
                </span>
                <div>
                  <h3>{idea.title}</h3>
                  {idea.completed && (
                    <span className="completed-label">
                      <Check size={14} />
                      Samen gedaan
                    </span>
                  )}
                </div>
              </div>
              {idea.location && (
                <p className="idea-location">
                  <MapPin size={15} />
                  {idea.location}
                </p>
              )}
              {idea.description && (
                <p className="idea-description">{idea.description}</p>
              )}
              <div className="idea-actions">
                {kind !== "location" && (
                  <button
                    className="quiet memory-heart"
                    onClick={() => onMemory(idea)}
                    aria-label={`${isRemembered(idea) ? "Open herinnering" : "Bewaar in Date memories"}: ${idea.title}`}
                  >
                    <Heart
                      size={17}
                      fill={isRemembered(idea) ? "currentColor" : "none"}
                    />
                    {isRemembered(idea) ? "In ons boek" : "Bewaar herinnering"}
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    onPlan({
                      ...idea,
                      location:
                        kind === "location"
                          ? idea.location || idea.title
                          : idea.location,
                      title: kind === "location" ? "" : idea.title,
                    })
                  }
                >
                  <CalendarDays size={16} />
                  {kind === "location" ? "Plan hier iets" : "Inplannen"}
                </button>
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => edit(idea)}
                >
                  Bewerken
                </button>
                {kind === "alphabet" && (
                  <button
                    className="quiet"
                    disabled={busy}
                    onClick={() =>
                      void change({ ...idea, completed: !idea.completed })
                    }
                  >
                    {idea.completed ? (
                      <RotateCcw size={15} />
                    ) : (
                      <Check size={15} />
                    )}
                    {idea.completed ? "Nog te doen" : "Samen gedaan"}
                  </button>
                )}
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() =>
                    setRemoving(removing === idea.id ? null : idea.id)
                  }
                >
                  Wegleggen
                </button>
              </div>
              {removing === idea.id && (
                <div className="delete-confirm">
                  <p>
                    Dit idee wegleggen? Je kunt het daarna terugzetten via
                    ‘Weggelegde ideeën’.
                  </p>
                  <button
                    className="quiet"
                    disabled={busy}
                    onClick={() => void change({ ...idea, archived: true })}
                  >
                    Ja, wegleggen
                  </button>
                  <button className="quiet" onClick={() => setRemoving(null)}>
                    Annuleren
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {ideas.some((i) => i.archived && i.kind === kind) && (
        <details className="archived-ideas">
          <summary>Weggelegde ideeën</summary>
          {ideas
            .filter((i) => i.archived && i.kind === kind)
            .map((i) => (
              <div key={i.id}>
                <span>
                  {i.letter ? `${i.letter} · ` : ""}
                  {i.title}
                </span>
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => void change({ ...i, archived: false })}
                >
                  Terugzetten
                </button>
              </div>
            ))}
        </details>
      )}
    </section>
  );
}
