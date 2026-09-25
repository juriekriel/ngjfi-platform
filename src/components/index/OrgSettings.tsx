"use client";

/**
 * Survey settings — the organisation's own back end, inside its dashboard
 * (same frame, same header, tiles all the way through). Replaces the separate
 * /build console for everything an organisation needs to run its survey.
 *
 *   Name & look      name, colour, logo (upload)   org_update_settings() + Storage (0037)
 *   Messages         welcome and closing           org_update_settings()
 *   Duration         full (~7 min) / core (~3 min) org_set_duration()
 *   Links & QR       survey links, QR download, print cards
 *   Languages        what it runs in; request a translation (→ the Collab)
 *   Status           collecting or waiting for approval
 *
 * Writes need an organisation admin (checked in the database, migration
 * 0036); a facilitator sees everything read-only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { instrument } from "@/lib/instrument";
import { LOGO_BUCKET, LOGO_MAX_BYTES, fitWithin, logoPath, logoProblem, ourLogoPath } from "@/lib/logoUpload";

type Settings = {
  /** Organisation id — its logo folder in storage (migration 0037). */
  id?: string;
  name: string; short_name: string; logo_url: string | null; brand_color: string | null;
  welcome_message: string | null; closing_message: string | null; country: string | null;
  status: string; can_edit: boolean; item_set: "full" | "core" | null; locales: string[];
};

const LANGS: Record<string, string> = { en: "English", es: "Español", pt: "Português", fr: "Français", sw: "Kiswahili", af: "Afrikaans", zu: "isiZulu", ar: "العربية", hi: "हिन्दी", id: "Bahasa Indonesia", ko: "한국어", zh: "中文" };

export default function OrgSettings({ sb, orgSlug, onSaved }: { sb: SupabaseClient; orgSlug: string; onSaved?: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [origin, setOrigin] = useState("https://jfindx.org");
  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("org_settings", { p_org_slug: orgSlug });
    if (error) setErr(/org_settings/.test(error.message) ? "Survey settings need migration 0036, which isn't applied to this database yet." : error.message);
    else setS(data as Settings);
  }, [sb, orgSlug]);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <p className="rounded-2xl border border-rule bg-plate p-5 text-[14px] text-vermillion">{err}</p>;
  if (!s) return <p className="rounded-2xl border border-rule bg-plate p-5 text-[14px] text-ink-2">Loading your settings…</p>;

  const ro = !s.can_edit;
  return (
    <div className="flex flex-col gap-3">
      {ro && (
        <p className="rounded-xl border border-rule bg-plate px-4 py-3 text-[13.5px] text-ink-2">
          You can see these settings; an organisation admin on your team can change them.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        <LookTile sb={sb} orgSlug={orgSlug} s={s} ro={ro} onSaved={() => { load(); onSaved?.(); }} />
        <MessagesTile sb={sb} orgSlug={orgSlug} s={s} ro={ro} />
        <DurationTile sb={sb} orgSlug={orgSlug} s={s} ro={ro} onSaved={load} />
        <LinksTile orgSlug={orgSlug} origin={origin} name={s.name} />
        <LanguagesTile sb={sb} orgSlug={orgSlug} s={s} />
        <StatusTile s={s} />
      </div>
    </div>
  );
}

function Tile({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-rule bg-plate p-5 shadow-sm">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">{kicker}</p>
        <h2 className="mt-0.5 text-[18px] font-bold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">{label}</span>
      {children}
    </label>
  );
}

const input = "rounded-lg border border-rule-2 bg-plate px-3 py-2 text-[14px] text-ink disabled:bg-paper-deep disabled:text-ink-2";
const saveBtn = "self-start rounded-lg bg-gradient-to-r from-violet via-violet-deep to-violet-deeper px-4 py-2.5 text-[14px] font-semibold text-plate disabled:opacity-50";

function useSaver(sb: SupabaseClient, orgSlug: string) {
  const [state, setState] = useState<{ busy: boolean; msg: string | null; err: string | null }>({ busy: false, msg: null, err: null });
  const save = async (patch: Record<string, unknown>, done?: () => void) => {
    setState({ busy: true, msg: null, err: null });
    const { error } = await sb.rpc("org_update_settings", { p_org_slug: orgSlug, p_patch: patch });
    setState({ busy: false, msg: error ? null : "Saved.", err: error?.message ?? null });
    if (!error) done?.();
  };
  return { ...state, save };
}

function Feedback({ msg, err }: { msg: string | null; err: string | null }) {
  if (!msg && !err) return null;
  return <p className={`text-[13px] ${err ? "text-vermillion" : "text-ink-2"}`}>{err ?? msg}</p>;
}

/** Shrink an image to at most 512 px (keeping transparency) so a logo stays light on a cheap phone. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { w, h } = fitWithin(bmp.width, bmp.height);
  if (w === bmp.width && h === bmp.height && file.size <= LOGO_MAX_BYTES) return file;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, w, h);
  const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image"))), type, 0.9));
}

function LookTile({ sb, orgSlug, s, ro, onSaved }: { sb: SupabaseClient; orgSlug: string; s: Settings; ro: boolean; onSaved: () => void }) {
  const [name, setName] = useState(s.name);
  const [color, setColor] = useState(s.brand_color && /^#[0-9a-fA-F]{6}$/.test(s.brand_color) ? s.brand_color : "#FF7A47");
  const [logo, setLogo] = useState(s.logo_url ?? "");
  const sv = useSaver(sb, orgSlug);
  const [up, setUp] = useState<{ busy: boolean; err: string | null }>({ busy: false, err: null });

  // Upload → save the new address → remove the old upload (never an external
  // logo the organisation pasted in). Storage policies (0037) allow this only
  // for the organisation's own admins, in its own folder.
  async function upload(file: File) {
    const problem = logoProblem(file);
    if (problem) return setUp({ busy: false, err: problem });
    if (!s.id) return setUp({ busy: false, err: "Logo upload needs migration 0037, which isn't applied to this database yet." });
    setUp({ busy: true, err: null });
    try {
      const blob = await shrink(file);
      if (blob.size > LOGO_MAX_BYTES) throw new Error("Even after shrinking, that image is over 1 MB — try a simpler one.");
      const type = blob.type || file.type;
      const path = logoPath(s.id, Date.now(), type);
      const { error } = await sb.storage.from(LOGO_BUCKET).upload(path, blob, { contentType: type, upsert: false, cacheControl: "31536000" });
      if (error) throw new Error(/bucket|not found/i.test(error.message) ? "Logo upload needs migration 0037, which isn't applied to this database yet." : error.message);
      const url = sb.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
      const old = ourLogoPath(s.logo_url, s.id);
      const { error: saveErr } = await sb.rpc("org_update_settings", { p_org_slug: orgSlug, p_patch: { logo_url: url } });
      if (saveErr) throw new Error(saveErr.message);
      setLogo(url);
      if (old && old !== path) void sb.storage.from(LOGO_BUCKET).remove([old]);
      setUp({ busy: false, err: null });
      onSaved();
    } catch (e) {
      setUp({ busy: false, err: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  async function removeLogo() {
    setUp({ busy: true, err: null });
    const old = s.id ? ourLogoPath(s.logo_url, s.id) : null;
    const { error } = await sb.rpc("org_update_settings", { p_org_slug: orgSlug, p_patch: { logo_url: "" } });
    if (error) return setUp({ busy: false, err: error.message });
    if (old) void sb.storage.from(LOGO_BUCKET).remove([old]);
    setLogo("");
    setUp({ busy: false, err: null });
    onSaved();
  }
  return (
    <Tile kicker="What respondents see" title="Name & look">
      <Field label="Organisation name">
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={ro} maxLength={80} className={input} />
      </Field>
      <Field label="Brand colour">
        <span className="flex items-center gap-2">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={ro} aria-label="Pick a colour" className="h-10 w-12 cursor-pointer rounded border border-rule-2 bg-plate p-0.5" />
          <input value={color} onChange={(e) => setColor(e.target.value)} disabled={ro} className={`${input} flex-1 font-mono`} />
        </span>
      </Field>
      <Field label="Logo">
        {!ro && (
          <span className="flex flex-wrap items-center gap-2">
            <label className={`inline-flex cursor-pointer items-center rounded-lg border border-rule-2 px-3.5 py-2 text-[13.5px] font-semibold hover:border-ink ${up.busy ? "pointer-events-none opacity-50" : ""}`}>
              {up.busy ? "Uploading…" : logo ? "Replace logo" : "Upload a logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            </label>
            {logo && (
              <button type="button" onClick={removeLogo} disabled={up.busy} className="rounded-lg px-2 py-2 text-[13px] font-semibold text-ink-2 hover:text-vermillion">
                Remove
              </button>
            )}
            <span className="text-[12px] text-ink-2">PNG, JPG or WebP · shrunk to 512 px</span>
          </span>
        )}
        {up.err && <span className="text-[13px] text-vermillion">{up.err}</span>}
        <details className="text-[12.5px] text-ink-2">
          <summary className="cursor-pointer">Or use an image address</summary>
          <input value={logo} onChange={(e) => setLogo(e.target.value)} disabled={ro} placeholder="https://yourministry.org/logo.png" className={`${input} mt-1.5 w-full`} />
        </details>
      </Field>
      <div className="flex items-center gap-3 rounded-xl p-3 text-plate" style={{ background: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#FF7A47" }}>
        {/^https:\/\//.test(logo) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-9 w-9 rounded-full bg-plate object-contain" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-plate text-[15px] font-bold" style={{ color }}>{name.slice(0, 1)}</span>
        )}
        <span className="text-[15px] font-bold">{name || "Your name"}</span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider opacity-80">preview</span>
      </div>
      {!ro && <button disabled={sv.busy} onClick={() => sv.save({ name, brand_color: color, logo_url: logo }, onSaved)} className={saveBtn}>{sv.busy ? "Saving…" : "Save"}</button>}
      <Feedback msg={sv.msg} err={sv.err} />
    </Tile>
  );
}

function MessagesTile({ sb, orgSlug, s, ro }: { sb: SupabaseClient; orgSlug: string; s: Settings; ro: boolean }) {
  const [welcome, setWelcome] = useState(s.welcome_message ?? "");
  const [closing, setClosing] = useState(s.closing_message ?? "");
  const sv = useSaver(sb, orgSlug);
  return (
    <Tile kicker="First and last screen" title="Messages">
      <Field label="Welcome · before question one">
        <textarea rows={3} value={welcome} onChange={(e) => setWelcome(e.target.value)} disabled={ro} maxLength={600} placeholder="Leave empty for the standard welcome" className={input} />
      </Field>
      <Field label="Closing · after the last answer">
        <textarea rows={3} value={closing} onChange={(e) => setClosing(e.target.value)} disabled={ro} maxLength={600} placeholder="Leave empty for the standard thank-you" className={input} />
      </Field>
      {!ro && <button disabled={sv.busy} onClick={() => sv.save({ welcome_message: welcome, closing_message: closing })} className={saveBtn}>{sv.busy ? "Saving…" : "Save"}</button>}
      <Feedback msg={sv.msg} err={sv.err} />
    </Tile>
  );
}

function DurationTile({ sb, orgSlug, s, ro, onSaved }: { sb: SupabaseClient; orgSlug: string; s: Settings; ro: boolean; onSaved: () => void }) {
  const [v, setV] = useState<"full" | "core">(s.item_set ?? "full");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function pick(next: "full" | "core") {
    setV(next);
    const { error } = await sb.rpc("org_set_duration", { p_org_slug: orgSlug, p_item_set: next });
    setErr(error?.message ?? null);
    setMsg(error ? null : "Saved — new respondents get this length.");
    if (!error) onSaved();
  }
  const opt = (k: "full" | "core", title: string, note: string) => (
    <button
      type="button"
      disabled={ro}
      aria-pressed={v === k}
      onClick={() => pick(k)}
      className={`flex flex-col items-start rounded-xl border px-4 py-3 text-left ${v === k ? "border-violet-deep bg-violet/10" : "border-rule-2 bg-plate hover:border-ink"} disabled:cursor-default`}
    >
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-[13px] text-ink-2">{note}</span>
    </button>
  );
  return (
    <Tile kicker="How long it takes" title="Duration">
      {opt("full", "Full · about 7 minutes", "Every question — the complete J12 reading plus Drivers and Journey.")}
      {opt("core", "Short · about 3 minutes", "The twelve core questions — one per cell — for camps and busy moments.")}
      <p className="text-[12.5px] text-ink-2">Applies to all your links. Answers already given keep the version they were given under.</p>
      <Feedback msg={msg} err={err} />
    </Tile>
  );
}

function LinksTile({ orgSlug, origin, name }: { orgSlug: string; origin: string; name: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const links = useMemo(
    () => [
      { key: "community", label: "Community · the people you reach", url: `${origin}/${orgSlug}` },
      { key: "public", label: "Public · everyone else", url: `${origin}/${orgSlug}/open` },
    ],
    [origin, orgSlug],
  );
  async function downloadQr(url: string, key: string) {
    const data = await QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: "M", color: { dark: "#22252b", light: "#ffffff" } });
    const a = document.createElement("a");
    a.href = data;
    a.download = `${orgSlug}-${key}-qr.png`;
    a.click();
  }
  return (
    <Tile kicker="Where people answer" title="Links & QR codes">
      {links.map((l) => (
        <div key={l.key} className="rounded-xl border border-rule px-3 py-2.5">
          <p className="text-[13px] font-semibold">{l.label}</p>
          <p className="truncate font-mono text-[12px] text-ink-2">{l.url.replace(/^https?:\/\//, "")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={async () => { await navigator.clipboard.writeText(l.url); setCopied(l.key); setTimeout(() => setCopied(null), 1500); }} className="rounded-md border border-rule-2 px-2.5 py-1 text-[12px] font-semibold hover:border-ink">{copied === l.key ? "Copied" : "Copy"}</button>
            <button onClick={() => downloadQr(l.url, l.key)} className="rounded-md border border-rule-2 px-2.5 py-1 text-[12px] font-semibold hover:border-ink">Download QR</button>
            <a href={`/${orgSlug}/dashboard/cards${l.key === "public" ? "?audience=public" : ""}`} className="rounded-md border border-rule-2 px-2.5 py-1 text-[12px] font-semibold text-ink no-underline hover:border-ink">Print cards</a>
          </div>
        </div>
      ))}
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        <b className="text-ink">Custom links:</b> “+ New link” makes a link with its own name and address — {origin.replace(/^https?:\/\//, "")}/{orgSlug}/l/<i>your-name</i> — and its own open and close times. Each one is a room in {name}&apos;s results.
      </p>
    </Tile>
  );
}

function LanguagesTile({ sb, orgSlug, s }: { sb: SupabaseClient; orgSlug: string; s: Settings }) {
  const available = instrument.locales as string[];
  const [lang, setLang] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function request() {
    if (!lang.trim()) return;
    const { error } = await sb.rpc("submit_consulting_question", {
      p_org_slug: orgSlug,
      p_prompt: `Translation request: please add ${lang.trim()} to the survey.${note.trim() ? ` ${note.trim()}` : ""}`,
      p_context: { tab: "org", view: "settings", summary: `${s.name} · survey settings · translation request (${lang.trim()})` },
    });
    if (error) setErr(error.message);
    else setSent(true);
  }
  return (
    <Tile kicker="Every string translatable" title="Languages">
      <div className="flex flex-wrap gap-1.5">
        {available.map((l) => (
          <span key={l} className="rounded-full bg-paper-deep px-3 py-1 text-[13px]">{LANGS[l] ?? l}</span>
        ))}
      </div>
      <p className="text-[12.5px] text-ink-2">Respondents choose their language on the first screen.</p>
      {sent ? (
        <p className="rounded-lg bg-green/10 px-3 py-2 text-[13.5px]">Request sent to the Collab. Translations are checked by a researcher before they go live, so meaning stays the same in every language.</p>
      ) : (
        <>
          <Field label="Request a language">
            <input value={lang} onChange={(e) => setLang(e.target.value)} placeholder="e.g. Portuguese (Brazil)" className={input} />
          </Field>
          <Field label="Anything we should know · optional">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. for a camp in March" className={input} />
          </Field>
          <button onClick={request} disabled={!lang.trim()} className={saveBtn}>Request translation</button>
          {err && <p className="text-[13px] text-vermillion">{err}</p>}
        </>
      )}
    </Tile>
  );
}

function StatusTile({ s }: { s: Settings }) {
  const live = s.status === "active";
  return (
    <Tile kicker="Right now" title="Status">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: live ? "rgb(var(--c-green))" : "rgb(var(--c-navy))" }} />
        {live ? "Collecting responses" : s.status === "pending" ? "Waiting for Collab approval" : s.status === "paused" ? "Paused" : "Closed"}
      </p>
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        {live
          ? "Every open link is live. A link outside its open and close times politely tells people it isn't open."
          : s.status === "pending"
            ? "Set up your links, look and messages now. The survey starts accepting answers once the Collab approves you."
            : "Your survey isn't accepting answers. Your results stay here."}
      </p>
      <div className="rounded-xl bg-paper-deep px-3 py-2.5 text-[13px] text-ink-2">
        Instrument <b className="text-ink">{instrument.version}</b> · {instrument.items.length} questions · anonymous · works offline
      </div>
    </Tile>
  );
}
