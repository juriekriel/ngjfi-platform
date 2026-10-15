"""
Builds the three shareable Jesus Index documents (front page "Pitch
documents" and the dashboard's "Share about the Jesus Index"):
  public/share/JesusIndex-leadership-pitch.pdf  (A4 landscape, 9 pages)
  public/share/JesusIndex-two-pager.pdf         (A4 portrait, 2 pages)
  public/share/JesusIndex-pitch-and-demo.pdf    (A4 landscape, 8 pages)
Content is drawn only from what the platform actually does (CLAUDE.md,
the live instrument v5, the dashboards as built, the privacy notice and the
consent resource) — no invented statistics. Re-run after any change to them:
  python3 scripts/build-share-docs.py
The mark is drawn from public/icon-mark.svg's own geometry, so the PDFs
carry the real logo, not an approximation.
"""
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.platypus import Paragraph, Frame
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader

INK = HexColor("#22252b"); INK2 = HexColor("#5b6270"); RULE = HexColor("#e2e5ea"); PAGE = HexColor("#f5f6f8")
CORAL = HexColor("#FF7A47"); CORAL_D = HexColor("#E8551F"); CORAL_DD = HexColor("#A8360B")
VIOLET = HexColor("#8B5CF6"); VIOLET_D = HexColor("#5B21B6")
TIER = [HexColor("#FDE3D6"), HexColor("#FFB08A"), HexColor("#FF7A47"), HexColor("#C2410C")]
TIER_FG = [INK, INK, white, white]
# The 1200 px QR is for print downloads; the PDFs only need ~300 px of it.
from PIL import Image as _Image
QR = ImageReader(_Image.open("public/share/jfindx-qr.png").convert("L").resize((300, 300), _Image.NEAREST))

def style(size, color=INK, lead=None, bold=False, align=0):
    return ParagraphStyle("s", fontName="Helvetica-Bold" if bold else "Helvetica", fontSize=size,
                          leading=lead or size * 1.38, textColor=color, alignment=align)

def para(c, text, x, y_top, w, st, h=400):
    """Draw a paragraph with its top at y_top; return the y of its bottom."""
    p = Paragraph(text, st)
    _, ph = p.wrap(w, h)
    p.drawOn(c, x, y_top - ph)
    return y_top - ph

def mark(c, x, y, r=11):
    """The Jesus Index mark (public/icon-mark.svg): a coral→violet disc, a dashed
    white line that runs flat then rises, and the white cross at its peak.
    SVG geometry is 120×120, y down; (x, y) here is the disc's centre."""
    k = 2 * r / 120.0
    X = lambda sx: x - r + sx * k
    Y = lambda sy: y + r - sy * k
    c.saveState()
    p = c.beginPath(); p.circle(x, y, r * 58 / 60)
    c.clipPath(p, stroke=0, fill=0)
    c.linearGradient(X(0), Y(0), X(120), Y(120), (CORAL, VIOLET), extend=True)
    c.restoreState()
    c.saveState()
    c.setStrokeColor(white); c.setLineWidth(5 * k); c.setLineCap(1); c.setDash([12 * k, 10 * k])
    line = c.beginPath(); line.moveTo(X(15), Y(89)); line.lineTo(X(65), Y(89)); line.lineTo(X(92), Y(55))
    c.drawPath(line, stroke=1, fill=0)
    c.setDash([])
    c.setFillColor(white)
    c.roundRect(X(89.25), Y(31 + 28), 4.5 * k, 28 * k, 2.25 * k, stroke=0, fill=1)
    c.roundRect(X(77), Y(43.25 + 4.5), 28 * k, 4.5 * k, 2.25 * k, stroke=0, fill=1)
    c.restoreState()

def wordmark(c, x, y, size=15, color=INK):
    """The name, set as the lockup: The *Jesus* Index (serif, italic Jesus)."""
    c.setFillColor(color)
    c.setFont("Times-Roman", size); c.drawString(x, y, "The ")
    x += c.stringWidth("The ", "Times-Roman", size)
    c.setFont("Times-Italic", size); c.drawString(x, y, "Jesus")
    x += c.stringWidth("Jesus ", "Times-Italic", size)
    c.setFont("Times-Roman", size); c.drawString(x, y, "Index")

def kicker(c, x, y, text, color=INK2):
    c.setFont("Helvetica", 8); c.setFillColor(color); c.drawString(x, y, text.upper())

def j12(c, x, y_top, w, cell_h=34, phrases=True, font=7.5):
    """The J12 model — rounded tiles, orange deepening left to right."""
    rows = [("Follow", "personal faith"), ("Mission", "outward"), ("World", "lived impact")]
    cols = ["Exposure", "Response", "Formation", "Multiplication"]
    words = [["heard of Jesus", "believes in Jesus", "being shaped", "helps others believe"],
             ["aware of the call", "convinced it's theirs", "practising witness", "mobilising others"],
             ["sees faith should matter", "believes faith matters", "choices reshaped", "changing their spheres"]]
    label_w = w * 0.2; gap = 4; cw = (w - label_w - gap * 3) / 4
    c.setFont("Helvetica", 6.8); c.setFillColor(INK2)
    for j, col in enumerate(cols):
        c.drawCentredString(x + label_w + j * (cw + gap) + cw / 2, y_top - 8, col.upper())
    y = y_top - 14
    for i, (r, g) in enumerate(rows):
        y -= cell_h
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 9); c.drawString(x, y + cell_h / 2 + 1, r)
        c.setFillColor(INK2); c.setFont("Helvetica", 7); c.drawString(x, y + cell_h / 2 - 8, g)
        for j in range(4):
            cx = x + label_w + j * (cw + gap)
            c.setFillColor(TIER[j]); c.roundRect(cx, y, cw, cell_h - 3, 6, stroke=0, fill=1)
            if phrases:
                st = style(font, TIER_FG[j], lead=font * 1.15, align=1)
                p = Paragraph(words[i][j], st); _, ph = p.wrap(cw - 8, cell_h)
                p.drawOn(c, cx + 4, y + (cell_h - 3 - ph) / 2)
        y -= 3
    return y

def footer(c, W, text, page=None):
    c.setStrokeColor(RULE); c.line(40, 34, W - 40, 34)
    c.setFont("Helvetica", 7.5); c.setFillColor(INK2)
    c.drawString(40, 22, text)
    if page: c.drawRightString(W - 40, 22, str(page))

# ─────────────────────────────── two-pager ───────────────────────────────
def two_pager(path):
    W, H = A4; c = canvas.Canvas(path, pagesize=A4)
    c.setTitle("The Jesus Index — what it is and how it works"); c.setAuthor("Next Gen Global Collab")
    M = 46; TW = W - 2 * M

    # page 1
    mark(c, M + 11, H - 52); wordmark(c, M + 30, H - 57, 17)
    c.setFont("Helvetica", 8.5); c.setFillColor(INK2); c.drawRightString(W - M, H - 56, "jfindx.org")
    kicker(c, M, H - 100, "A shared measure for the Next Gen Global Collab")
    y = para(c, "How are young people following Jesus — and where do they stop moving?", M, H - 108, TW * 0.9, style(25, INK, 30, True))
    y = para(c, "The Jesus Index (the Next Gen Jesus-Following Index) is one short, anonymous survey that any ministry can run with the young people it reaches, aged 13 to 30. "
             "It's free for every ministry. Each one sees its own results live, as people answer. Together, the Collab sees a picture no single ministry could see alone.",
             M, y - 12, TW * 0.92, style(11, INK2, 16))

    kicker(c, M, y - 30, "The model · three questions, four tiers")
    y = para(c, "Every question in the survey belongs to one of <b>three questions</b> — what we measure — and one of <b>four tiers</b> — how deep it has gone. "
             "That makes a grid of twelve cells, the <b>J12</b>. Reading across a row shows where young people stop moving: the columns narrow as faith goes from being heard of to being passed on.",
             M, y - 38, TW, style(10, INK, 14.5))
    y = j12(c, M, y - 12, TW, cell_h=40, font=8)

    kicker(c, M, y - 26, "What it takes")
    cols = [("About 6 minutes", "One question per screen on any phone. Choose the J12 (about 5 minutes) or the Full survey (about 6, plus optional extras)."),
            ("Anonymous by design", "No names, emails, phone numbers or birthdays; IP addresses are never stored with answers. Age is a band."),
            ("Works with no signal", "Once the survey has opened on a phone, it runs offline and sends answers when signal returns.")]
    cw = (TW - 24) / 3; yy = y - 34
    for i, (h, b) in enumerate(cols):
        x = M + i * (cw + 12)
        c.setFillColor(PAGE); c.roundRect(x, yy - 86, cw, 86, 8, stroke=0, fill=1)
        para(c, f"<b>{h}</b>", x + 10, yy - 10, cw - 20, style(10.5, INK))
        para(c, b, x + 10, yy - 28, cw - 20, style(8.8, INK2, 12.2))
    footer(c, W, "The Jesus Index · built by and for the Next Gen Global Collab · jfindx.org", 1)
    c.showPage()

    # page 2
    kicker(c, M, H - 60, "How it works")
    steps = [("1", "A ministry joins", "Join at jfindx.org, then sign in with your ministry email — no password. Your organisation gets its own branded survey and dashboard."),
             ("2", "Consent comes first", "Confirm consent for your organisation, then for each survey you send — including how parental consent was gathered for 13–17s. No consent, no participation."),
             ("3", "Start a survey for each group", "Choose the J12 or the Full survey, add your own welcome and closing, and set when it opens and closes. Each one is its own “room”, rolling up into your whole organisation."),
             ("4", "Young people answer", "They scan a QR code or tap a link, answer in about six minutes, and are told plainly that only grouped results are ever seen. Those not yet following Jesus answer their own path."),
             ("5", "You read the J12 — live", "Your dashboard shows the J12 matrix, the Unengaged matrix and a world heat map. Choose which views your team sees, export your results, and overlay the Collab's pooled picture."),
             ("6", "Ask what it means", "“What does this mean?” sends your question — and the view you are looking at — to a Collab facilitator, who helps turn a score into a changed strategy.")]
    y = H - 72
    for n, h, b in steps:
        c.setFillColor(CORAL); c.circle(M + 10, y - 12, 10, stroke=0, fill=1)
        c.setFillColor(white); c.setFont("Helvetica-Bold", 10); c.drawCentredString(M + 10, y - 15.5, n)
        yb = para(c, f"<b>{h}</b>", M + 30, y - 4, TW - 30, style(11, INK))
        yb = para(c, b, M + 30, yb - 3, TW - 30, style(9.5, INK2, 13.5))
        y = yb - 14

    kicker(c, M, y - 6, "The promises the platform keeps")
    promises = ["<b>Only “those who have completed the Index.”</b> Results never claim to describe a whole population, and every score shows how many people it rests on.",
                "<b>Nothing small enough to point at a person.</b> A score appears at 10 people; a city or area at 400; a country on the map at 2,000.",
                "<b>Aggregates only.</b> No organisation ever sees an individual's answers — including its own young people's.",
                "<b>Kept only as long as needed.</b> After 60 days the exact time, city, typed answers and room are removed; cleaned answers are kept up to 5 years, then only grouped totals. Under-13s are stopped at the first question and nothing is kept.",
                "<b>Minors protected at the edge.</b> Consent, including parental consent, is gathered and held by each ministry — never by the Index.",
                "<b>Your brand, not ours.</b> Respondents see your name, colour and logo; the Jesus Index sits quietly in the footer."]
    y -= 16
    for pr in promises:
        c.setFillColor(VIOLET); c.circle(M + 4, y - 6, 2.4, stroke=0, fill=1)
        y = para(c, pr, M + 14, y, TW - 14, style(9.5, INK, 13.5)) - 7

    box_h = 108; by = 50
    c.setFillColor(INK); c.roundRect(M, by, TW, box_h, 10, stroke=0, fill=1)
    c.drawImage(QR, W - M - box_h + 12, by + 12, box_h - 24, box_h - 24)
    para(c, "Start at jfindx.org", M + 18, by + box_h - 18, TW - box_h - 30, style(17, white, 21, True))
    para(c, "Join free, then sign in with your ministry email. Privacy notice: jfindx.org/privacy · Consent resource, parent letter and script: jfindx.org/resources/consent · Guided tour: jfindx.org/tour",
         M + 18, by + box_h - 46, TW - box_h - 40, style(9.5, HexColor("#d7dbe2"), 13.5))
    footer(c, W, "The Jesus Index · built by and for the Next Gen Global Collab · jfindx.org", 2)
    c.showPage(); c.save()

# ───────────────────────────── pitch & demo ──────────────────────────────
def pitch(path):
    W, H = landscape(A4); c = canvas.Canvas(path, pagesize=(W, H))
    c.setTitle("The Jesus Index — pitch and demo guide"); c.setAuthor("Next Gen Global Collab")
    M = 54; TW = W - 2 * M; n = [0]

    def slide(title, kick, dark=False):
        n[0] += 1
        if n[0] > 1: c.showPage()
        c.setFillColor(INK if dark else white); c.rect(0, 0, W, H, stroke=0, fill=1)
        c.setFillColor(CORAL); c.rect(0, H - 6, W * 0.34, 6, stroke=0, fill=1)
        c.setFillColor(VIOLET); c.rect(W * 0.34, H - 6, W * 0.66, 6, stroke=0, fill=1)
        mark(c, M + 9, H - 40, 9)
        wordmark(c, M + 24, H - 44, 12.5, white if dark else INK)
        kicker(c, M, H - 84, kick, HexColor("#b8bdc7") if dark else INK2)
        y = para(c, title, M, H - 92, TW * 0.85, style(26, white if dark else INK, 31, True))
        c.setStrokeColor(HexColor("#3a3e46") if dark else RULE); c.line(M, 30, W - M, 30)
        c.setFont("Helvetica", 7.5); c.setFillColor(HexColor("#b8bdc7") if dark else INK2)
        c.drawString(M, 18, "The Jesus Index · pitch and demo guide · jfindx.org"); c.drawRightString(W - M, 18, str(n[0]))
        return y

    # 1 · cover
    y = slide("A shared measure of how young people follow Jesus.", "Pitch and demo guide · for leaders, boards and partners", dark=True)
    para(c, "One short, anonymous survey any ministry can run, free. Its own results live, as people answer. A Collab-wide picture no single ministry could see alone.",
         M, y - 18, TW * 0.6, style(13.5, HexColor("#d7dbe2"), 19))
    c.drawImage(QR, W - M - 150, 60, 150, 150)
    c.setFont("Helvetica", 9); c.setFillColor(HexColor("#b8bdc7")); c.drawRightString(W - M, 48, "jfindx.org")

    # 2 · why
    y = slide("Thirty-plus ministries, each measuring differently — so no one can see the whole.", "Why it exists")
    cols = [("The problem", "Every ministry asks its own questions, in its own way. Numbers can't be compared, and the most important question — where do young people stop moving? — goes unanswered."),
            ("The answer", "One instrument, the same everywhere, translatable, that any ministry can run in minutes on any phone — even offline, at a camp."),
            ("What changes", "A youth pastor sees where their people stall. The Collab sees patterns across countries. A facilitator helps turn a score into a changed strategy.")]
    cw = (TW - 40) / 3
    for i, (h, b) in enumerate(cols):
        x = M + i * (cw + 20)
        c.setFillColor(PAGE); c.roundRect(x, 70, cw, y - 100, 12, stroke=0, fill=1)
        para(c, h, x + 18, y - 48, cw - 36, style(15, [CORAL_D, VIOLET_D, INK][i], 19, True))
        para(c, b, x + 18, y - 78, cw - 36, style(11.5, INK, 16.5))

    # 3 · the model
    y = slide("Three questions. Four tiers. Twelve cells.", "The model · the J12")
    para(c, "Every question belongs to one question — <b>Follow</b> (personal faith), <b>Mission</b> (outward), <b>World</b> (lived impact) — and one tier — <b>Exposure → Response → Formation → Multiplication</b>. "
         "Read across a row to see where people stop moving; read down a column to compare the three.", M, y - 14, TW * 0.36, style(11.5, INK, 16.5))
    j12(c, M + TW * 0.4, y - 10, TW * 0.6, cell_h=58, font=9.5)

    # 4 · what a young person does
    y = slide("About six minutes, on any phone — with no signal if need be.", "The respondent")
    items = [("Scan or tap", "A QR code on a poster, or a link in a group chat. Your welcome first, your thank-you last."), ("Choose a language", "English today, Spanish in review and more on the way — every word is translatable."),
             ("One question per screen", "The J12 in about 5 minutes, the Full survey in about 6. Country from a list; city optional."), ("Anonymous, and told so", "No names, emails or birthdays; age is a band. They're told only grouped results are ever seen."),
             ("Offline-proof", "Answers are kept on the phone and sent automatically when signal returns."), ("Every path counts", "Those not yet following Jesus answer their own questions — counted, and scored apart.")]
    cw = (TW - 36) / 3; ch = (y - 110) / 2
    for i, (h, b) in enumerate(items):
        x = M + (i % 3) * (cw + 18); yy = y - 24 - (i // 3) * (ch + 16)
        c.setFillColor(PAGE); c.roundRect(x, yy - ch, cw, ch, 10, stroke=0, fill=1)
        para(c, h, x + 16, yy - 16, cw - 32, style(13, INK, 17, True))
        para(c, b, x + 16, yy - 40, cw - 32, style(11, INK2, 15.5))

    # 5 · what a ministry sees
    y = slide("Your own dashboard — and the Collab's, side by side.", "The ministry")
    rows = [("Two tabs, identical in shape", "Your organisation's dashboard and Collab Intelligence: the same figures, the same J12 matrix and heat map, in the same places."),
            ("Rooms", "Every survey you start is its own room — a camp, a partner, a youth night — with its own results, rolling up into your whole organisation."),
            ("Yours to arrange", "“Edit your dashboard” lets your admin choose which views and tools your team sees. A score never loses its sample size."),
            ("A map that doesn't overclaim", "Countries light up only once 2,000 people there have answered; cities and areas at 400. Until then they stay grey — honestly."),
            ("“What does this mean?”", "Ask a Collab facilitator about exactly the view you're looking at. That's the consulting layer: from a score to a strategy.")]
    yy = y - 20
    for h, b in rows:
        c.setFillColor(VIOLET); c.roundRect(M, yy - 32, 5, 30, 2, stroke=0, fill=1)
        para(c, h, M + 16, yy - 2, TW * 0.3, style(12.5, INK, 16, True))
        para(c, b, M + 16 + TW * 0.31, yy - 2, TW * 0.66, style(11, INK2, 15.5))
        yy -= 52

    # 6 · promises
    y = slide("The promises the platform keeps.", "Privacy and honesty")
    pr = [("Of those who completed it", "Results describe the people who answered — never a whole population. Every score shows its n."), ("Nothing that points at a person", "No score under 10 people. No city under 400, no country under 2,000."),
          ("Aggregates only", "No organisation sees an individual answer — not even its own young people's."), ("Minors protected at the edge", "Consent is confirmed twice — for the organisation and for each survey — and parental consent is held by each ministry, never by the Index."),
          ("Kept only as long as needed", "Identifying details removed after 60 days; cleaned answers kept up to 5 years. IPs never stored with answers."), ("Never locked", "Questions are researcher-owned and versioned; every answer stays tied to its version.")]
    cw = (TW - 20) / 2
    for i, (h, b) in enumerate(pr):
        x = M + (i % 2) * (cw + 20); yy = y - 20 - (i // 2) * 72
        para(c, h, x, yy, cw, style(12.5, CORAL_DD, 16, True))
        para(c, b, x, yy - 20, cw, style(11, INK, 15.5))

    # 7 · demo, part 1
    y = slide("Run the demo — part one: set up.", "Demo instructions · about 10 minutes")
    steps = [("Before you start", "Have a laptop to present from and a phone to answer on. For a no-risk walkthrough with invented figures, open jfindx.org/see-a-demo."),
             ("1 · Sign in", "On the laptop go to jfindx.org → “Sign in”. Enter your ministry email and open the link from the newest email — it works on any device."),
             ("2 · Your dashboard", "Point out the figures and the J12 matrix. Say: the dashes mean there aren't enough answers yet — that's the privacy floor at work."),
             ("3 · Start a test survey", "Click “+ Start a new survey”. Name it (“Demo”), tick Test link, choose J12 or Full survey (open “What each survey measures”), add a welcome, and save."),
             ("4 · Show the QR", "On the new card click “QR” and hold it up. A test link works before consent and its answers are kept apart and deleted after 7 days.")]
    yy = y - 18
    for h, b in steps:
        para(c, h, M, yy, TW * 0.24, style(12, INK, 16, True))
        yb = para(c, b, M + TW * 0.26, yy, TW * 0.74, style(11, INK2, 15.5))
        yy = min(yy - 36, yb - 12)

    # 8 · demo, part 2
    y = slide("Run the demo — part two: answer, read, ask.", "Demo instructions · continued")
    steps = [("5 · Answer on a phone", "Scan the QR. Point out your own colour, name and welcome, one question per screen, and the anonymity promise. For effect, switch to airplane mode halfway — it keeps working."),
             ("6 · Watch it arrive", "Back on the laptop, reload. The test card's count goes up — test answers never reach a score. On a real survey a score appears once 10 people have answered."),
             ("7 · Switch views", "Toggle the J12 matrix, Unengaged matrix and heat map; open “Edit your dashboard” to show how a team chooses what it sees; open Collab Intelligence for the pooled picture."),
             ("8 · Ask what it means", "Click “What does this mean?” and pick a suggested question. It goes to a Collab facilitator with the view attached — that's where a score becomes a strategy."),
             ("9 · Hand over", "At the bottom of the dashboard, “Share about the Jesus Index” has this guide, the two-pager and the QR code. Consent materials: jfindx.org/resources/consent.")]
    yy = y - 18
    for h, b in steps:
        para(c, h, M, yy, TW * 0.24, style(12, INK, 16, True))
        yb = para(c, b, M + TW * 0.26, yy, TW * 0.74, style(11, INK2, 15.5))
        yy = min(yy - 36, yb - 12)

    c.showPage(); c.save()

# ──────────────────────────── leadership pitch ───────────────────────────
def leadership(path):
    """The case for the Index, for leaders and funders — drawn from the
    leadership briefing (the pitch), restated to match what is built. No
    results anywhere: the only numbers are counts of the coalition, the
    published comparison studies, the privacy thresholds and the indicative
    budget already shared with funders."""
    W, H = landscape(A4); c = canvas.Canvas(path, pagesize=(W, H))
    c.setTitle("The Jesus Index — leadership pitch"); c.setAuthor("Next Gen Global Collab")
    M = 54; TW = W - 2 * M; n = [0]
    DIM = HexColor("#b8bdc7"); SOFT = HexColor("#d7dbe2")

    def slide(title, kick, dark=False):
        n[0] += 1
        if n[0] > 1: c.showPage()
        c.setFillColor(INK if dark else white); c.rect(0, 0, W, H, stroke=0, fill=1)
        c.setFillColor(CORAL); c.rect(0, H - 6, W * 0.34, 6, stroke=0, fill=1)
        c.setFillColor(VIOLET); c.rect(W * 0.34, H - 6, W * 0.66, 6, stroke=0, fill=1)
        mark(c, M + 9, H - 40, 9)
        wordmark(c, M + 24, H - 44, 12.5, white if dark else INK)
        kicker(c, M, H - 84, kick, DIM if dark else INK2)
        y = para(c, title, M, H - 92, TW * 0.85, style(26, white if dark else INK, 31, True))
        c.setStrokeColor(HexColor("#3a3e46") if dark else RULE); c.line(M, 30, W - M, 30)
        c.setFont("Helvetica", 7.5); c.setFillColor(DIM if dark else INK2)
        c.drawString(M, 18, "The Jesus Index · leadership pitch · a working proposal, not a finished plan · jfindx.org")
        c.drawRightString(W - M, 18, str(n[0]))
        return y

    def cards(items, y, colours=None, top_pad=24, h=None):
        cw = (TW - 20 * (len(items) - 1)) / len(items)
        hh = h or (y - top_pad - 60)
        for i, (hd, b) in enumerate(items):
            x = M + i * (cw + 20)
            c.setFillColor(PAGE); c.roundRect(x, y - top_pad - hh, cw, hh, 12, stroke=0, fill=1)
            col = (colours or [INK] * len(items))[i]
            yb = para(c, hd, x + 18, y - top_pad - 18, cw - 36, style(14, col, 18, True))
            para(c, b, x + 18, yb - 8, cw - 36, style(10.8, INK, 15.5))

    # 1 · cover
    y = slide("How will we know?", "Leadership pitch · Next Gen Global Collab · on the road to 2033", dark=True)
    para(c, "Thirty-plus organisations. Dozens of countries. One goal — every young person with a real opportunity to follow Jesus by 2033 — "
            "and, until now, no shared way to tell whether young people are actually following Him.",
         M, y - 18, TW * 0.6, style(14, SOFT, 20))
    para(c, "This is the proposal: one shared measure — the Jesus Index — owned by everyone, run by anyone, so the whole movement finally reads the same picture.",
         M, y - 110, TW * 0.6, style(14, white, 20, True))
    c.drawImage(QR, W - M - 150, 60, 150, 150)
    c.setFont("Helvetica", 9); c.setFillColor(DIM); c.drawRightString(W - M, 48, "jfindx.org · see a demo at jfindx.org/see-a-demo")

    # 2 · the shift
    y = slide("Same mission. Same questions. A different way of measuring.", "The shift")
    cards([("What stays the same", "The 2033 goal. The three questions — do they follow Jesus, do they join His mission, does their world look different? And the collaboration: we still measure together."),
           ("What changes", "From one centralised study the Collab runs, funds and owns — to a crowdsourced shared measure that hundreds of organisations, down to a single local church, run for themselves."),
           ("Why it matters", "We stop carrying the measuring tape ourselves and hand it to everyone. Each organisation gets value back immediately; the Collab gets a pooled picture no study could afford.")],
          y, [INK, CORAL_D, VIOLET_D], h=190)

    # 3 · why the change
    y = slide("Three walls the original study couldn't get past.", "Why the change")
    cards([("The under-18 wall", "Most Collab organisations work with under-18s. Centrally collecting minors' data across many countries needs ethics infrastructure we don't have. Run at the edge, consent stays with each organisation."),
           ("The money wall", "The Global Flourishing Study covers 22 countries and cost about $43M. Our ~$1M would buy roughly one country for seven years — not fifty."),
           ("The quality wall", "A global study on a small budget means ad-hoc sampling: data we can't compare year to year or region to region. A shared instrument used the same way everywhere can be.")],
          y, [CORAL_DD, CORAL_DD, CORAL_DD], h=190)

    # 4 · collective impact + proven pattern
    y = slide("The missing leg of Collective Impact — and a proven pattern.", "The thinking behind it")
    conds = [("Common agenda", "the 2033 vision"), ("Shared measurement", "the Jesus Index"), ("Reinforcing activities", "each partner"),
             ("Continuous communication", "the gatherings"), ("Backbone support", "NXT Move")]
    cw = (TW - 4 * 12) / 5
    for i, (h, g) in enumerate(conds):
        x = M + i * (cw + 12); miss = i == 1
        c.setFillColor(CORAL if miss else PAGE); c.roundRect(x, y - 92, cw, 70, 10, stroke=0, fill=1)
        para(c, h, x + 12, y - 32, cw - 24, style(11, white if miss else INK, 14, True))
        para(c, ("" if miss else "✓ ") + g, x + 12, y - 64, cw - 24, style(9.5, white if miss else INK2, 12.5))
    para(c, "Stanford's Collective Impact names five conditions a coalition needs. We have four. The Index builds the fifth.", M, y - 104, TW, style(11, INK2, 15))
    cards([("Gallup Q12", "Twelve questions in a four-level hierarchy, run by organisations across 50+ industries and benchmarked against a global database."),
           ("Global Flourishing Study", "Harvard, Baylor and Gallup. A shared index across 22 countries — the model of a common measure, if not the budget."),
           ("World Vision · Hope & Love", "A validated tool measuring how children experience God's love, released in 2025. The faith sector already does this.")],
          y - 132, [INK, INK, INK], top_pad=6, h=118)

    # 5 · the model
    y = slide("Three questions. Four tiers. Twelve cells: the J12.", "The model")
    para(c, "The <b>three questions</b> are <i>what</i> we measure. The <b>four tiers</b> are <i>how deep</i> it has gone — "
            "<b>Exposure → Response → Formation → Multiplication</b>. Every question in the survey sits in one cell. "
            "Read across a row to see where young people stop moving; read down a column to compare the three.<br/><br/>"
            "The <b>J12</b> is the twelve core questions — one per cell — about five minutes on any phone. The full survey asks more in each cell.",
         M, y - 14, TW * 0.36, style(11.5, INK, 16.5))
    j12(c, M + TW * 0.4, y - 10, TW * 0.6, cell_h=58, font=9.5)

    # 6 · three outcomes + how it works
    y = slide("What we're building — and how the crowdsourced model works.", "Three outcomes")
    cards([("1 · The shared metric", "One memorable, translatable instrument anyone can run. Free to every ministry, always."),
           ("2 · The dashboard", "Each organisation sees its own results live, under its own name. The Collab sees the pooled picture."),
           ("3 · The consulting", "“What does this mean?” — facilitators help turn a score into a changed strategy. The long game.")],
          y, [CORAL_D, VIOLET_D, INK], h=120)
    yy = y - 24 - 120 - 22
    for h, b in [("White-labelled, theirs", "An organisation signs up and runs the Index under its own logo and colour; its data flows back to the shared picture."),
                 ("Benchmarks earn their place", "Comparisons switch on for a place only once enough people there have completed the Index."),
                 ("Risk moves to the edge", "Organisations gather data under their own consent; the Index never holds identifiable data about anyone, least of all minors.")]:
        c.setFillColor(VIOLET); c.roundRect(M, yy - 26, 5, 24, 2, stroke=0, fill=1)
        para(c, h, M + 16, yy - 2, TW * 0.27, style(12, INK, 15, True))
        para(c, b, M + 16 + TW * 0.28, yy - 2, TW * 0.7, style(11, INK2, 15))
        yy -= 40

    # 7 · promises
    y = slide("The integrity line, and the promises behind it.", "Privacy and honesty")
    para(c, "“Of those who have completed the Index — here are the results, and here's how you compare.” We never claim to speak for a nation.",
         M, y - 10, TW * 0.85, style(15, CORAL_DD, 20, True))
    pr = [("Every score shows its n", "Results describe the people who answered — never a whole population."),
          ("Nothing that points at a person", "No score under 10 people; no city or area under 400; no country under 2,000."),
          ("Aggregates only", "No organisation sees an individual answer — not even its own young people's."),
          ("Anonymous by design", "No names, emails or birthdays; age is a band; IP addresses never stored with answers."),
          ("Consent before collection", "Confirmed for the organisation and for every survey — no consent, no participation."),
          ("Never locked", "Questions are researcher-owned and versioned; every answer stays tied to its version.")]
    cw = (TW - 20) / 2
    for i, (h, b) in enumerate(pr):
        x = M + (i % 2) * (cw + 20); yy = y - 70 - (i // 2) * 64
        para(c, h, x, yy, cw, style(12.5, INK, 16, True))
        para(c, b, x, yy - 19, cw, style(11, INK2, 15))

    # 8 · who does what + the road
    y = slide("Who does what, and the road to 2033.", "Partnership and horizon")
    who = [("The Collab", "Owns the project, the relationships and the people."), ("NXT Move", "The Collab's appointed backbone organisation."),
           ("Eido Research", "The survey and intelligence engine."), ("Shared IP", "Co-owned by NXT Move and Eido; anyone may publish results crediting both.")]
    yy = y - 18
    for h, b in who:
        para(c, h, M, yy, TW * 0.16, style(11.5, INK, 15, True))
        para(c, b, M + TW * 0.17, yy, TW * 0.3, style(10.5, INK2, 14.5))
        yy -= 40
    road = [("2026", "Build & baseline", "$120K"), ("2027", "Prove the model", "$180K"), ("2028–29", "Scale", "$320K"),
            ("2030–31", "Trend lines", "$240K"), ("2032–33", "Standard, not survey", "$140K")]
    x0 = M + TW * 0.52; rw = TW * 0.48; yy = y - 14
    c.setFont("Helvetica", 7.5); c.setFillColor(INK2); c.drawString(x0, yy, "PHASE"); c.drawRightString(x0 + rw, yy, "INDICATIVE")
    yy -= 8
    for yr, h, amt in road:
        c.setStrokeColor(RULE); c.line(x0, yy, x0 + rw, yy)
        c.setFont("Helvetica-Bold", 11); c.setFillColor(CORAL_D); c.drawString(x0, yy - 20, yr)
        c.setFont("Helvetica", 11); c.setFillColor(INK); c.drawString(x0 + 70, yy - 20, h)
        c.drawRightString(x0 + rw, yy - 20, amt)
        yy -= 32
    c.setStrokeColor(INK); c.line(x0, yy, x0 + rw, yy)
    c.setFont("Helvetica-Bold", 11.5); c.drawString(x0, yy - 20, "Through 2033"); c.drawRightString(x0 + rw, yy - 20, "~$1.0M")
    para(c, "Early years are lean because data-gathering cost moves to the partners; free measures with paid advanced reports and consulting bend later years toward self-sustaining.",
         x0, yy - 34, rw, style(9.5, INK2, 13))

    # 9 · the ask
    y = slide("Run it. See it. Bring the organisations around you.", "What we're asking", dark=True)
    asks = [("Join", "Sign up your ministry, organisation or church at jfindx.org — free, about two minutes."),
            ("See a demo", "jfindx.org/see-a-demo walks a fictional ministry, organisation and church through a whole season — every figure invented."),
            ("Bring others", "Comparisons open as an area grows. The fastest way to see how you compare is to invite the ministries you already work alongside.")]
    cw = (TW - 200 - 40) / 3
    for i, (h, b) in enumerate(asks):
        x = M + i * (cw + 20)
        para(c, h, x, y - 30, cw, style(16, [CORAL, HexColor("#b69cf9"), white][i], 20, True))
        para(c, b, x, y - 56, cw, style(11.5, SOFT, 16.5))
    c.drawImage(QR, W - M - 170, 70, 170, 170)
    c.setFont("Helvetica", 9); c.setFillColor(DIM); c.drawRightString(W - M, 56, "jfindx.org")
    para(c, "<i>Clay to be moulded — not a vase to be baked.</i> A working proposal, offered for shaping.", M, 92, TW * 0.6, style(11.5, DIM, 16))
    c.showPage(); c.save()


leadership("public/share/JesusIndex-leadership-pitch.pdf")
two_pager("public/share/JesusIndex-two-pager.pdf")
pitch("public/share/JesusIndex-pitch-and-demo.pdf")
print("ok")
