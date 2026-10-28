import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BookHeart,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  List,
  LockKeyhole,
  MapPin,
  Plus,
  X,
} from "lucide-react";
import { supabase } from "./supabase";
import { formatDate, toInstant } from "./calendar";
import type { DateMemory, MemorySeed, MemoryStory } from "./memoryData";
import type { MemoryBookState } from "./useMemories";
import type { Member } from "./types";
import "./memories.css";

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Dat is niet gelukt. Probeer opnieuw.";
const personTitle = (s: MemoryStory) =>
  s.persona === "kiki" ? "Kieks moment" : "Marty’s moment";

export function MemoryEditor({
  seed,
  onClose,
  onSave,
}: {
  seed: MemorySeed;
  onClose: () => void;
  onSave: (seed: MemorySeed) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [id] = useState(() => seed.id || crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title")).trim();
    if (!title) {
      setError("Geef deze herinnering een titel.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...seed,
        id,
        title,
        memory_date: String(f.get("date")),
        location: String(f.get("location")).trim(),
        letter: String(f.get("letter")) || null,
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal memory-editor"
      aria-label={seed.id ? "Herinnering aanpassen" : "Een plekje in ons boek"}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-title">
        <h2>{seed.id ? "Herinnering aanpassen" : "Een plekje in ons boek"}</h2>
        <button
          className="icon-button"
          aria-label="Sluiten"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p>
        Bewaar jullie date. Op de volgende pagina voeg je één foto en jullie
        eigen momenten toe.
      </p>
      <form onSubmit={submit}>
        <label>
          Onze date
          <input
            name="title"
            required
            maxLength={100}
            defaultValue={seed.title}
            autoFocus
          />
        </label>
        <label>
          Wanneer was het?
          <input
            name="date"
            type="date"
            required
            defaultValue={seed.memory_date}
          />
        </label>
        <label>
          Waar waren we?
          <input name="location" maxLength={200} defaultValue={seed.location} />
        </label>
        <label>
          Alfabetletter (optioneel)
          <select name="letter" defaultValue={seed.letter || ""}>
            <option value="">Geen letter</option>
            {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error-inline" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="quiet"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Annuleren
          </button>
          <button className="primary" disabled={busy}>
            {busy
              ? "Bewaren…"
              : seed.id
                ? "Wijzigingen bewaren"
                : "Bewaar in ons boek"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function MemoryPhoto({
  memory,
  me,
  demo,
  upload,
}: {
  memory: DateMemory;
  me: Member;
  demo: boolean;
  upload: MemoryBookState["upload"];
}) {
  const [url, setUrl] = useState<string | null>(null),
    [photoError, setPhotoError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    setPhotoError("");
    async function load() {
      if (!memory.photo_path) return;
      if (demo) {
        if (active) setUrl(memory.photo_path);
        return;
      }
      const { data, error } = await supabase.storage
        .from("date-memories")
        .createSignedUrl(memory.photo_path, 900);
      if (active) {
        if (error) setPhotoError("De foto kon niet worden geladen.");
        else setUrl(data.signedUrl);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 600000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [memory.photo_path, me.user_id, demo, attempt]);
  async function choose(file: File) {
    setBusy(true);
    setPhotoError("");
    try {
      await upload(memory.id, file);
    } catch (e) {
      setPhotoError(errorText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <div className="memory-photo">
        {url ? (
          <img
            src={url}
            alt={`Jullie foto van ${memory.title}`}
            onError={() =>
              setPhotoError("De foto kon niet worden geladen. Probeer opnieuw.")
            }
          />
        ) : (
          <div className="memory-photo-empty">
            <Camera size={38} />
            <strong>
              {memory.photo_path
                ? "Jullie foto laden…"
                : "Eén foto, een heel verhaal"}
            </strong>
            <span>
              {memory.photo_path
                ? "Even geduld."
                : "Kies jullie mooiste moment van deze date."}
            </span>
          </div>
        )}
      </div>
      <input
        ref={input}
        className="memory-file-input"
        type="file"
        aria-label="Foto voor deze herinnering"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void choose(file);
        }}
      />
      <button
        className="memory-photo-button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Camera size={16} />
        {busy
          ? "Foto bewaren…"
          : memory.photo_path
            ? "Andere foto kiezen"
            : "Jullie foto toevoegen"}
      </button>
      {photoError && (
        <p className="memory-error" role="alert">
          {photoError}{" "}
          {memory.photo_path && (
            <button
              className="text-link"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Opnieuw laden
            </button>
          )}
        </p>
      )}
    </>
  );
}

function StoryNote({
  story,
  memory,
  me,
  book,
}: {
  story: MemoryStory;
  memory: DateMemory;
  me: Member;
  book: MemoryBookState;
}) {
  const own = story.user_id === me.user_id;
  const draft = book.drafts[`${memory.id}:${me.user_id}`];
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const write = own && (editing || !story.submitted || draft !== undefined);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await book.saveStory(memory.id, draft ?? story.body ?? "");
      setEditing(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={`memory-note ${story.persona}`}
      aria-label={personTitle(story)}
    >
      <h3>
        {personTitle(story)}
        <Heart size={17} />
      </h3>
      {write ? (
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor={`moment-${memory.id}`}>
            Jouw moment
          </label>
          <textarea
            id={`moment-${memory.id}`}
            value={draft ?? story.body ?? ""}
            onChange={(e) => book.setDraft(memory.id, e.target.value)}
            rows={5}
            maxLength={5000}
            required
            placeholder="Wat wil jij van deze date onthouden?"
          />
          <p className="memory-draft-hint">
            Dit is je concept. Bewaar je moment voordat je de app afsluit.
          </p>
          <div className="moment-actions">
            <button
              className="memory-save"
              disabled={busy || !(draft ?? story.body ?? "").trim()}
            >
              {busy ? "Bewaren…" : "Mijn moment bewaren"}
            </button>
            {story.submitted && (
              <button
                className="memory-text-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  book.clearDraft(memory.id);
                  setEditing(false);
                }}
              >
                Annuleren
              </button>
            )}
          </div>
        </form>
      ) : story.body !== null ? (
        <>
          <p className="memory-story">{story.body}</p>
          {own && (
            <button
              className="memory-text-button"
              onClick={() => setEditing(true)}
            >
              Mijn moment aanpassen
            </button>
          )}
        </>
      ) : (
        <div className="memory-locked">
          <LockKeyhole size={28} />
          <strong>
            {story.submitted
              ? `${story.display_name} heeft een moment bewaard`
              : `Nog even wachten op ${story.display_name}`}
          </strong>
          <p>
            {story.submitted
              ? "Het verhaal blijft nog even een verrassing."
              : "Jullie lezen elkaars verhalen zodra jullie allebei iets hebben bewaard."}
          </p>
        </div>
      )}
      {own && story.submitted && !memory.revealed_at && !write && (
        <p className="memory-own-status">
          <Check size={14} />
          Bewaard. Alleen jij kunt jouw tekst al lezen.
        </p>
      )}
      {error && (
        <p className="memory-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function MemoryBook({
  book,
  me,
  demo,
  selected,
  onSelect,
  onNew,
  onEdit,
}: {
  book: MemoryBookState;
  me: Member;
  demo: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onNew: () => void;
  onEdit: (seed: MemorySeed) => void;
}) {
  const [contents, setContents] = useState(false),
    [turn, setTurn] = useState(0);
  const index = book.memories.findIndex((m) => m.id === selected),
    memory = book.memories[index];
  function open(id: string | null) {
    onSelect(id);
    setTurn((n) => n + 1);
    setContents(false);
  }
  const prev = index <= 0 ? null : book.memories[index - 1]?.id;
  const next = book.memories[index + 1]?.id;
  return (
    <section className="memory-section" aria-label="Date memories">
      <h1 className="sr-only">Date memories</h1>
      <div className="memory-heading">
        <div>
          <span className="eyebrow">KLEINE MOMENTEN OM TE BEWAREN</span>
          <h2>
            Ons boek vol mooie momenten <Heart size={27} />
          </h2>
          <p>Marty & Kiek · Date memories</p>
        </div>
        <button
          className="quiet"
          onClick={onNew}
          disabled={book.loading && !book.memories.length}
        >
          <Plus size={16} />
          Herinnering toevoegen
        </button>
      </div>
      {book.error && (
        <p className="memory-error" role="alert">
          {book.error}{" "}
          <button
            className="memory-text-button"
            onClick={() => void book.refresh()}
          >
            Opnieuw proberen
          </button>
        </p>
      )}
      {book.loading && !book.memories.length && (
        <p role="status">Jullie boek wordt geladen…</p>
      )}
      {!memory ? (
        <div className="memory-cover">
          <span className="cover-stitch" />
          <BookHeart size={48} />
          <span className="cover-names">Marty & Kiek</span>
          <h3>Date memories</h3>
          <p>Van kleine plannen naar mooie herinneringen.</p>
          <span className="cover-count">
            {book.memories.length}{" "}
            {book.memories.length === 1 ? "herinnering" : "herinneringen"} om in
            te bladeren
          </span>
          <button
            className="cover-open"
            onClick={() =>
              book.memories.length ? open(book.memories[0].id) : onNew()
            }
            disabled={book.loading && !book.memories.length}
          >
            {book.memories.length ? "Open ons boek" : "Onze eerste herinnering"}
            <ChevronRight size={18} />
          </button>
        </div>
      ) : (
        <div
          key={`${memory.id}:${turn}`}
          className="scrapbook"
          aria-label={`Herinnering: ${memory.title}`}
        >
          <div className="scrapbook-page memory-left">
            <div className="polaroid">
              <MemoryPhoto
                key={memory.id + me.user_id}
                memory={memory}
                me={me}
                demo={demo}
                upload={book.upload}
              />
              <div className="polaroid-caption">
                <h3>{memory.title}</h3>
                <div className="memory-meta">
                  <span>
                    {formatDate(toInstant(memory.memory_date + "T12:00"), {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  {memory.location && (
                    <span>
                      <MapPin size={15} />
                      {memory.location}
                    </span>
                  )}
                </div>
                <span className="memory-stickers">
                  {memory.letter && (
                    <span className="memory-letter">{memory.letter}</span>
                  )}
                  <Heart size={25} fill="currentColor" />
                </span>
              </div>
            </div>
            <button
              className="memory-text-button memory-edit-meta"
              onClick={() => onEdit(memory)}
            >
              Titel, datum of locatie aanpassen
            </button>
          </div>
          <div className="scrapbook-page memory-right">
            <h3 className="memory-page-title">
              Twee verhalen, één herinnering <Heart size={22} />
            </h3>
            {memory.stories.map((story) => (
              <StoryNote
                key={memory.id + story.user_id + me.user_id}
                story={story}
                memory={memory}
                me={me}
                book={book}
              />
            ))}
            <p
              className={
                "memory-reveal-status " + (memory.revealed_at ? "revealed" : "")
              }
              role="status"
            >
              {memory.revealed_at ? (
                <Check size={17} />
              ) : (
                <LockKeyhole size={17} />
              )}
              <span>
                {memory.revealed_at
                  ? "Jullie verhalen zijn geopend. Om samen terug te lezen."
                  : "Jullie verhalen openen zodra jullie allebei iets hebben bewaard."}
              </span>
            </p>
          </div>
        </div>
      )}
      <div className="book-controls">
        <button
          className="book-arrow"
          aria-label={index <= 0 ? "Naar de kaft" : "Vorige herinnering"}
          disabled={!memory}
          onClick={() => open(prev)}
        >
          <ChevronLeft size={23} />
        </button>
        <div>
          <span aria-live="polite">
            {memory
              ? `Herinnering ${index + 1} van ${book.memories.length}`
              : "Jullie herinneringenboek"}
          </span>
          <button
            className="memory-text-button"
            aria-expanded={contents}
            onClick={() => setContents((v) => !v)}
          >
            <List size={16} />
            Inhoudsopgave
          </button>
          {memory && (
            <button className="memory-text-button" onClick={() => open(null)}>
              Naar de kaft
            </button>
          )}
        </div>
        <button
          className="book-arrow"
          aria-label="Volgende herinnering"
          disabled={!memory || !next}
          onClick={() => next && open(next)}
        >
          <ChevronRight size={23} />
        </button>
      </div>
      {contents && (
        <nav
          className="book-contents"
          aria-label="Inhoudsopgave van jullie boek"
        >
          <h3>Onze herinneringen</h3>
          {book.memories.length ? (
            book.memories.map((m, i) => (
              <button
                key={m.id}
                aria-current={m.id === selected ? "page" : undefined}
                onClick={() => open(m.id)}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{m.title}</strong>
                <span>
                  {formatDate(toInstant(m.memory_date + "T12:00"), {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </button>
            ))
          ) : (
            <p>
              Bewaar een date met het hartje of voeg hier jullie eerste
              herinnering toe.
            </p>
          )}
        </nav>
      )}
    </section>
  );
}
