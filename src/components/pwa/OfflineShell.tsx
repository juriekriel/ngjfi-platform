"use client";

/**
 * Mounted once in the root layout. Two jobs:
 *   1. register the service worker (public/sw.js) in production, so pages a
 *      phone has opened once keep opening with no signal;
 *   2. keep draining the survey outbox from ANY page, so answers saved
 *      offline at a camp send the next time the site is open anywhere.
 * Renders nothing.
 */
import { useEffect } from "react";
import { startDraining } from "@/lib/outbox";

export default function OfflineShell() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    startDraining();
  }, []);
  return null;
}
