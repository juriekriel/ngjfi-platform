"use client";

/**
 * "Add to home screen" — for the facilitator's phone at a camp, so the
 * survey opens like an app, with no signal, straight to this organisation.
 *
 * Android/Chrome: the browser's own install prompt, offered as a button.
 * iOS Safari: there is no prompt API, so a one-line instruction instead.
 * Already installed (standalone), or neither available: renders nothing.
 */
import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function InstallHint({ orgName }: { orgName: string }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return setDone(true);
    const ua = navigator.userAgent;
    setIos(/iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setDone(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (done || (!evt && !ios)) return null;

  return (
    <div className="mt-6 rounded-lg border border-rule bg-paper-deep px-3.5 py-3 text-[13px] leading-snug text-ink-2">
      <b className="text-ink">Running this at a camp?</b>{" "}
      {evt ? (
        <>
          Install {orgName}&apos;s survey on this phone so it opens with no signal.{" "}
          <button
            type="button"
            onClick={async () => {
              await evt.prompt();
              const r = await evt.userChoice;
              if (r.outcome === "accepted") setDone(true);
              setEvt(null);
            }}
            className="ml-1 font-semibold text-ink underline"
          >
            Install
          </button>
        </>
      ) : (
        <>Tap the Share button, then “Add to Home Screen”, so it opens with no signal.</>
      )}
    </div>
  );
}
