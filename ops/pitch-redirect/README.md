# Retire the old pitch site

`ngjfi-pitch-6-1.netlify.app` is a separate Netlify site (not built from this
repo). It still shows the v0 survey, the old name and invented headline
figures. This folder replaces it with a permanent redirect to
https://jfindx.org/pitch, which is generated from the live instrument.

1. Netlify → the site **ngjfi-pitch-6-1** → **Deploys**.
2. Drag this whole `ops/pitch-redirect` folder onto the deploy drop zone.
3. Check: opening https://ngjfi-pitch-6-1.netlify.app/anything lands on jfindx.org/pitch.

`_redirects` does the work (a 301 for every path); `index.html` is a fallback
for anything that ignores it.
