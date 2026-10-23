"""
Builds the three shareable Jesus Index documents (front page "Pitch
documents" and the dashboard's "Share about the Jesus Index"):
  public/share/JesusIndex-leadership-pitch.pdf  (16:9 deck)
  public/share/JesusIndex-two-pager.pdf         (16:9, 2 pages)
  public/share/JesusIndex-pitch-and-demo.pdf    (16:9 deck)

Style: the DFW pilot deck (Oct 2026) — Inter Tight heavy headlines, dark cover
and closing slides, coral → violet as the one gradient, rounded cards, tracked
coral eyebrows, JetBrains Mono for figures, the serif lockup only for the name.

Content is drawn only from what the platform actually does (CLAUDE.md, the
live instrument, the dashboards as built, the privacy notice and the consent
resource at jfindx.org/resources/consent) — no invented statistics. The one
dashboard figure shown is labelled "Demo figures". The sample question and its
answer labels are read from the LIVE instrument (src/lib/instrument.ts imports
the same file) and the build fails if the survey length in the copy drifts
from it ("About 8 minutes" today).

The mark is public/icon-mark.svg itself, inlined (its own linearGradient), so
the PDFs carry the real logo. Fonts are the brand fonts (OFL), committed under
scripts/share/fonts so the build needs no network.

Re-run after any change to the above:
  pip install weasyprint==63.1     # once
  python3 scripts/build-share-docs.py
"""
import html, json, re
from pathlib import Path
from weasyprint import HTML

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "scripts" / "share" / "fonts"
OUT = ROOT / "public" / "share"

# ── facts from the live instrument ────────────────────────────────────────────
LIVE = re.search(r'from "@/data/instrument\.(v\d+)\.json"', (ROOT / "src/lib/instrument.ts").read_text()).group(1)
INST = json.loads((ROOT / f"src/data/instrument.{LIVE}.json").read_text())
FULL_MIN = INST["item_sets"]["full"].get("welcome_minutes", INST["welcome_minutes"])
J12_MIN = INST["item_sets"]["j12"].get("welcome_minutes", FULL_MIN)
LENGTH_COPY = "About 8 minutes"
assert LENGTH_COPY == f"About {FULL_MIN} minutes", f"the instrument now says {FULL_MIN} minutes: update LENGTH_COPY and the copy that uses it"
EN = json.loads((ROOT / "src/data/i18n/en.json").read_text())["ui"]
LIKERT = [EN[f"likert_{n}"] for n in range(1, 6)]
SAMPLE = next(i for i in INST["items"] if i["key"] == "follow_multiplication_external")["text"]["en"]
AGES = [o["text"]["en"] for o in next(i for i in INST["items"] if i["key"] == "age_band")["options"]]
assert AGES[0] == "12 or younger" and AGES[-1] == "31 or older", "the age exits changed: update the 'Who takes part' copy"

# The mark is public/icon-mark.svg: its disc is a linearGradient (#FF7A47 → #8B5CF6),
# which WeasyPrint's SVG renderer drops, so the disc is drawn in CSS with the same
# gradient and the SVG's own white line and cross are laid on top of it.
_svg = (ROOT / "public/icon-mark.svg").read_text()
_svg = _svg[_svg.index("<svg"):]
_svg = re.sub(r"<defs>.*?</defs>", "", _svg, flags=re.S)
_svg = re.sub(r'<circle[^>]*url\(#g1\)[^>]*/>', "", _svg)
assert "url(#" not in _svg, "icon-mark.svg changed shape: update the mark here"
MARK = f'<div class="mark">{_svg}</div>'
QR = (ROOT / "public/share/jfindx-qr.png").as_uri()

# The J12 phrases (src/lib/model.ts MATRIX_PHRASE).
J12_ROWS = [("Follow", "personal faith"), ("Mission", "outward"), ("World", "lived impact")]
J12_COLS = ["Exposure", "Response", "Formation", "Multiplication"]
J12_WORDS = [["heard of Jesus", "believes in Jesus", "being shaped", "helps others believe"],
             ["aware of the call", "convinced it's theirs", "practising witness", "mobilising others"],
             ["sees faith should matter", "believes faith matters", "choices reshaped", "changing their spheres"]]

e = html.escape

# ── style ──────────────────────────────────────────────────────────────────────
def font_faces():
    out = []
    for w in (400, 500, 600, 700, 800, 900):
        out.append(f"@font-face{{font-family:'Inter Tight';font-weight:{w};src:url('{(FONTS/f'inter-tight-latin-{w}-normal.woff').as_uri()}')}}")
    for w in (400, 500, 700):
        out.append(f"@font-face{{font-family:'JetBrains Mono';font-weight:{w};src:url('{(FONTS/f'jetbrains-mono-latin-{w}-normal.woff').as_uri()}')}}")
    out.append(f"@font-face{{font-family:'Newsreader';font-style:normal;src:url('{(FONTS/'newsreader-latin-400-normal.woff').as_uri()}')}}")
    out.append(f"@font-face{{font-family:'Newsreader';font-style:italic;src:url('{(FONTS/'newsreader-latin-400-italic.woff').as_uri()}')}}")
    return "\n".join(out)

CSS = font_faces() + """
@page { size: 1456px 819px; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter Tight', Arial, sans-serif; color: #22252b; }
.s { width: 1456px; height: 819px; position: relative; overflow: hidden; background: #f5f6f8;
     padding: 100px 97px 0; page-break-after: always; }
.s:last-child { page-break-after: auto; }
.dark { background: #22252b; color: #f5f6f8; }
.bar { position: absolute; top: 0; left: 0; right: 0; height: 9px; background: linear-gradient(90deg, #ff7a47, #8b5cf6); }
.eyebrow { font-weight: 700; font-size: 19px; letter-spacing: .14em; text-transform: uppercase; color: #c2410c; }
.dark .eyebrow { color: #ffb48f; }
h1 { font-weight: 800; font-size: 60px; line-height: 1.04; letter-spacing: -.035em; margin-top: 30px; max-width: 1180px; }
h1.xl { font-size: 92px; line-height: 1.02; letter-spacing: -.04em; }
h1.md { font-size: 52px; }
.hl { color: #ff9466; }
.lead { font-size: 25px; line-height: 1.38; color: #5b6270; margin-top: 22px; max-width: 1100px; }
.dark .lead { color: #c9ced8; }
.foot { position: absolute; left: 97px; bottom: 50px; font-size: 18px; color: #6b7280; }
.dark .foot { color: #9aa1ad; }
.pno { position: absolute; right: 97px; bottom: 50px; font-family: 'JetBrains Mono'; font-size: 15px; color: #9aa1ad; }
.word { font-family: 'Newsreader', Georgia, serif; font-size: 44px; letter-spacing: -.01em; }
.word i { font-style: italic; }
.tag { font-weight: 700; font-size: 18px; letter-spacing: .16em; text-transform: uppercase; color: #9aa1ad; margin-top: 10px; }
.lock { display: flex; align-items: center; }
.mark { flex: 0 0 auto; width: 56px; height: 56px; border-radius: 28px; margin-right: 18px;
        background: linear-gradient(135deg, #ff7a47, #8b5cf6); }
.mark svg { display: block; width: 56px; height: 56px; }
.pill { display: inline-block; padding: 15px 22px; border-radius: 28px; font-weight: 800; font-size: 21px; color: #fff;
        background: linear-gradient(90deg, #ff7a47, #8b5cf6); }
.row { display: flex; gap: 24px; }
/* Flex rows with explicit widths: WeasyPrint sizes these reliably (its grid
   mis-measures rows whose text wraps). Gutters are margins, not gap. */
/* The content box is a fixed 1262px (1456 - 2 × 97), so widths are exact pixels. */
.grid4, .grid3, .grid2 { display: flex; flex-wrap: wrap; margin-top: 46px; }
.grid3, .grid2 { margin-top: 40px; }
.grid4 > * { flex: 0 0 297px; width: 297px; margin: 0 24px 24px 0; }
.grid3 > * { flex: 0 0 404px; width: 404px; margin: 0 24px 24px 0; }
.grid2 > * { flex: 0 0 619px; width: 619px; margin: 0 24px 24px 0; }
.grid4 > *:nth-child(4n), .grid3 > *:nth-child(3n), .grid2 > *:nth-child(2n) { margin-right: 0; }
.grid2.w458 > * { flex-basis: 217px; width: 217px; }
.grid2.w612 > * { flex-basis: 294px; width: 294px; }
.grid3.w760 > * { flex-basis: 237px; width: 237px; }
.tight > * { margin-bottom: 12px; }
.card { background: #fff; border: 1px solid #e2e5ea; border-radius: 20px; padding: 30px 30px; }
.card.soft { background: #eceef2; border: 0; }
.card.grad { background: linear-gradient(135deg, #ff7a47, #8b5cf6); color: #fff; border: 0; }
.dark .card { background: #2e323a; border: 0; color: #f5f6f8; }
.card .k { font-size: 20px; color: #5b6270; }
.card.grad .k { color: #fff; }
.card .t { font-weight: 800; font-size: 34px; letter-spacing: -.02em; margin-top: 8px; line-height: 1.08; }
.card h3 { font-weight: 800; font-size: 26px; letter-spacing: -.015em; line-height: 1.15; }
.card p { font-size: 19.5px; line-height: 1.4; color: #5b6270; margin-top: 10px; }
.dark .card p { color: #b9bfca; }
.card.grad p { color: #fff; }
.edge-coral { border-color: #c2410c; } .edge-violet { border-color: #8b5cf6; } .edge-ink { border-color: #22252b; } .edge-peach { border-color: #ff9466; }
.stat { border-top: 5px solid #ff7a47; padding-top: 26px; }
.stat .n { font-family: 'JetBrains Mono'; font-size: 52px; font-weight: 500; }
.stat .l { font-size: 21px; color: #5b6270; margin-top: 10px; }
.chip { display: inline-block; background: #fff; border: 1px solid #e2e5ea; border-radius: 32px; padding: 15px 24px;
        font-weight: 700; font-size: 22px; margin: 0 14px 14px 0; }
.stage { border-radius: 20px; padding: 30px 28px; min-height: 240px; }
.stage .k { font-family: 'JetBrains Mono'; font-size: 19px; }
.stage .t { font-weight: 800; font-size: 36px; letter-spacing: -.025em; margin-top: 12px; }
.stage p { font-size: 20px; line-height: 1.4; margin-top: 12px; color: #3a3f48; }
.st1 { background: #fdeee5; } .st1 .k { color: #a8360b; }
.st2 { background: #fddac8; } .st2 .k { color: #a8360b; }
.st3 { background: #ece5fc; } .st3 .k { color: #5b21b6; }
.st4 { background: linear-gradient(135deg, #ff7a47, #8b5cf6); color: #fff; } .st4 p { color: #fff; }
.success { margin-top: 40px; font-weight: 700; font-size: 20px; letter-spacing: .14em; text-transform: uppercase; }
.success span { color: #8b5cf6; }
.ic { display: block; width: 30px; height: 30px; margin-bottom: 14px; }
table.j12 { border-collapse: separate; border-spacing: 8px; margin-top: 26px; margin-left: -8px; }
table.j12 th { font-weight: 700; font-size: 16px; letter-spacing: .12em; text-transform: uppercase; color: #5b6270; text-align: center; padding-bottom: 4px; }
table.j12 td.rh { width: 210px; font-weight: 800; font-size: 26px; padding-right: 10px; }
table.j12 td.rh span { display: block; font-weight: 400; font-size: 17px; color: #5b6270; }
table.j12 td.c { width: 248px; height: 96px; border-radius: 16px; text-align: center; font-size: 20px; font-weight: 600; padding: 10px; }
.c0 { background: #fdeee5; } .c1 { background: #fddac8; } .c2 { background: #ff9466; color: #fff; } .c3 { background: linear-gradient(135deg, #ff7a47, #8b5cf6); color: #fff; }
.steps { margin-top: 36px; }
.step { display: flex; gap: 22px; margin-bottom: 26px; }
.step .num { flex: 0 0 auto; width: 46px; border-radius: 12px; background: linear-gradient(160deg, #ff7a47, #8b5cf6);
             color: #fff; font-weight: 800; font-size: 24px; text-align: center; padding-top: 10px; min-height: 96px; }
.step.compact .num { min-height: 46px; height: 46px; padding-top: 9px; }
.step h3 { font-weight: 800; font-size: 28px; letter-spacing: -.015em; }
.step p { font-size: 21px; line-height: 1.4; color: #5b6270; margin-top: 4px; }
.dark .step h3 { color: #fff; } .dark .step p { color: #c9ced8; }
.phone { width: 318px; min-width: 318px; height: 640px; border: 13px solid #22252b; border-radius: 44px; background: #fff; overflow: hidden; position: relative; }
.phone .in { padding: 26px 24px; }
.phone .top { background: #22252b; color: #fff; padding: 24px 24px 20px; }
.phone .top b { font-size: 22px; font-weight: 800; display: block; }
.phone .top span { font-size: 16px; color: #c9ced8; }
.phone .lab { font-weight: 700; font-size: 16px; margin: 14px 0 6px; }
.phone .field { border: 2px solid #d5d9e0; border-radius: 10px; padding: 11px 12px; font-size: 16px; color: #8a909b; }
.phone .btn { border-radius: 12px; padding: 14px; text-align: center; font-weight: 800; font-size: 18px; margin-top: 12px; }
.phone .btn.ink { background: #22252b; color: #fff; } .phone .btn.line { border: 2px solid #d5d9e0; }
.phone .btn.grad { background: linear-gradient(90deg, #ff7a47, #8b5cf6); color: #fff; }
.phone .opt { border: 2px solid #d5d9e0; border-radius: 10px; padding: 10px 12px; font-size: 15.5px; margin-top: 8px; }
.phone .opt.on { background: #22252b; color: #fff; border-color: #22252b; }
.phone .q { font-weight: 800; font-size: 20px; line-height: 1.28; margin-top: 10px; }
.phone .sq { color: #6d28d9; font-weight: 700; font-size: 15px; margin-top: 4px; }
.phone .gbar { height: 7px; border-radius: 4px; background: linear-gradient(90deg, #ff7a47, #8b5cf6); margin-top: 12px; }
.phone .tile { background: #f5f6f8; border-radius: 14px; padding: 16px; margin-top: 12px; }
.phone .tile .n { font-family: 'JetBrains Mono'; font-size: 38px; }
.phone .tile small { font-size: 14.5px; color: #5b6270; display: block; }
.phone .demo { font-size: 15px; color: #6b7280; margin-top: 12px; }
.phone .url { font-family: 'JetBrains Mono'; background: #f1f2f5; border-radius: 10px; padding: 12px; font-size: 16px; margin-top: 12px; }
.bars div { height: 13px; border-radius: 7px; background: linear-gradient(90deg, #ff7a47, #8b5cf6); margin-top: 8px; }
.split { display: flex; }
.split > .l { flex: 0 0 560px; width: 560px; margin-right: 60px; }
.phones { display: flex; flex: 0 0 auto; margin-top: -20px; }
.phones .phone { flex: 0 0 318px; margin-right: 30px; }
.cols2 { display: flex; margin-top: 34px; }
.cols2 > div { flex: 0 0 600px; width: 600px; margin-right: 62px; }
.timeline { display: flex; margin-top: 60px; border-top: 3px solid; border-image: linear-gradient(90deg, #ff7a47, #8b5cf6) 1; }
.timeline > div { flex: 1; padding: 22px 18px 0 0; position: relative; }
.timeline > div:before { content: ''; position: absolute; top: -13px; left: 0; width: 22px; height: 22px; border-radius: 11px; background: #ff9466; }
.timeline .d { font-family: 'JetBrains Mono'; font-size: 20px; color: #ffb48f; }
.timeline .w { font-size: 21px; line-height: 1.35; margin-top: 8px; color: #e8eaee; }
.timeline .m { font-family: 'JetBrains Mono'; font-size: 17px; color: #9aa1ad; margin-top: 6px; }
.qr { width: 380px; background: #fff; border-radius: 26px; padding: 26px; text-align: center; border: 5px solid; border-image: none;
      box-shadow: 0 0 0 5px #ff7a47; }
.qr img { width: 280px; height: 280px; }
.qr b { display: block; color: #22252b; font-weight: 800; font-size: 24px; margin-top: 10px; }
.qr span { display: block; color: #5b6270; font-family: 'JetBrains Mono'; font-size: 17px; margin-top: 4px; }
.people .card { padding: 20px 24px; }
.goal { text-align: center; padding-top: 250px; }
.goal .q { font-family: 'Newsreader', Georgia, serif; font-size: 66px; line-height: 1.22; max-width: 1150px; margin: 0 auto; }
.goal .q i { font-style: italic; }
.goal .rule { width: 180px; height: 6px; border-radius: 3px; margin: 44px auto 34px; background: linear-gradient(90deg, #ff7a47, #8b5cf6); }
.goal .by { font-size: 22px; color: #6b7280; }
.small { font-size: 18px; line-height: 1.45; color: #5b6270; }
.note { margin-top: 26px; font-size: 19px; color: #5b6270; }
"""

ICON = {
 "lock": '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
 "group": '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c.2-2.6 1.6-4.6 4-4.6 1.4 0 2 .4 2 .4"/></svg>',
 "home": '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.8"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
 "check": '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.8"><path d="M12 2.5l2.4 1.8 3 .1.9 2.9 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.9-3 .1L12 21.5l-2.4-1.8-3-.1-.9-2.9-2.4-1.8.9-2.9-.9-2.9 2.4-1.8.9-2.9 3-.1z"/><path d="m8.5 12 2.3 2.3 4.7-4.6"/></svg>',
 "eye": '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
 "clock": '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
}

# ── building blocks ────────────────────────────────────────────────────────────
class Deck:
    def __init__(self, footer):
        self.footer, self.slides = footer, []
    def add(self, body, dark=False, bar=False, foot=True):
        n = len(self.slides) + 1
        f = f'<div class="foot">{e(self.footer)}</div><div class="pno">{n:02d}</div>' if foot else ""
        self.slides.append(f'<section class="s{" dark" if dark else ""}">{"<div class=bar></div>" if bar else ""}{body}{f}</section>')
    def write(self, name, title):
        doc = f'<!doctype html><html><head><meta charset="utf-8"><title>{e(title)}</title><style>{CSS}</style></head><body>{"".join(self.slides)}</body></html>'
        out = OUT / name
        HTML(string=doc, base_url=str(ROOT)).write_pdf(out, metadata={"title": title})
        print(f"{out.relative_to(ROOT)} · {len(self.slides)} pages")
        return len(self.slides)

def lockup(dark=True):
    return f'<div class="lock">{MARK}<div><div class="word">The <i>Jesus</i> Index</div><div class="tag">A global measure of Jesus-following</div></div></div>'

def cover(d, headline, sub, pill, meta):
    d.add(f'''{lockup()}
      <h1 class="xl" style="margin-top:118px">{headline}</h1>
      <p class="lead" style="margin-top:28px">{sub}</p>
      <div style="position:absolute;left:97px;bottom:96px">
        <span class="pill" style="margin-right:22px">{e(pill)}</span><span style="font-size:21px;color:#c9ced8">{e(meta)}</span></div>''',
        dark=True, bar=True, foot=False)

def opportunity(d, who="Thirty-plus ministries, and the churches around them, love young people"):
    d.add(f'''<div class="eyebrow">The opportunity</div>
      <h1>{e(who)}. We&rsquo;ve never had one shared way to see the fruit.</h1>
      <div class="grid4">
        <div class="card" style="min-height:230px"><div class="k">We tend to count</div><div class="t">Attendance</div></div>
        <div class="card" style="min-height:230px"><div class="k">We tend to count</div><div class="t">Events</div></div>
        <div class="card" style="min-height:230px"><div class="k">We tend to trust</div><div class="t">A gut feeling</div></div>
        <div class="card grad" style="min-height:230px"><div class="k">We actually want to see:</div><div class="t">Are they following Jesus?</div></div>
      </div>''')

def what_is(d):
    d.add(f'''<div class="eyebrow">What is the Jesus Index?</div>
      <h1>A short, anonymous survey young people take on their own phones, and a dashboard that shows you what it means.</h1>
      <div class="grid4" style="margin-top:52px">
        <div class="stat"><div class="n">&asymp;{FULL_MIN} min</div><div class="l">the full survey &middot; &asymp;{J12_MIN} for the J12 only</div></div>
        <div class="stat" style="border-color:#ff9466"><div class="n">13&ndash;30</div><div class="l">the ages it measures</div></div>
        <div class="stat" style="border-color:#b98af7"><div class="n">100%</div><div class="l">anonymous &middot; no names, ever</div></div>
        <div class="stat" style="border-color:#8b5cf6"><div class="n">$0</div><div class="l">to run it, for any ministry</div></div>
      </div>
      <div style="margin-top:44px"><span class="chip">Do they follow Jesus?</span><span class="chip">Do they join His mission?</span><span class="chip">Does their world look different because of Him?</span></div>''')

def stages(d):
    d.add('''<div class="eyebrow">What we long to see</div>
      <h1>Young people who follow Jesus, and help others do the same.</h1>
      <div class="grid4">
        <div class="stage st1"><div class="k">Stage 1</div><div class="t">Exposure</div><p>Hears of Jesus and senses faith should matter</p></div>
        <div class="stage st2"><div class="k">Stage 2</div><div class="t">Response</div><p>Believes, and owns the call personally</p></div>
        <div class="stage st3"><div class="k">Stage 3</div><div class="t">Formation</div><p>Is being shaped, practises witness, makes new choices</p></div>
        <div class="stage st4"><div class="k">Stage 4 &middot; the goal</div><div class="t">Multiplication</div><p>Helps others believe and changes the world around them</p></div>
      </div>
      <div class="success">Our measure of success: <span>Jesus-following that multiplies.</span></div>''')

def j12(d):
    head = "".join(f"<th>{c}</th>" for c in J12_COLS)
    rows = "".join(
        f'<tr><td class="rh">{r}<span>{g}</span></td>' + "".join(f'<td class="c c{j}">{e(J12_WORDS[i][j])}</td>' for j in range(4)) + "</tr>"
        for i, (r, g) in enumerate(J12_ROWS))
    d.add(f'''<div class="eyebrow">The model &middot; the J12</div>
      <h1 class="md">Three questions. Four stages. Twelve cells.</h1>
      <p class="lead" style="font-size:22px;margin-top:14px">The three questions are <b>what</b> we measure; the four stages are <b>how deep</b> it has gone. Every scored question sits in one cell. Read across a row to see where young people stop moving.</p>
      <table class="j12"><tr><th></th>{head}</tr>{rows}</table>''')

def safe(d):
    d.add(f'''<div class="eyebrow">Safe by design</div>
      <h1>Your young people are protected. Your results stay yours.</h1>
      <div class="grid4">
        <div class="card soft">{ICON["lock"]}<h3>Fully anonymous</h3><p>No names, emails, phone numbers, birthdays or IP addresses stored with answers. Age is a band.</p></div>
        <div class="card soft">{ICON["group"]}<h3>Groups only</h3><p>You never see one person&rsquo;s answers. No score shows under 10 people.</p></div>
        <div class="card soft">{ICON["home"]}<h3>Your name on it</h3><p>Young people see your ministry&rsquo;s name, colour and logo, not ours.</p></div>
        <div class="card soft">{ICON["check"]}<h3>Consent built in</h3><p>Confirmed for your ministry and for every survey. Parental consent for 13&ndash;17s is gathered and held by you.</p></div>
      </div>
      <p class="note">Under 13 or over 30? The survey thanks them at the first question and keeps nothing. Consent guide, parent letter and script: <b>jfindx.org/resources/consent</b></p>''')

def gives(d):
    d.add('''<div class="eyebrow">What it gives your ministry</div>
      <h1>Know your young people, not just your numbers.</h1>
      <div class="grid3">
        <div class="card edge-coral"><h3>See past attendance</h3><p>Are they believing, praying, reading Scripture and sharing their faith?</p></div>
        <div class="card edge-ink"><h3>Spot where they&rsquo;re stuck</h3><p>Maybe they believe but never share. The journey view shows the gap.</p></div>
        <div class="card edge-violet"><h3>A clear next step</h3><p>&ldquo;What does this mean?&rdquo; puts your question to a Collab facilitator.</p></div>
        <div class="card edge-violet"><h3>Hear from the searching</h3><p>Those not yet following Jesus get their own questions, reported separately.</p></div>
        <div class="card edge-peach"><h3>Watch growth over time</h3><p>Run it again next year and see what God is growing.</p></div>
        <div class="card edge-ink"><h3>Learn with your peers</h3><p>Compare with the pooled picture as more ministries join, without exposing anyone.</p></div>
      </div>''')

def phone_join():
    return f'''<div class="phone"><div class="in"><div class="word" style="font-size:22px">The <i>Jesus</i> Index</div>
      <div style="font-weight:800;font-size:28px;margin-top:18px">Join, free</div>
      <div class="lab">Your ministry email</div><div class="field">you@church.org</div>
      <div class="lab">Organisation</div><div class="field">e.g. Northside Church</div>
      <div class="lab">Your role</div><div class="field">e.g. Youth pastor</div>
      <div class="btn grad" style="margin-top:72px">Join &rarr;</div></div></div>'''

def phone_page():
    return f'''<div class="phone"><div class="top"><b>Northside Students</b><span>Your ministry, your brand</span></div>
      <div class="in"><div style="font-weight:800;font-size:28px;line-height:1.1">Your page is ready</div>
      <div class="url">jfindx.org/northside</div>
      <div class="btn ink">Full survey &middot; &asymp;{FULL_MIN} min</div>
      <div class="btn line">J12 only &middot; &asymp;{J12_MIN} min</div>
      <div style="font-size:16px;margin-top:16px"><span style="color:#3f9d72">&#10003;</span> Consent confirmed by your ministry</div>
      <div class="demo">Demo ministry</div></div></div>'''

def phone_question():
    opts = "".join(f'<div class="opt{" on" if n == 3 else ""}">{e(l)}</div>' for n, l in enumerate(LIKERT))
    return f'''<div class="phone"><div class="in"><div style="font-weight:800;font-size:19px">Northside Students</div><div class="gbar"></div>
      <div class="sq" style="margin-top:20px">A real question from the survey</div><div class="q">{e(SAMPLE)}</div>{opts}</div></div>'''

def phone_dash():
    return '''<div class="phone"><div class="in"><div style="font-weight:800;font-size:21px">Your dashboard</div>
      <div class="tile"><small>J12 index</small><div class="n">3.4 <span style="color:#8a909b">/ 5</span></div><small>86 young people &middot; of those who completed it</small></div>
      <div class="tile"><small>The journey</small><div class="bars"><div style="width:100%"></div><div style="width:86%"></div><div style="width:64%"></div><div style="width:42%"></div></div></div>
      <div class="tile"><b style="color:#c2410c;font-size:16px">What does this mean?</b><small style="margin-top:4px;color:#22252b">Ask a Collab facilitator about the view you&rsquo;re on.</small></div>
      <div class="demo">Demo figures</div></div></div>'''

def how1(d):
    d.add(f'''<div class="split"><div class="l"><div class="eyebrow" style="margin-top:60px">How it works &middot; 1 of 2</div>
      <h1 class="md">From &ldquo;I&rsquo;m interested&rdquo; to your own page.</h1>
      <div class="steps">
        <div class="step"><div class="num">1</div><div><h3>Join, free</h3><p>At jfindx.org/join: your ministry email, organisation and role. Sign in by email link, no password.</p></div></div>
        <div class="step"><div class="num">2</div><div><h3>Set up, with help</h3><p>Your logo, colour and welcome. Confirm consent, then press &ldquo;+ Start a new survey&rdquo; for each group.</p></div></div>
      </div></div><div class="phones">{phone_join()}{phone_page()}</div></div>''')

def how2(d):
    d.add(f'''<div class="split"><div class="l"><div class="eyebrow" style="margin-top:60px">How it works &middot; 2 of 2</div>
      <h1 class="md">From one youth night to a clear next step.</h1>
      <div class="steps">
        <div class="step"><div class="num">3</div><div><h3>Your people take it</h3><p>One question per screen on their own phone. Anonymous, and it keeps working on a weak signal.</p></div></div>
        <div class="step"><div class="num">4</div><div><h3>You see your dashboard</h3><p>Where they&rsquo;re strong, where they&rsquo;re stuck, and help turning it into a next step.</p></div></div>
      </div></div><div class="phones">{phone_question()}{phone_dash()}</div></div>''')

def walls(d):
    d.add('''<div class="eyebrow">Why a shared measure</div>
      <h1>Same mission. Same questions. A different way of measuring.</h1>
      <p class="lead">A single central study across fifty countries hit three walls. A shared measure that every ministry runs for itself goes around all three.</p>
      <div class="grid3">
        <div class="card"><h3>The under-18 wall</h3><p>Most Collab ministries work with under-18s. Collecting minors&rsquo; data centrally across many countries needs ethics infrastructure we don&rsquo;t have. Run at the edge, consent stays with each ministry.</p></div>
        <div class="card"><h3>The money wall</h3><p>The Global Flourishing Study covers 22 countries and cost about $43M. Our ~$1M would buy roughly one country for seven years, not fifty.</p></div>
        <div class="card"><h3>The quality wall</h3><p>A global study on a small budget means ad-hoc sampling we can&rsquo;t compare year to year. One instrument, used the same way everywhere, can be.</p></div>
      </div>''')

def pattern(d):
    d.add('''<div class="eyebrow">A proven pattern</div>
      <h1>The missing leg of Collective Impact.</h1>
      <p class="lead">Stanford&rsquo;s Collective Impact names five conditions a coalition needs. The Collab has four. The Index builds the fifth: <b>shared measurement</b>.</p>
      <div class="grid3">
        <div class="card"><h3>Gallup Q12</h3><p>Twelve questions in a four-level hierarchy, run by organisations across 50+ industries and benchmarked against a global database.</p></div>
        <div class="card"><h3>Global Flourishing Study</h3><p>Harvard, Baylor and Gallup: a shared index across 22 countries. The model of a common measure, if not the budget.</p></div>
        <div class="card"><h3>World Vision &middot; Hope &amp; Love</h3><p>A validated tool measuring how children experience God&rsquo;s love, released in 2025. The faith sector already does this.</p></div>
      </div>''')

def road(d):
    phases = [("2026", "Build &amp; baseline", "$120K"), ("2027", "Prove the model", "$180K"), ("2028&ndash;29", "Scale", "$320K"),
              ("2030&ndash;31", "Trend lines", "$240K"), ("2032&ndash;33", "The standard", "$140K")]
    tl = "".join(f'<div><div class="d">{y}</div><div class="w">{w}</div><div class="m">{m}</div></div>' for y, w, m in phases)
    d.add(f'''<div class="eyebrow">Who does what &middot; the road to 2033</div>
      <h1 style="color:#fff">One measure, owned by everyone. About $1M through 2033.</h1>
      <div class="grid4" style="margin-top:40px">
        <div class="card"><h3>The Collab</h3><p>Owns the project, the relationships and the people.</p></div>
        <div class="card"><h3>NXT Move</h3><p>The Collab&rsquo;s appointed backbone organisation; stewards the Index.</p></div>
        <div class="card"><h3>Eido Research</h3><p>The survey and intelligence engine.</p></div>
        <div class="card"><h3>Every ministry</h3><p>Runs it free, keeps its own results, adds to the shared picture.</p></div>
      </div>
      <div class="timeline">{tl}</div>''', dark=True)

def invite(d, steps):
    # No nested flex here: WeasyPrint drops content from a wrapping flex row
    # inside a flex item. The QR sits absolutely; the link cards are inline blocks.
    st = "".join(f'<div class="step compact"><div class="num">{n}</div><div><p style="color:#fff;font-size:23px;margin-top:8px"><b>{a}</b> {b}</p></div></div>' for n, (a, b) in enumerate(steps, 1))
    links = [("Join", "jfindx.org/join"), ("See a Demo", "jfindx.org/see-a-demo"), ("Consent guide", "jfindx.org/resources/consent")]
    lc = "".join(f'<div class="card" style="display:inline-block;vertical-align:top;width:236px;margin-right:16px;padding:18px 20px"><h3 style="font-size:21px">{a}</h3><p style="font-size:15.5px">{b}</p></div>' for a, b in links)
    d.add(f'''<div style="width:780px;margin-top:40px">
      <div class="eyebrow">An invitation, not an obligation</div>
      <h1 style="color:#fff">Would you explore this with us?</h1>
      <div class="steps">{st}</div>
      <div style="margin-top:10px">{lc}</div></div>
      <div class="qr" style="position:absolute;right:97px;top:170px"><img src="{QR}"><b>Scan: jfindx.org</b><span>free for every ministry</span></div>''',
      dark=True, bar=True)

def goal(d):
    d.add('''<div class="goal"><div class="q">To see every young person have a real opportunity to <i>follow Jesus</i> by 2033.</div>
      <div class="rule"></div><div class="by">The Jesus Index &middot; stewarded by NXT Move for the Next Gen Global Collab &middot; jfindx.org</div></div>''', foot=False)

def demo1(d):
    steps = [("Sign in", "On the laptop go to jfindx.org &rarr; &ldquo;Sign in&rdquo;. Enter your ministry email and open the link from the newest email; it works on any device."),
             ("Show the dashboard", "Point out the figures and the J12 matrix. The dashes mean there aren&rsquo;t enough answers yet: that&rsquo;s the privacy floor at work."),
             ("Start a survey", "Click &ldquo;+ Start a new survey&rdquo;. Name it (&ldquo;Demo&rdquo;), tick Test link, choose J12 or Full survey, add a welcome, and save."),
             ("Hold up the QR", "On the new card click &ldquo;QR&rdquo;. A test link works before consent; its answers are kept apart and deleted after 7 days.")]
    st = [f'<div class="step"><div class="num">{n}</div><div><h3>{a}</h3><p>{b}</p></div></div>' for n, (a, b) in enumerate(steps, 1)]
    d.add(
      f'''<div class="eyebrow">Run the demo &middot; part one, about 10 minutes</div>
      <h1 class="md">Set up, live, in front of them.</h1>
      <p class="lead" style="font-size:22px">Have a laptop to present from and a phone to answer on. For a no-risk walkthrough with invented figures, open jfindx.org/see-a-demo.</p>
      <div class="cols2"><div>{st[0]}{st[1]}</div><div>{st[2]}{st[3]}</div></div>''')

def demo2(d):
    steps = [("Answer on the phone", "Scan the QR. Point out your colour, name and welcome, one question per screen, and the anonymity promise. Switch to airplane mode halfway: it keeps working."),
             ("Reload the laptop", "The test card&rsquo;s count goes up. Test answers never reach a score; on a real survey a score appears once 10 people have answered."),
             ("Show the views", "Toggle the J12 matrix, the Unengaged matrix and the heat map. Open &ldquo;Edit your dashboard&rdquo;, then Collab Intelligence for the pooled picture."),
             ("Ask &ldquo;What does this mean?&rdquo;", "Pick a suggested question. It goes to a Collab facilitator with the view attached: that&rsquo;s where a score becomes a strategy.")]
    st = [f'<div class="step"><div class="num">{n}</div><div><h3>{a}</h3><p>{b}</p></div></div>' for n, (a, b) in enumerate(steps, 5)]
    d.add(f'''<div class="eyebrow">Run the demo &middot; part two</div>
      <h1 class="md">Answer, read, ask.</h1>
      <p class="lead" style="font-size:22px">At the bottom of the dashboard, &ldquo;Share about the Jesus Index&rdquo; has these documents and the QR code. Consent materials: jfindx.org/resources/consent.</p>
      <div class="cols2"><div>{st[0]}{st[1]}</div><div>{st[2]}{st[3]}</div></div>''')

def promises(d):
    items = [("Of those who completed it", "Results describe the people who answered, never a whole population. Every score shows how many people it rests on."),
             ("Nothing that points at a person", "No score under 10 people. No city or area under 400, no country under 2,000."),
             ("Aggregates only", "No organisation sees an individual&rsquo;s answers, including its own young people&rsquo;s."),
             ("Kept only as long as needed", "Identifying details removed after 60 days; cleaned answers kept up to 5 years, then only grouped totals."),
             ("Consent before collection", "Confirmed for the organisation and for every survey. No consent, no participation."),
             ("Never locked in code", "Questions are researcher-owned and versioned; every answer stays tied to the version it was given under.")]
    cards = "".join(f'<div class="card"><h3>{a}</h3><p>{b}</p></div>' for a, b in items)
    d.add(f'''<div class="eyebrow">The integrity line</div>
      <h1 class="md">&ldquo;Of those who have completed the Index.&rdquo; We never claim to speak for a nation.</h1>
      <div class="grid3" style="margin-top:34px">{cards}</div>''')

# ── the three documents ───────────────────────────────────────────────────────
def leadership():
    d = Deck("The Jesus Index · Leadership pitch")
    cover(d, 'Let&rsquo;s see Jesus-following, <span class="hl">one ministry at a time.</span>',
          "One shared, anonymous measure that any ministry, down to a single local church, can run for free, so the whole movement reads the same picture.",
          "Leadership pitch", "Next Gen Global Collab · on the road to 2033")
    opportunity(d); what_is(d); stages(d); j12(d); walls(d); pattern(d); safe(d); promises(d); gives(d); how1(d); how2(d); road(d)
    invite(d, [("Join, free.", "One minute at jfindx.org/join: your ministry email, organisation, role."),
               ("Set up your page.", "Your logo, colour and welcome; confirm consent."),
               ("Send your first survey.", "A link or QR code for each group. Results appear as they answer.")])
    goal(d)
    return d.write("JesusIndex-leadership-pitch.pdf", "The Jesus Index — leadership pitch")

def demo_guide():
    d = Deck("The Jesus Index · Pitch and demo guide")
    cover(d, 'Walk someone through it, <span class="hl">in ten minutes.</span>',
          "Why the Jesus Index exists, how a ministry uses it, and step-by-step notes for a leaders&rsquo; meeting or a call.",
          "Pitch and demo guide", "For leaders, boards and partners · jfindx.org")
    opportunity(d); what_is(d); j12(d); how2(d); safe(d); demo1(d); demo2(d)
    invite(d, [("Join, free.", "jfindx.org/join, about a minute."),
               ("Try it with a test link.", "Answers on a test link never count anywhere."),
               ("Confirm consent and send it.", "For your ministry, then for each survey.")])
    goal(d)
    return d.write("JesusIndex-pitch-and-demo.pdf", "The Jesus Index — pitch and demo guide")

def two_pager():
    d = Deck("The Jesus Index · Two-pager · jfindx.org")
    head = "".join(f"<th>{c}</th>" for c in J12_COLS)
    rows = "".join(f'<tr><td class="rh" style="font-size:20px;width:120px">{r}<span style="font-size:14px">{g}</span></td>' +
                   "".join(f'<td class="c c{j}" style="height:64px;width:142px;font-size:15px">{e(J12_WORDS[i][j])}</td>' for j in range(4)) + "</tr>"
                   for i, (r, g) in enumerate(J12_ROWS))
    d.add(f'''<div class="bar"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:-40px"><div style="width:900px">{lockup().replace('class="word"','class="word" style="font-size:34px"')}</div>
        <span class="pill" style="font-size:17px;padding:10px 18px">Two-pager &middot; for a board or partner</span></div>
      <h1 class="md" style="margin-top:26px;max-width:1260px;font-size:46px">How are young people following Jesus, and where do they stop moving?</h1>
      <p class="lead" style="font-size:20px;margin-top:12px;max-width:1260px">The Jesus Index is one short, anonymous survey any ministry can run with the young people it reaches, aged 13 to 30. It&rsquo;s free. Each ministry sees its own results live; together, the Collab sees a picture no single ministry could see alone.</p>
      <div style="display:flex;margin-top:22px">
        <div style="flex:0 0 760px;width:760px;margin-right:44px">
          <div class="eyebrow" style="font-size:16px">The model &middot; the J12</div>
          <table class="j12" style="margin-top:8px"><tr><th></th>{head}</tr>{rows}</table>
        </div>
        <div style="flex:1 1 auto">
          <div class="eyebrow" style="font-size:16px">At a glance</div>
          <div class="grid2 w458" style="margin-top:16px">
            <div class="stat" style="padding-top:14px"><div class="n" style="font-size:36px">&asymp;{FULL_MIN} min</div><div class="l" style="font-size:17px">{LENGTH_COPY.lower()} for the full survey; &asymp;{J12_MIN} for the J12</div></div>
            <div class="stat" style="padding-top:14px;border-color:#ff9466"><div class="n" style="font-size:36px">13&ndash;30</div><div class="l" style="font-size:17px">under 13 or over 30 leave at the first question</div></div>
            <div class="stat" style="padding-top:14px;border-color:#b98af7"><div class="n" style="font-size:36px">100%</div><div class="l" style="font-size:17px">anonymous; no names, emails or birthdays</div></div>
            <div class="stat" style="padding-top:14px;border-color:#8b5cf6"><div class="n" style="font-size:36px">$0</div><div class="l" style="font-size:17px">to run it, for any ministry</div></div>
          </div>
          <p class="small" style="margin-top:6px;font-size:16px">One question per screen on any phone; works offline once opened. Those not yet following Jesus answer their own questions, scored apart.</p>
        </div></div>''', foot=True)
    steps = [("Join and sign in", "Join at jfindx.org, then sign in with your ministry email: no password. You get your own branded survey and dashboard."),
             ("Confirm consent", "For your organisation, then for each survey you send, including how parental consent was gathered for 13&ndash;17s. No consent, no participation."),
             ("Start a survey for each group", "Choose the J12 or the Full survey, add your welcome, and set when it opens and closes. Each has its own results."),
             ("Read it, and ask", "The J12 matrix, the Unengaged matrix and a heat map, live. &ldquo;What does this mean?&rdquo; sends your question to a Collab facilitator.")]
    st = "".join(f'<div class="step compact" style="margin-bottom:16px"><div class="num">{n}</div><div><h3 style="font-size:22px">{a}</h3><p style="font-size:17.5px">{b}</p></div></div>' for n, (a, b) in enumerate(steps, 1))
    pr = [("Of those who completed it", "Never a whole population; every score shows its n."),
          ("Nothing that points at a person", "A score at 10 people; a city at 400; a country at 2,000."),
          ("Aggregates only", "No organisation ever sees one person&rsquo;s answers."),
          ("Kept only as long as needed", "Identifying details removed after 60 days; cleaned answers up to 5 years."),
          ("Minors protected at the edge", "Consent, including parental, gathered and held by each ministry."),
          ("Your brand, not ours", "Your name, colour and logo; the Index sits in the footer.")]
    pc = "".join(f'<div class="card" style="padding:16px 18px"><h3 style="font-size:19px">{a}</h3><p style="font-size:16px;margin-top:4px">{b}</p></div>' for a, b in pr)
    d.add(f'''<div style="display:flex;margin-top:-30px">
        <div style="flex:0 0 600px;width:600px;margin-right:50px"><div class="eyebrow" style="font-size:16px">How it works</div>
          <div class="steps" style="margin-top:20px">{st}</div></div>
        <div style="flex:1 1 auto"><div class="eyebrow" style="font-size:16px">The promises the platform keeps</div>
          <div class="grid2 w612 tight" style="margin-top:20px">{pc}</div>
          <table style="margin-top:10px;border-collapse:collapse"><tr>
            <td style="width:150px;vertical-align:middle"><img src="{QR}" style="width:130px;height:130px;border-radius:12px"></td>
            <td style="vertical-align:middle"><p class="small"><b style="color:#22252b">Join free at jfindx.org.</b> Privacy notice: jfindx.org/privacy &middot; Consent guide, parent letter and script: jfindx.org/resources/consent &middot; Guided tour: jfindx.org/tour</p></td>
          </tr></table></div></div>''')
    return d.write("JesusIndex-two-pager.pdf", "The Jesus Index — what it is and how it works")

if __name__ == "__main__":
    counts = {"leadership": leadership(), "two_pager": two_pager(), "demo": demo_guide()}
    print(counts)
