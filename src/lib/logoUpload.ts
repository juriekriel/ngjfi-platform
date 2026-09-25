/**
 * Logo upload helpers — pure, no imports, unit-tested (tests/logoUpload.test.ts).
 * Storage rules live in migration 0037; these keep the client in step with them.
 */
export const LOGO_BUCKET = "org-logos";
export const LOGO_MAX_BYTES = 1024 * 1024; // matches the bucket's file_size_limit
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const; // no SVG — it can carry script
export const LOGO_MAX_PX = 512;

/** Where an organisation's logo is stored: <org id>/logo-<timestamp>.<ext>. */
export function logoPath(orgId: string, now: number, type: string): string {
  const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
  return `${orgId}/logo-${now}.${ext}`;
}

/**
 * The storage path of a logo we uploaded, from its public URL — or null for
 * any other address (an external logo the organisation pasted in is never
 * touched). Used to remove the previous logo after a successful replacement.
 */
export function ourLogoPath(url: string | null | undefined, orgId: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${LOGO_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  return path.startsWith(`${orgId}/`) && !path.includes("..") ? path : null;
}

/** Scale (w, h) down to fit within max × max, never up. */
export function fitWithin(w: number, h: number, max = LOGO_MAX_PX): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Why a chosen file can't be used, in plain words — or null if it's fine. */
export function logoProblem(file: { type: string; size: number }): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type))
    return file.type === "image/svg+xml"
      ? "SVG logos can't be uploaded — please use a PNG, JPG or WebP."
      : "Please choose a PNG, JPG or WebP image.";
  if (file.size > 10 * LOGO_MAX_BYTES) return "That image is over 10 MB — please choose a smaller one.";
  return null;
}
