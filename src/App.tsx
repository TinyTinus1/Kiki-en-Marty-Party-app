import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  LogOut,
  MapPin,
  Moon,
  Plus,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";
import { supabase } from "./supabase";
import {
  calendarDays,
  dateKey,
  expand,
  formatDate,
  localInput,
  overlapsDay,
  repeatLabel,
  toInstant,
} from "./calendar";
import {
  downloadCalendar,
  exportPlan,
  googleCalendarUrl,
  parseCalendar,
  type ImportRow,
} from "./ical";
import { demoData } from "./demo";
import { registerSW } from "virtual:pwa-register";
import type {
  AccessRequest,
  Occurrence,
  Persona,
  Plan,
  Recurrence,
  Snapshot,
} from "./types";

const isDemo = new URLSearchParams(location.search).get("demo") === "1";
const blank: Snapshot = {
  members: [],
  plans: [],
  attendance: [],
  requests: [],
};
const nameOf = (persona: Persona) => (persona === "kiki" ? "Kiki" : "Marty");
function message(error: unknown) {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "De verbinding is onderbroken. Probeer opnieuw.";
  if (/Error sending (confirmation|magic link|recovery) email/i.test(text))
    return "De inlogmail kon niet worden verstuurd. Probeer het later opnieuw.";
  if (/rate limit|too many requests|security purposes/i.test(text))
    return "Er zijn te snel meerdere e-mails aangevraagd. Wacht even en probeer opnieuw.";
  if (/duplicate key|unique constraint/i.test(text))
    return "Deze gegevens bestaan al. Vernieuw de agenda om de huidige status te bekijken.";
  return text.includes("fetch")
    ? "Geen verbinding. Controleer je internet en probeer opnieuw."
    : text;
}
function IconButton({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => {
      d?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-title">
        <h2>{title}</h2>
        <IconButton label="Sluiten" onClick={onClose} disabled={busy}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
function EventEditor({
  plan,
  day,
  onClose,
  onSave,
  onDelete,
}: {
  plan: Plan | null;
  day: string;
  onClose: () => void;
  onSave: (p: Partial<Plan>) => Promise<void>;
  onDelete: (p: Plan) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  const [locationText, setLocationText] = useState(plan?.location || "");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget),
        starts_at = toInstant(String(f.get("starts"))),
        ends_at = toInstant(String(f.get("ends"))),
        recurrence = String(f.get("recurrence") || "yearly") as Recurrence;
      if (Date.parse(ends_at) <= Date.parse(starts_at))
        throw new Error("De eindtijd moet na de begintijd liggen.");
      if (
        recurrence !== "none" &&
        Date.parse(ends_at) - Date.parse(starts_at) > 31 * 86400000
      )
        throw new Error(
          "Een herhaalde activiteit mag per keer maximaal 31 dagen duren.",
        );
      const title = String(f.get("title")).trim();
      if (!title) throw new Error("Vul een titel in.");
      await onSave({
        title,
        starts_at,
        ends_at,
        location: locationText.trim(),
        description: String(f.get("description")).trim(),
        recurrence,
        all_day: plan?.all_day || false,
      });
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={plan ? "Activiteit bewerken" : "Een nieuw plan"}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <label>
          Wat gaan we doen?
          <input
            name="title"
            required
            maxLength={100}
            autoFocus
            placeholder="Iets om naar uit te kijken…"
            defaultValue={plan?.title}
          />
        </label>
        <div className="form-grid">
          <label>
            Begint op
            <input
              name="starts"
              type="datetime-local"
              required
              readOnly={!!plan?.birthday_user_id}
              defaultValue={plan ? localInput(plan.starts_at) : day + "T19:00"}
            />
          </label>
          <label>
            Eindigt op
            <input
              name="ends"
              type="datetime-local"
              required
              readOnly={!!plan?.birthday_user_id}
              defaultValue={plan ? localInput(plan.ends_at) : day + "T21:00"}
            />
          </label>
        </div>
        <label>
          Herhalen
          <select
            name="recurrence"
            disabled={!!plan?.birthday_user_id}
            defaultValue={plan?.recurrence || "none"}
          >
            {Object.entries(repeatLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="help">
          Tijden volgen Nederland. Bewerken en verwijderen gelden voor de hele
          reeks. Een gewijzigde datum of herhaling wist de aanwezigheidskeuzes.
        </p>
        <label>
          Waar?
          <input
            name="location"
            maxLength={200}
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="Locatie of adres"
          />
        </label>
        {locationText.trim() && (
          <a
            className="text-link"
            href={
              "https://www.google.com/maps/search/?api=1&query=" +
              encodeURIComponent(locationText)
            }
            target="_blank"
            rel="noreferrer"
          >
            Opzoeken in Google Maps ↗
          </a>
        )}
        <label>
          Extra informatie
          <textarea
            name="description"
            maxLength={2000}
            rows={3}
            defaultValue={plan?.description}
            placeholder="Wat moeten we weten?"
          />
        </label>
        {error && (
          <p role="alert" className="error-inline">
            {error}
          </p>
        )}
        {deleting ? (
          <div className="delete-confirm">
            <p>
              Deze activiteit
              {plan?.recurrence !== "none" ? " en de volledige reeks" : ""}{" "}
              verwijderen?
            </p>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete(plan!);
                  onClose();
                } catch (e) {
                  setError(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Ja, verwijderen
            </button>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              Annuleren
            </button>
          </div>
        ) : (
          <div className="form-actions">
            {plan && (
              <button
                type="button"
                className="danger quiet"
                disabled={busy}
                onClick={() => setDeleting(true)}
              >
                Verwijderen
              </button>
            )}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Opslaan…" : "Activiteit opslaan"}
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
function ExportDialog({
  plan,
  userId,
  onClose,
}: {
  plan: Plan;
  userId: string;
  onClose: () => void;
}) {
  const key = "duo-calendar-" + userId;
  const [provider, setProvider] = useState(() => {
      try {
        return localStorage.getItem(key) || "apple";
      } catch {
        return "apple";
      }
    }),
    [remember, setRemember] = useState(true),
    [done, setDone] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (remember) localStorage.setItem(key, provider);
      else localStorage.removeItem(key);
    } catch {}
    if (provider === "google")
      window.open(googleCalendarUrl(plan), "_blank", "noopener,noreferrer");
    else downloadCalendar([plan]);
    setDone(true);
  }
  return (
    <Modal title="Naar je persoonlijke agenda" onClose={onClose}>
      <p>
        <strong>{plan.title}</strong>
        {plan.recurrence !== "none"
          ? " · volledige herhaalreeks"
          : " · één afspraak"}
      </p>
      <form onSubmit={submit}>
        <label>
          Welke agenda gebruik je?
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="apple">Apple Agenda / iPhone</option>
            <option value="google">Google Agenda</option>
            <option value="samsung">Samsung Agenda</option>
            <option value="ics">Andere agenda (.ics)</option>
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Onthoud mijn keuze op dit apparaat
        </label>
        <p className="help">
          Bevestig het toevoegen in je agenda-app. Wijzigingen en afmeldingen
          worden daar nog niet automatisch bijgewerkt.
        </p>
        {done && (
          <p role="status">
            {provider === "google"
              ? "De afspraak is aangeboden aan Google Agenda."
              : "Het agendabestand is aangeboden. Open het bestand in je agenda-app."}{" "}
            Opent er niets? Probeer de knop opnieuw.
          </p>
        )}
        <button className="primary full" type="submit">
          {provider === "google"
            ? "Open Google Agenda"
            : "Download voor mijn agenda"}
        </button>
      </form>
    </Modal>
  );
}
function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (rows: ImportRow[]) => Promise<number>;
}) {
  const [preview, setPreview] = useState<{
      rows: ImportRow[];
      skipped: string[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<string | null>(null);
  return (
    <Modal title="Activiteiten importeren" onClose={onClose} busy={busy}>
      <p>
        Een .ics-bestand, maximaal 1 MB en 200 activiteiten. Bekijk eerst wat je
        toevoegt.
      </p>
      <label>
        Agendabestand
        <input
          type="file"
          accept=".ics,text/calendar"
          disabled={busy}
          onChange={async (e) => {
            setPreview(null);
            setError("");
            setResult(null);
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              if (file.size > 1048576)
                throw new Error("Maximaal 1 MB per bestand.");
              setPreview(await parseCalendar(await file.text()));
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {error && (
        <p role="alert" className="error-inline">
          {error}
        </p>
      )}
      {preview && (
        <>
          <p>
            <strong>{preview.rows.length}</strong> activiteiten klaar voor
            import.
          </p>
          <ul className="import-preview">
            {preview.rows.map((r) => (
              <li key={r.import_key}>
                {r.title}
                <small>
                  {formatDate(r.starts_at, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </small>
              </li>
            ))}
          </ul>
          {preview.skipped.length > 0 && (
            <details>
              <summary>{preview.skipped.length} overgeslagen items</summary>
              <ul>
                {preview.skipped.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="help">
            Externe herhaalreeksen worden overgeslagen. Al geïmporteerde
            afspraken worden niet nogmaals toegevoegd.
          </p>
          <button
            className="primary full"
            disabled={busy || !preview.rows.length || result !== null}
            onClick={async () => {
              setBusy(true);
              try {
                const count = await onImport(preview.rows);
                setResult(
                  `${count} activiteiten toegevoegd. ${preview.rows.length - count} bestaande items overgeslagen.`,
                );
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Importeren…" : "Bevestig import"}
          </button>
        </>
      )}
      {result && <p role="status">{result}</p>}
    </Modal>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(isDemo),
    [snapshot, setSnapshot] = useState<Snapshot>(() =>
      isDemo ? demoData() : blank,
    ),
    [loading, setLoading] = useState(false);
  const [demoPersona, setDemoPersona] = useState<Persona>("marty"),
    [month, setMonth] = useState(
      () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState(""),
    [noticeError, setNoticeError] = useState(false),
    [busy, setBusy] = useState(false),
    [theme, setTheme] = useState(() => {
      try {
        return (
          localStorage.getItem("duo-theme") ||
          (matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light")
        );
      } catch {
        return "light";
      }
    });
  const [editor, setEditor] = useState<Plan | null | undefined>(undefined),
    [importOpen, setImportOpen] = useState(false),
    [exporting, setExporting] = useState<Plan | null>(null),
    [attending, setAttending] = useState<Occurrence | null>(null),
    [attendanceSeries, setAttendanceSeries] = useState(false),
    [attendanceValue, setAttendanceValue] = useState(true),
    [settings, setSettings] = useState(false);
  const [email, setEmail] = useState(""),
    [token, setToken] = useState(""),
    [codeOpen, setCodeOpen] = useState(false),
    [sent, setSent] = useState(false),
    [cooldown, setCooldown] = useState(0);
  const [updateReady, setUpdateReady] = useState(false),
    updateServiceWorker = useRef<
      ((reloadPage?: boolean) => Promise<void>) | null
    >(null);
  const generation = useRef(0),
    userId = isDemo ? "demo-" + demoPersona : session?.user.id;
  const me = snapshot.members.find((m) => m.user_id === userId),
    ownRequest = snapshot.requests.find((r) => r.user_id === userId);
  const notify = useCallback((text: string, error = false) => {
    setNotice(text);
    setNoticeError(error);
  }, []);
  useEffect(() => {
    updateServiceWorker.current = registerSW({
      onNeedRefresh() {
        setUpdateReady(true);
      },
    });
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#19171e" : "#faf8f5");
    try {
      localStorage.setItem("duo-theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  useEffect(() => {
    if (isDemo) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error)
        notify(
          "Je sessie kon niet worden geladen. Probeer opnieuw in te loggen.",
          true,
        );
      else setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthReady(true);
    });
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has("error")) {
      notify(
        "De inloglink is verlopen of al gebruikt. Vraag een nieuwe mail aan.",
        true,
      );
      history.replaceState(null, "", location.pathname + location.search);
    }
    return () => data.subscription.unsubscribe();
  }, [notify]);
  const load = useCallback(async () => {
    if (isDemo || !userId) return;
    const current = ++generation.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_snapshot");
      if (error) throw error;
      if (current === generation.current) setSnapshot(data as Snapshot);
    } catch (e) {
      if (current === generation.current) {
        setSnapshot(blank);
        notify(message(e), true);
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [userId, notify]);
  useEffect(() => {
    if (isDemo) return;
    generation.current++;
    setSnapshot(blank);
    setEditor(undefined);
    setImportOpen(false);
    setExporting(null);
    setAttending(null);
    setSettings(false);
    if (userId) void load();
  }, [userId, load]);
  useEffect(() => {
    if (isDemo || !userId) return;
    const refresh = () => {
      if (!document.hidden && !editor && !importOpen && !attending) void load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [userId, load, editor, importOpen, attending]);
  const days = calendarDays(month),
    start = days[0],
    end = new Date(
      days[41].getFullYear(),
      days[41].getMonth(),
      days[41].getDate() + 1,
    );
  const occurrences = expand(snapshot.plans, snapshot.attendance, start, end);
  const visible = occurrences.filter((e) =>
    selected
      ? overlapsDay(e, selected)
      : Date.parse(e.occurrence_start) <
          +new Date(month.getFullYear(), month.getMonth() + 1, 1) &&
        Date.parse(e.occurrence_end) > +month,
  );
  const pending = snapshot.requests.filter((r) => r.status === "pending");
  const both = (e: Occurrence) =>
    snapshot.members.length === 2 &&
    snapshot.members.every((m) => e.attendees.includes(m.user_id));
  const colorOf = (e: Occurrence) =>
    both(e)
      ? "together"
      : snapshot.members.find((m) => m.user_id === e.owner_id)?.persona ||
        "marty";
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: new URL(
            import.meta.env.BASE_URL,
            location.origin + location.pathname,
          ).href,
        },
      });
      if (error) throw error;
      setSent(true);
      setCooldown(60);
      notify(
        "Controleer je e-mail. Nieuw account? Vul de bevestigingscode in. Bestaand account? Open de nieuwste inloglink.",
      );
    } catch (e) {
      notify(message(e), true);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: "email",
      });
      if (error) throw error;
      setToken("");
      notify("Je e-mailadres is bevestigd.");
    } catch {
      notify(
        "De code klopt niet of is verlopen. Gebruik de nieuwste mail.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  async function requestAccess(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const { error } = await supabase.rpc("request_access", {
        p_name: String(f.get("name")),
        p_birth_date: String(f.get("birth")),
      });
      if (error) throw error;
      await load();
      notify("Je gegevens zijn opgeslagen.");
    } catch (e) {
      notify(message(e), true);
    } finally {
      setBusy(false);
    }
  }
  async function savePlan(payload: Partial<Plan>) {
    if (!me) throw new Error("Log opnieuw in.");
    if (isDemo) {
      setSnapshot((s) => ({
        ...s,
        plans: editor
          ? s.plans.map((p) => (p.id === editor.id ? { ...p, ...payload } : p))
          : [
              ...s.plans,
              {
                ...payload,
                id: crypto.randomUUID(),
                owner_id: me.user_id,
                birthday_user_id: null,
              } as Plan,
            ],
        attendance:
          editor &&
          (editor.starts_at !== payload.starts_at ||
            editor.ends_at !== payload.ends_at ||
            editor.recurrence !== payload.recurrence)
            ? s.attendance.filter((a) => a.event_id !== editor.id)
            : s.attendance,
      }));
    } else {
      const result = editor
        ? await supabase
            .from("events")
            .update(payload)
            .eq("id", editor.id)
            .select("id")
        : await supabase
            .from("events")
            .insert({ ...payload, owner_id: me.user_id })
            .select("id");
      if (result.error) throw result.error;
      if (!result.data?.length)
        throw new Error(
          "De activiteit is niet opgeslagen. Controleer je toegang.",
        );
      await load();
    }
    const d = new Date(payload.starts_at!);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(null);
    notify("Activiteit opgeslagen.");
  }
  async function deletePlan(p: Plan) {
    if (isDemo)
      setSnapshot((s) => ({
        ...s,
        plans: s.plans.filter((e) => e.id !== p.id),
        attendance: s.attendance.filter((a) => a.event_id !== p.id),
      }));
    else {
      const { data, error } = await supabase
        .from("events")
        .delete()
        .eq("id", p.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Verwijderen is niet gelukt.");
      await load();
    }
    notify(
      "Activiteit verwijderd. Verwijder een eerdere export zelf uit je persoonlijke agenda.",
    );
  }
  async function setAttendance() {
    if (!attending || !me) return;
    setBusy(true);
    try {
      const event = attending;
      if (isDemo)
        setSnapshot((s) => ({
          ...s,
          attendance: [
            ...s.attendance.filter(
              (a) =>
                !(
                  a.event_id === event.id &&
                  a.user_id === me.user_id &&
                  (attendanceSeries ||
                    (a.occurrence_start !== null &&
                      Date.parse(a.occurrence_start) ===
                        Date.parse(event.occurrence_start)))
                ),
            ),
            {
              event_id: event.id,
              user_id: me.user_id,
              occurrence_start: attendanceSeries
                ? null
                : event.occurrence_start,
              attending: attendanceValue,
            },
          ],
        }));
      else {
        const { error } = await supabase.rpc("set_attendance", {
          p_event_id: event.id,
          p_occurrence: event.occurrence_start,
          p_series: attendanceSeries,
          p_attending: attendanceValue,
        });
        if (error) throw error;
        await load();
      }
      setAttending(null);
      notify(
        attendanceValue
          ? "Je aanwezigheid is opgeslagen. Voeg de afspraak hieronder toe aan je persoonlijke agenda."
          : "Je bent afgemeld. Een eerder geëxporteerde afspraak verwijder je zelf uit je persoonlijke agenda.",
      );
      if (attendanceValue) setExporting(exportPlan(event, attendanceSeries));
    } catch (e) {
      notify(message(e), true);
    } finally {
      setBusy(false);
    }
  }
  async function importRows(rows: ImportRow[]) {
    if (isDemo) {
      const fresh = rows.filter(
        (r) => !snapshot.plans.some((p) => p.import_key === r.import_key),
      );
      setSnapshot((s) => ({
        ...s,
        plans: [
          ...s.plans,
          ...fresh.map((r) => ({
            ...r,
            id: crypto.randomUUID(),
            owner_id: me!.user_id,
            recurrence: "none" as const,
            birthday_user_id: null,
          })),
        ],
      }));
      return fresh.length;
    }
    const { data, error } = await supabase.rpc("import_events", {
      p_rows: rows,
    });
    if (error) throw error;
    await load();
    return Number(data);
  }
  async function review(r: AccessRequest, approve: boolean) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("review_request", {
        p_user_id: r.user_id,
        p_approve: approve,
      });
      if (error) throw error;
      await load();
      notify(
        approve
          ? "Account goedgekeurd. De verjaardag is toegevoegd."
          : "Aanvraag afgewezen.",
      );
    } catch (e) {
      notify(message(e), true);
    } finally {
      setBusy(false);
    }
  }
  function changeMonth(n: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
    setSelected(null);
  }

  return (
    <>
      <header className="topbar">
        <a
          className="brand"
          href={isDemo ? "?demo=1" : "./"}
          aria-label="Kiki en Marty, startpagina"
        >
          <span className="brand-symbol">
            <Heart size={22} />
          </span>
          <span>
            Kiki <span className="amp">&</span> Marty<small>PARTY APP</small>
          </span>
        </a>
        <div className="top-actions">
          <span className="private-label">
            <ShieldCheck size={14} /> Alleen voor ons
          </span>
          <IconButton
            label={theme === "dark" ? "Licht thema" : "Donker thema"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </IconButton>
          {me && (
            <button
              className={"avatar " + me.persona}
              onClick={() => setSettings(true)}
              aria-label="Account en instellingen"
            >
              {me.display_name.slice(0, 1)}
            </button>
          )}
        </div>
      </header>
      <main>
        {isDemo && (
          <div className="demo-banner">
            <span>
              <strong>Voorbeeldagenda</strong> · Fictieve plannen, wijzigingen
              verdwijnen bij herladen.
            </span>
            <select
              aria-label="Voorbeeldaccount"
              value={demoPersona}
              onChange={(e) => setDemoPersona(e.target.value as Persona)}
            >
              <option value="marty">Bekijk als Marty</option>
              <option value="kiki">Bekijk als Kiki</option>
            </select>
            <a href="./">Naar inloggen</a>
          </div>
        )}
        {updateReady && (
          <div className="notice" role="status">
            <span>
              Er staat een nieuwe versie klaar. Sla je openstaande wijzigingen
              eerst op.
            </span>
            <button
              className="secondary"
              onClick={() => void updateServiceWorker.current?.(true)}
            >
              App bijwerken
            </button>
          </div>
        )}
        {notice && (
          <div
            className={"notice " + (noticeError ? "error" : "")}
            role={noticeError ? "alert" : "status"}
          >
            <span>{notice}</span>
            <IconButton label="Melding sluiten" onClick={() => setNotice("")}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        {!authReady ? (
          <section className="auth-card">
            <p>Even je agenda ophalen…</p>
          </section>
        ) : !userId ? (
          <section className="welcome">
            <div className="welcome-copy">
              <span className="eyebrow">
                <Sparkles size={14} /> JULLIE PLANNEN, OP ÉÉN PLEK
              </span>
              <h1>
                Meer tijd
                <br />
                voor <span>ons.</span>
              </h1>
              <p>
                Van een spontaan avondje uit tot jullie vaste plannen. Een
                agenda voor alles wat jullie samen willen doen.
              </p>
              <div className="legend">
                <span>
                  <i className="dot kiki" />
                  Kiki
                </span>
                <span>
                  <i className="dot marty" />
                  Marty
                </span>
                <span>
                  <i className="dot together" />
                  Samen
                </span>
              </div>
            </div>
            <div className="auth-card">
              <span className="eyebrow">WELKOM THUIS</span>
              <h2>Open jullie agenda</h2>
              <p>Log veilig in met je eigen e-mailadres.</p>
              <form onSubmit={login}>
                <label>
                  E-mailadres
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jij@voorbeeld.nl"
                  />
                </label>
                <button
                  className="primary full"
                  disabled={busy || cooldown > 0}
                >
                  {cooldown > 0
                    ? `Opnieuw aanvragen over ${cooldown}s`
                    : sent
                      ? "Stuur een nieuwe e-mail"
                      : "Stuur mij een e-mail"}
                </button>
              </form>
              <p className="help">
                Nieuw? Je krijgt een bevestigingscode. Heb je al een account?
                Gebruik de inloglink uit de nieuwste mail.
              </p>
              <button
                className="text-link"
                onClick={() => setCodeOpen(!codeOpen)}
              >
                Ik heb een bevestigingscode
              </button>
              {codeOpen && (
                <form onSubmit={verify}>
                  <label>
                    Code uit je e-mail
                    <input
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6,10}"
                      minLength={6}
                      maxLength={10}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                    />
                  </label>
                  <button className="secondary full" disabled={busy || !email}>
                    Bevestig mijn e-mailadres
                  </button>
                </form>
              )}
              <div className="auth-footer">
                <a href="?demo=1">
                  Neem alvast een kijkje <ChevronRight size={15} />
                </a>
              </div>
            </div>
          </section>
        ) : !me ? (
          <section className="auth-card request-card">
            <span className="eyebrow">BIJNA BINNEN</span>
            <h1>Maak het persoonlijk.</h1>
            {loading ? (
              <p>Je toegang controleren…</p>
            ) : ownRequest ? (
              <>
                <p>
                  {ownRequest.status === "pending"
                    ? "Je aanvraag wacht op goedkeuring. Zodra je bent toegelaten verschijnt jullie agenda."
                    : ownRequest.status === "rejected"
                      ? "Je aanvraag is afgewezen. Neem contact op met je partner."
                      : "Je account heeft momenteel geen toegang. Neem contact op met je partner."}
                </p>
                <button
                  className="secondary"
                  onClick={() => void load()}
                  disabled={loading}
                >
                  Goedkeuring controleren
                </button>
              </>
            ) : (
              <>
                <p>
                  Vul je naam en geboortedatum in. Je verjaardag krijgt
                  automatisch een plekje in de agenda. Alleen uitgenodigde
                  e-mailadressen kunnen toegang aanvragen.
                </p>
                <form onSubmit={requestAccess}>
                  <label>
                    Je naam
                    <input
                      name="name"
                      required
                      maxLength={80}
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    Geboortedatum
                    <input
                      name="birth"
                      required
                      type="date"
                      min="1900-01-01"
                      max={dateKey(new Date())}
                      autoComplete="bday"
                    />
                  </label>
                  <button className="primary full" disabled={busy}>
                    Account afronden
                  </button>
                </form>
              </>
            )}
            <button
              className="quiet"
              onClick={() => void supabase.auth.signOut()}
            >
              Uitloggen
            </button>
          </section>
        ) : (
          <>
            <section className="page-heading">
              <div>
                <span className="eyebrow">
                  <span className="tiny-heart">♡</span> KLEINE PLANNEN, MOOIE
                  HERINNERINGEN
                </span>
                <h1>
                  Onze agenda<span className="heading-dot">.</span>
                </h1>
                <p>Alles waar we samen naar uitkijken.</p>
              </div>
              <button
                className="primary add-plan"
                onClick={() => setEditor(null)}
              >
                <Plus size={18} />
                Activiteit toevoegen
              </button>
            </section>
            {pending.length > 0 && (
              <section className="approval-panel">
                <h2>
                  <Users size={18} /> Aanmeldingsaanvragen
                </h2>
                {pending.map((r) => (
                  <div className="approval-row" key={r.user_id}>
                    <div>
                      <strong>{r.display_name}</strong>
                      <small>{r.email}</small>
                    </div>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void review(r, true)}
                    >
                      Goedkeuren
                    </button>
                    <button
                      className="quiet"
                      disabled={busy}
                      onClick={() => void review(r, false)}
                    >
                      Afwijzen
                    </button>
                  </div>
                ))}
              </section>
            )}
            <div className="agenda-layout">
              <section className="calendar-panel" aria-label="Maandkalender">
                <div className="calendar-toolbar">
                  <h2>
                    {formatDate(toInstant(dateKey(month) + "T12:00"), {
                      month: "long",
                      year: "numeric",
                    })}
                  </h2>
                  <div>
                    <button
                      className="today-button"
                      onClick={() => {
                        const n = new Date();
                        setMonth(new Date(n.getFullYear(), n.getMonth(), 1));
                        setSelected(dateKey(n));
                      }}
                    >
                      Vandaag
                    </button>
                    <IconButton
                      label="Vorige maand"
                      onClick={() => changeMonth(-1)}
                    >
                      <ChevronLeft size={20} />
                    </IconButton>
                    <IconButton
                      label="Volgende maand"
                      onClick={() => changeMonth(1)}
                    >
                      <ChevronRight size={20} />
                    </IconButton>
                  </div>
                </div>
                <div className="weekdays" aria-hidden="true">
                  {["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="calendar-grid">
                  {days.map((day) => {
                    const key = dateKey(day),
                      plans = occurrences.filter((e) => overlapsDay(e, key));
                    return (
                      <button
                        key={key}
                        className={[
                          "calendar-day",
                          day.getMonth() !== month.getMonth() ? "outside" : "",
                          key === dateKey(new Date()) ? "today" : "",
                          key === selected ? "selected" : "",
                        ].join(" ")}
                        aria-label={`${day.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${plans.length} activiteiten`}
                        aria-pressed={selected === key}
                        onClick={() => {
                          setSelected(selected === key ? null : key);
                          if (day.getMonth() !== month.getMonth())
                            setMonth(
                              new Date(day.getFullYear(), day.getMonth(), 1),
                            );
                        }}
                      >
                        <span className="day-number">{day.getDate()}</span>
                        <span className="day-plans">
                          {plans.slice(0, 2).map((p) => (
                            <span
                              key={p.id + p.occurrence_start}
                              className={"mini-plan " + colorOf(p)}
                            >
                              {p.title}
                            </span>
                          ))}
                          {plans.length > 2 && (
                            <span className="more-plans">
                              +{plans.length - 2} meer
                            </span>
                          )}
                        </span>
                        <span className="day-dots">
                          {plans.slice(0, 4).map((p) => (
                            <i
                              key={p.id + p.occurrence_start}
                              className={"dot " + colorOf(p)}
                            />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="calendar-bottom">
                  <div className="legend">
                    <span>
                      <i className="dot kiki" />
                      Kiki
                    </span>
                    <span>
                      <i className="dot marty" />
                      Marty
                    </span>
                    <span>
                      <i className="dot together" />
                      Samen
                    </span>
                  </div>
                  {selected && (
                    <button
                      className="text-link"
                      onClick={() => setSelected(null)}
                    >
                      Hele maand
                    </button>
                  )}
                </div>
              </section>
              <aside className="planning-panel">
                <div className="planning-title">
                  <div>
                    <span className="eyebrow">
                      {selected ? "GESELECTEERDE DAG" : "DEZE MAAND"}
                    </span>
                    <h2>
                      {selected
                        ? formatDate(toInstant(selected + "T12:00"), {
                            day: "numeric",
                            month: "long",
                          })
                        : "Op de planning"}
                    </h2>
                  </div>
                  <span className="count">{visible.length}</span>
                </div>
                <div className="plan-list">
                  {!visible.length ? (
                    <div className="empty">
                      <CalendarDays size={32} />
                      <h3>Ruimte voor iets leuks</h3>
                      <p>
                        Er staan nog geen plannen voor{" "}
                        {selected ? "deze dag" : "deze maand"}.
                      </p>
                      <button
                        className="text-link"
                        onClick={() => setEditor(null)}
                      >
                        Maak een plan <Plus size={14} />
                      </button>
                    </div>
                  ) : (
                    visible.map((event) => {
                      const author = snapshot.members.find(
                          (m) => m.user_id === event.owner_id,
                        ),
                        present = event.attendees.includes(me.user_id);
                      return (
                        <article
                          key={event.id + event.occurrence_start}
                          className={"plan-card " + colorOf(event)}
                        >
                          <div className="plan-top">
                            <div className="plan-date">
                              <strong>
                                {formatDate(event.occurrence_start, {
                                  day: "2-digit",
                                })}
                              </strong>
                              <span>
                                {formatDate(event.occurrence_start, {
                                  month: "short",
                                })}
                              </span>
                            </div>
                            <div className="plan-main">
                              <span className="plan-owner">
                                {both(event)
                                  ? "Kiki & Marty"
                                  : author?.display_name || "Samen"}{" "}
                                {event.recurrence !== "none" && (
                                  <Repeat2
                                    size={12}
                                    aria-label={repeatLabel[event.recurrence]}
                                  />
                                )}
                              </span>
                              <h3>{event.title}</h3>
                              <p className="plan-time">
                                {event.all_day
                                  ? "Hele dag"
                                  : formatDate(event.occurrence_start, {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }) +
                                    " – " +
                                    formatDate(event.occurrence_end, {
                                      ...(dateKey(
                                        new Date(event.occurrence_start),
                                      ) !==
                                      dateKey(new Date(event.occurrence_end))
                                        ? { day: "numeric", month: "short" }
                                        : {}),
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                              </p>
                            </div>
                            <button
                              className="edit-button"
                              aria-label={`Bewerk ${event.title}`}
                              onClick={() =>
                                setEditor(
                                  snapshot.plans.find(
                                    (p) => p.id === event.id,
                                  )!,
                                )
                              }
                            >
                              Bewerk
                            </button>
                          </div>
                          {event.location && (
                            <a
                              className="plan-location"
                              href={
                                "https://www.google.com/maps/search/?api=1&query=" +
                                encodeURIComponent(event.location)
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              <MapPin size={13} />
                              {event.location}
                            </a>
                          )}
                          {event.description && (
                            <p className="plan-description">
                              {event.description}
                            </p>
                          )}
                          <div className="attendance-people">
                            {snapshot.members.map((m) => (
                              <span
                                key={m.user_id}
                                className={
                                  (event.attendees.includes(m.user_id)
                                    ? "is-present "
                                    : "") + m.persona
                                }
                              >
                                <span className="person-dot">
                                  {event.attendees.includes(m.user_id) ? (
                                    <Check size={10} />
                                  ) : null}
                                </span>
                                {m.display_name}
                              </span>
                            ))}
                          </div>
                          <div className="plan-buttons">
                            <button
                              className={present ? "attend active" : "attend"}
                              onClick={() => {
                                setAttending(event);
                                setAttendanceSeries(false);
                                setAttendanceValue(!present);
                              }}
                            >
                              <Check size={14} />
                              {present
                                ? "Aanwezig · wijzigen"
                                : "Ik ben aanwezig"}
                            </button>
                            <IconButton
                              label={`Voeg ${event.title} toe aan persoonlijke agenda`}
                              onClick={() =>
                                setExporting(
                                  exportPlan(
                                    event,
                                    event.recurrence !== "none",
                                  ),
                                )
                              }
                            >
                              <ArrowDownToLine size={16} />
                            </IconButton>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </aside>
            </div>
            <footer className="agenda-footer">
              <span>
                <Heart size={13} /> Gemaakt voor jullie twee
              </span>
              <div>
                <button className="quiet" onClick={() => setImportOpen(true)}>
                  <ArrowUpFromLine size={14} />
                  Importeren
                </button>
                <button
                  className="quiet"
                  onClick={() => {
                    if (!snapshot.plans.length) {
                      notify("Er zijn nog geen activiteiten om te exporteren.");
                      return;
                    }
                    downloadCalendar(snapshot.plans);
                    notify(
                      "Open het .ics-bestand in je agenda-app en bevestig het toevoegen.",
                    );
                  }}
                >
                  <ArrowDownToLine size={14} />
                  Alles exporteren
                </button>
                <button
                  className="quiet"
                  disabled={loading}
                  onClick={() => {
                    if (isDemo) notify("De voorbeeldagenda is bijgewerkt.");
                    else void load();
                  }}
                >
                  <RefreshCw size={14} className={loading ? "spin" : ""} />
                  Vernieuwen
                </button>
              </div>
            </footer>
            <p className="sync-note">
              {isDemo
                ? "Dit is een voorbeeld. Er wordt niets online opgeslagen."
                : "Plannen worden elke 30 seconden bijgewerkt."}
            </p>
          </>
        )}
      </main>
      {me && editor !== undefined && (
        <EventEditor
          key={editor?.id || "new"}
          plan={editor}
          day={
            selected ||
            dateKey(
              month.getMonth() === new Date().getMonth() &&
                month.getFullYear() === new Date().getFullYear()
                ? new Date()
                : month,
            )
          }
          onClose={() => setEditor(undefined)}
          onSave={savePlan}
          onDelete={deletePlan}
        />
      )}
      {me && importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onImport={importRows}
        />
      )}
      {me && exporting && (
        <ExportDialog
          plan={exporting}
          userId={me.user_id}
          onClose={() => setExporting(null)}
        />
      )}
      {me && attending && (
        <Modal
          title="Jouw aanwezigheid"
          busy={busy}
          onClose={() => setAttending(null)}
        >
          <p>
            <strong>{attending.title}</strong>
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void setAttendance();
            }}
          >
            <label>
              Aanwezigheid
              <select
                value={attendanceValue ? "yes" : "no"}
                onChange={(e) => setAttendanceValue(e.target.value === "yes")}
              >
                <option value="yes">Ik ben aanwezig</option>
                <option value="no">Ik ben niet aanwezig</option>
              </select>
            </label>
            {attending.recurrence !== "none" && (
              <label>
                Voor welke afspraken?
                <select
                  value={attendanceSeries ? "series" : "single"}
                  onChange={(e) =>
                    setAttendanceSeries(e.target.value === "series")
                  }
                >
                  <option value="single">
                    Alleen{" "}
                    {formatDate(attending.occurrence_start, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </option>
                  <option value="series">De volledige herhaalreeks</option>
                </select>
              </label>
            )}
            <p className="help">
              {attendanceSeries
                ? "Deze keuze geldt voor de hele reeks en vervangt eerdere uitzonderingen. Daarna kun je nog per datum afwijken."
                : "Je keuze geldt alleen voor deze datum."}{" "}
              {attendanceValue
                ? "Na opslaan kun je de afspraak of reeks toevoegen aan je iPhone-agenda."
                : ""}
            </p>
            <button className="primary full" disabled={busy}>
              {busy ? "Opslaan…" : "Aanwezigheid opslaan"}
            </button>
          </form>
        </Modal>
      )}
      {me && settings && (
        <Modal title="Jullie plekje" onClose={() => setSettings(false)}>
          <div className="account-summary">
            <span className={"avatar " + me.persona}>
              {me.display_name.slice(0, 1)}
            </span>
            <div>
              <h3>{me.display_name}</h3>
              <p>Beheerder · {nameOf(me.persona)}</p>
            </div>
          </div>
          <p>
            Jullie hebben dezelfde rechten. De kleur van de maker blijft
            zichtbaar; als jullie beiden aanwezig zijn, krijgt de activiteit
            beide kleuren.
          </p>
          <div className="install-hint">
            <h3>Op je iPhone zetten</h3>
            <p>
              Open deze app in Safari, tik op Deel en kies ‘Zet op beginscherm’.
              Open de app daarna via het nieuwe icoon.
            </p>
          </div>
          <p className="help">
            Je kunt de app zonder verbinding openen. Voor inloggen, plannen
            bekijken of wijzigen heb je internet nodig. Persoonlijke gegevens
            worden niet door de offlinecache opgeslagen.
          </p>
          {!isDemo && (
            <button
              className="secondary full"
              onClick={async () => {
                const { error } = await supabase.auth.signOut();
                if (error) notify(message(error), true);
              }}
            >
              <LogOut size={16} />
              Uitloggen
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
