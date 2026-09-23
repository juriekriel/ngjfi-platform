/**
 * /[org]/manifest.webmanifest — a per-organisation web app manifest, so a
 * facilitator who installs the survey at a camp gets that organisation's
 * survey on the home screen, opening straight to it (and working offline via
 * public/sw.js). The platform-wide manifest (src/app/manifest.ts) still
 * covers every other page.
 *
 * Reads only public organisation fields (name, brand colour) with the
 * publishable anon key.
 */
export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: { org: string } }) {
  const org = params.org.toLowerCase().replace(/[^a-z0-9-]/g, "");
  let name = org;
  let colour = "#FF7A47";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key && org) {
    try {
      const r = await fetch(`${url}/rest/v1/organisations?short_name=eq.${org}&select=name,brand_color`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 3600 },
      });
      const rows = (await r.json()) as { name?: string; brand_color?: string | null }[];
      if (Array.isArray(rows) && rows[0]?.name) {
        name = rows[0].name;
        if (rows[0].brand_color && /^#[0-9a-fA-F]{6}$/.test(rows[0].brand_color)) colour = rows[0].brand_color;
      }
    } catch {
      /* fall back to the short name */
    }
  }
  const manifest = {
    id: `/${org}`,
    name: `${name} · survey`,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    description: `${name}'s survey — works with no signal once opened.`,
    start_url: `/${org}`,
    scope: `/${org}`,
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: colour,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
