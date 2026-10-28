import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Member } from "./types";
import {
  demoMemories,
  memoryView,
  prepareMemoryPhoto,
  recordMoment,
  type DateMemory,
  type MemorySeed,
} from "./memoryData";

export function useMemories(
  me: Member | undefined,
  members: Member[],
  demo: boolean,
) {
  const [rows, setRows] = useState<DateMemory[]>(() =>
    demo ? demoMemories(members) : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const identity = useRef(0),
    reads = useRef(0),
    demoPhotos = useRef<string[]>([]);
  const refresh = useCallback(async () => {
    if (demo || !me) return;
    const epoch = identity.current,
      request = ++reads.current;
    setLoading(true);
    try {
      const { data, error: err } = await supabase.rpc("memory_book");
      if (err) throw err;
      if (epoch === identity.current && request === reads.current) {
        setRows(data as DateMemory[]);
        setError("");
        return true;
      }
    } catch {
      if (epoch === identity.current && request === reads.current)
        setError(
          "Jullie herinneringen konden niet worden geladen. Probeer opnieuw.",
        );
    } finally {
      if (epoch === identity.current && request === reads.current)
        setLoading(false);
    }
  }, [me?.user_id, demo]);
  useEffect(() => {
    if (demo) return;
    identity.current++;
    reads.current++;
    setRows([]);
    setError("");
    setDrafts({});
    if (me) void refresh();
    return () => {
      identity.current++;
      reads.current++;
    };
  }, [me?.user_id, demo, refresh]);
  useEffect(() => {
    if (demo || !me) return;
    const update = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [me?.user_id, demo, refresh]);
  useEffect(
    () => () => {
      demoPhotos.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  function requireMember() {
    if (!me) throw new Error("Log opnieuw in.");
    return identity.current;
  }
  function setDraft(id: string, body: string) {
    if (me) setDrafts((all) => ({ ...all, [`${id}:${me.user_id}`]: body }));
  }
  function clearDraft(id: string) {
    if (me)
      setDrafts((all) => {
        const next = { ...all };
        delete next[`${id}:${me.user_id}`];
        return next;
      });
  }
  useEffect(() => {
    if (
      !Object.keys(drafts).some(
        (key) => key.endsWith(":" + me?.user_id) && drafts[key].trim(),
      )
    )
      return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts, me?.user_id]);
  async function save(seed: MemorySeed): Promise<string> {
    const epoch = requireMember();
    const id = seed.id || crypto.randomUUID();
    if (demo) {
      const exists = rows.find(
        (m) =>
          m.id === id || (seed.source_key && m.source_key === seed.source_key),
      );
      if (exists && exists.id !== id) return exists.id;
      setRows((all) =>
        exists
          ? all.map((m) => (m.id === id ? { ...m, ...seed, id } : m))
          : [
              ...all,
              {
                ...seed,
                id,
                photo_path: null,
                revealed_at: null,
                created_at: new Date().toISOString(),
                stories: members.map((m) => ({
                  ...m,
                  submitted: false,
                  body: null,
                })),
              },
            ],
      );
      return id;
    }
    const { data, error: err } = await supabase.rpc("save_memory", {
      p_id: id,
      p_title: seed.title,
      p_date: seed.memory_date,
      p_location: seed.location,
      p_letter: seed.letter,
      p_source_key: seed.source_key,
    });
    if (err)
      throw new Error(
        "Bewaren is niet gelukt. Controleer je verbinding en probeer opnieuw.",
      );
    if (epoch !== identity.current)
      throw new Error("Je account is gewijzigd. Open de herinnering opnieuw.");
    reads.current++;
    if (!(await refresh()))
      throw new Error(
        "De herinnering is bewaard, maar verversen lukte niet. Probeer opnieuw.",
      );
    return data as string;
  }
  async function saveStory(id: string, body: string) {
    const epoch = requireMember();
    if (demo) {
      setRows((all) =>
        all.map((m) => (m.id === id ? recordMoment(m, me!.user_id, body) : m)),
      );
      clearDraft(id);
      return;
    }
    const { error: err } = await supabase.rpc("save_memory_story", {
      p_memory_id: id,
      p_body: body,
    });
    if (err)
      throw new Error(
        "Je moment kon niet worden bewaard. Je tekst staat nog in het invulveld. Probeer opnieuw.",
      );
    if (epoch === identity.current) {
      reads.current++;
      if (!(await refresh()))
        throw new Error(
          "Je moment is bewaard, maar verversen lukte niet. Je tekst blijft hier staan.",
        );
      clearDraft(id);
    }
  }
  async function upload(id: string, file: File) {
    const epoch = requireMember();
    const photo = await prepareMemoryPhoto(file);
    if (epoch !== identity.current) throw new Error("Log opnieuw in.");
    if (demo) {
      const path = URL.createObjectURL(photo);
      demoPhotos.current.push(path);
      setRows((all) =>
        all.map((m) => (m.id === id ? { ...m, photo_path: path } : m)),
      );
      return;
    }
    const path = `${id}/${crypto.randomUUID()}.jpg`;
    const { error: err } = await supabase.storage
      .from("date-memories")
      .upload(path, photo, { contentType: "image/jpeg", upsert: false });
    if (err)
      throw new Error("De foto kon niet worden geüpload. Probeer opnieuw.");
    if (epoch !== identity.current) throw new Error("Log opnieuw in.");
    const { error: saveError } = await supabase.rpc("set_memory_photo", {
      p_memory_id: id,
      p_path: path,
    });
    if (saveError)
      throw new Error(
        "De foto kon niet aan deze pagina worden gekoppeld. Probeer opnieuw.",
      );
    reads.current++;
    if (!(await refresh()))
      throw new Error(
        "De foto is bewaard, maar verversen lukte niet. Open de herinnering opnieuw.",
      );
  }
  const memories = rows
    .map((m) => memoryView(m, me?.user_id || ""))
    .sort(
      (a, b) =>
        a.memory_date.localeCompare(b.memory_date) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  return {
    memories,
    loading,
    error,
    refresh,
    save,
    saveStory,
    upload,
    drafts,
    setDraft,
    clearDraft,
  };
}
export type MemoryBookState = ReturnType<typeof useMemories>;
