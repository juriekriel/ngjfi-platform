"use client";

/**
 * The Collab-facing view of the "what do we do with this?" repository an org
 * dashboard submits into (submit_consulting_question(), migration 0030). One
 * self-contained fetch against list_consulting_questions() — which does its
 * own admin/collab role check server-side (my_role()) — so this can drop
 * into the Collab console's existing Band C without touching that band's own
 * collab_worklist() load path.
 */
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { Rows, Row } from "@/components/console/Bands";

type Question = {
  id: string;
  org: { slug: string; short_name: string; name: string };
  prompt: string;
  created_at: string;
};

export default function ConsultingRepository() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [items, setItems] = useState<Question[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    sb.rpc("list_consulting_questions").then(({ data, error }) => {
      if (error) setErr(error.message);
      else setItems(data as Question[]);
    });
  }, [sb]);

  if (err) return <p className="mt-3 text-[13px] text-vermillion">{err}</p>;
  if (!items) return <p className="mt-3 text-[13px] text-muted">Loading…</p>;

  return (
    <div className="mt-5">
      <p className="figcap">&ldquo;What do we do with this?&rdquo; · {items.length} asked</p>
      {items.length === 0 ? (
        <p className="mt-2 text-[14px] text-ink-2">Nobody has asked yet.</p>
      ) : (
        <div className="mt-2">
          <Rows>
            {items.map((q) => (
              <Row
                key={q.id}
                label={q.prompt}
                meta={`${q.org.name} · ${new Date(q.created_at).toLocaleDateString()}`}
              />
            ))}
          </Rows>
        </div>
      )}
    </div>
  );
}
