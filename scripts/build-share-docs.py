"""
Builds the two shareable JFINDX documents:
  public/share/JFINDX-two-pager.pdf       (A4 portrait, 2 pages)
  public/share/JFINDX-pitch-and-demo.pdf  (A4 landscape, 8 pages)
Content is drawn only from what the platform actually does (CLAUDE.md,
the live instrument v4, the dashboards as built) — no invented statistics.
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
QR = "/tmp/qr-small.png"

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
    c.setFillColor(CORAL); c.circle(x, y, r, stroke=0, fill=1)
    c.setFillColor(VIOLET); c.circle(x + r * 0.35, y - r * 0.35, r * 0.62, stroke=0, fill=1)
    c.setFillColor(white); c.setFont("Helvetica-Bold", r * 0.9); c.drawCentredString(x + r * 0.05, y - r * 0.32, "+")

def kicker(c, x, y, text, color=INK2):
    c.setFont("Helvetica", 8); c.setFillColor(color); c.drawString(x, y, text.upper())

def j12(c, x, y_top, w, cell_h=34, phrases=True, font=7.5):
    """The J12 model — rounded tiles, orange deepening left to right."""
    rows = [("Follow", "personal faith"), ("Mission", "outward"), ("World", "lived impact")]
    cols = ["Exposure", "Response", "Formation", "Multiplication"]
    words = [["heard of Jesus", "believes", "being shaped", "helps others believe"],
             ["aware of the call", "convinced it's theirs", "practising witness", "mobilising others"],
             ["sees faith should matter", "believes it does", "choices reshaped", "changing their spheres"]]
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
    c.setTitle("The JFINDX — what it is and how it works"); c.setAuthor("Next Gen Global Collab")
    M = 46; TW = W - 2 * M

    # page 1
    mark(c, M + 11, H - 52); c.setFont("Helvetica-Bold", 15); c.setFillColor(INK); c.drawString(M + 30, H - 57, "JFINDX")
    c.setFont("Helvetica", 8.5); c.setFillColor(INK2); c.drawRightString(W - M, H - 56, "jfindx.org")
    kicker(c, M, H - 100, "A shared measure for the Next Gen Global Collab")
    y = para(c, "How are young people following Jesus — and where do they stop moving?", M, H - 108, TW * 0.9, style(25, INK, 30, True))
    y = para(c, "The JFINDX (the Next Gen Jesus-Following Index) is one short, anonymous survey that any ministry can run with the young people it reaches, aged 13 to 30. "
             "Every ministry sees its own results the moment people answer. Together, the Collab sees a picture no single ministry could see alone.",
             M, y - 12, TW * 0.92, style(11, INK2, 16))

    kicker(c, M, y - 30, "The model · three questions, four tiers")
    y = para(c, "Every question in the survey belongs to one of <b>three questions</b> — what we measure — and one of <b>four tiers</b> — how deep it has gone. "
             "That makes a grid of twelve cells, the <b>J12</b>. Reading across a row shows where young people stop moving: the columns narrow as faith goes from being heard of to being passed on.",
             M, y - 38, TW, style(10, INK, 14.5))
    y = j12(c, M, y - 12, TW, cell_h=40, font=8)

    kicker(c, M, y - 26, "What it takes")
    cols = [("About 7 minutes", "One question per screen on any phone. A 3-minute short version is available for camps and busy moments."),
            ("Anonymous by design", "No names, emails, precise location or IP addresses. Age is a band, never a birthday."),
            ("Works with no signal", "Once the survey has opened on a phone, it runs offline and sends answers when signal returns.")]
    cw = (TW - 24) / 3; yy = y - 34
    for i, (h, b) in enumerate(cols):
        x = M + i * (cw + 12)
        c.setFillColor(PAGE); c.roundRect(x, yy - 86, cw, 86, 8, stroke=0, fill=1)
        para(c, f"<b>{h}</b>", x + 10, yy - 10, cw - 20, style(10.5, INK))
        para(c, b, x + 10, yy - 28, cw - 20, style(8.8, INK2, 12.2))
    footer(c, W, "The JFINDX · built by and for the Next Gen Global Collab · jfindx.org", 1)
    c.showPage()

    # page 2
    kicker(c, M, H - 60, "How it works")
    steps = [("1", "A ministry joins", "Sign in at jfindx.org with your ministry email — no password. Your organisation gets its own branded survey and dashboard."),
             ("2", "Make a link for each group", "Each link is its own “room” — a camp, a youth night, a partner church — with its own open and close times. Every room rolls up into your whole organisation."),
             ("3", "Young people answer", "They scan a QR code or tap a link, answer in about seven minutes, and are told plainly that only grouped results are ever seen."),
             ("4", "You read the J12", "Your dashboard shows the J12 matrix and a world heat map, and lets you overlay your whole organisation on the Collab's pooled picture."),
             ("5", "Ask what it means", "“What does this mean?” sends your question — and the view you are looking at — to a Collab facilitator, who helps turn a score into a changed strategy.")]
    y = H - 72
    for n, h, b in steps:
        c.setFillColor(CORAL); c.circle(M + 10, y - 12, 10, stroke=0, fill=1)
        c.setFillColor(white); c.setFont("Helvetica-Bold", 10); c.drawCentredString(M + 10, y - 15.5, n)
        yb = para(c, f"<b>{h}</b>", M + 30, y - 4, TW - 30, style(11, INK))
        yb = para(c, b, M + 30, yb - 3, TW - 30, style(9.5, INK2, 13.5))
        y = yb - 14

    kicker(c, M, y - 6, "The promises the platform keeps")
    promises = ["<b>Only “those who have completed the Index.”</b> Results never claim to describe a whole population.",
                "<b>Nothing small enough to point at a person.</b> A score appears only once at least 10 people have answered; a country appears on the map only at 2,000.",
                "<b>Aggregates only.</b> No organisation ever sees an individual's answers — including its own young people's.",
                "<b>Your brand, not ours.</b> Respondents see your name, colour and logo; the JFINDX sits quietly in the footer.",
                "<b>Never locked.</b> The questions belong to the researchers and are versioned; every answer stays tied to the version it was given under."]
    y -= 16
    for pr in promises:
        c.setFillColor(VIOLET); c.circle(M + 4, y - 6, 2.4, stroke=0, fill=1)
        y = para(c, pr, M + 14, y, TW - 14, style(9.5, INK, 13.5)) - 7

    box_h = 108; by = 50
    c.setFillColor(INK); c.roundRect(M, by, TW, box_h, 10, stroke=0, fill=1)
    c.drawImage(ImageReader(QR), W - M - box_h + 12, by + 12, box_h - 24, box_h - 24)
    para(c, "Start at jfindx.org", M + 18, by + box_h - 18, TW - box_h - 30, style(17, white, 21, True))
    para(c, "Sign in with your ministry email to set up your organisation, or take the guided tour at jfindx.org/tour to see every screen with invented figures first.",
         M + 18, by + box_h - 46, TW - box_h - 40, style(9.5, HexColor("#d7dbe2"), 13.5))
    footer(c, W, "The JFINDX · built by and for the Next Gen Global Collab · jfindx.org", 2)
    c.showPage(); c.save()

# ───────────────────────────── pitch & demo ──────────────────────────────
def pitch(path):
    W, H = landscape(A4); c = canvas.Canvas(path, pagesize=(W, H))
    c.setTitle("The JFINDX — pitch and demo guide"); c.setAuthor("Next Gen Global Collab")
    M = 54; TW = W - 2 * M; n = [0]

    def slide(title, kick, dark=False):
        n[0] += 1
        if n[0] > 1: c.showPage()
        c.setFillColor(INK if dark else white); c.rect(0, 0, W, H, stroke=0, fill=1)
        c.setFillColor(CORAL); c.rect(0, H - 6, W * 0.34, 6, stroke=0, fill=1)
        c.setFillColor(VIOLET); c.rect(W * 0.34, H - 6, W * 0.66, 6, stroke=0, fill=1)
        mark(c, M + 9, H - 40, 9)
        c.setFont("Helvetica-Bold", 10.5); c.setFillColor(white if dark else INK); c.drawString(M + 24, H - 44, "JFINDX")
        kicker(c, M, H - 84, kick, HexColor("#b8bdc7") if dark else INK2)
        y = para(c, title, M, H - 92, TW * 0.85, style(26, white if dark else INK, 31, True))
        c.setStrokeColor(HexColor("#3a3e46") if dark else RULE); c.line(M, 30, W - M, 30)
        c.setFont("Helvetica", 7.5); c.setFillColor(HexColor("#b8bdc7") if dark else INK2)
        c.drawString(M, 18, "The JFINDX · pitch and demo guide · jfindx.org"); c.drawRightString(W - M, 18, str(n[0]))
        return y

    # 1 · cover
    y = slide("A shared measure of how young people follow Jesus.", "Pitch and demo guide · for leaders, boards and partners", dark=True)
    para(c, "One short, anonymous survey any ministry can run. Its own results the moment people answer. A Collab-wide picture no single ministry could see alone.",
         M, y - 18, TW * 0.6, style(13.5, HexColor("#d7dbe2"), 19))
    c.drawImage(ImageReader(QR), W - M - 150, 60, 150, 150)
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
    y = slide("Seven minutes, on any phone — with no signal if need be.", "The respondent")
    items = [("Scan or tap", "A QR code on a poster, or a link in a group chat."), ("Choose a language", "Every word is translatable; the survey runs in the respondent's language."),
             ("One question per screen", "About 7 minutes; a 3-minute short version exists for camps."), ("Anonymous, and told so", "No names or emails; age is a band. They're told only grouped results are ever seen."),
             ("Offline-proof", "Answers are kept on the phone and sent automatically when signal returns."), ("Next person", "At a camp, one phone can be passed along — each person's answers clear from the screen.")]
    cw = (TW - 36) / 3; ch = (y - 110) / 2
    for i, (h, b) in enumerate(items):
        x = M + (i % 3) * (cw + 18); yy = y - 24 - (i // 3) * (ch + 16)
        c.setFillColor(PAGE); c.roundRect(x, yy - ch, cw, ch, 10, stroke=0, fill=1)
        para(c, h, x + 16, yy - 16, cw - 32, style(13, INK, 17, True))
        para(c, b, x + 16, yy - 40, cw - 32, style(11, INK2, 15.5))

    # 5 · what a ministry sees
    y = slide("Your own dashboard — and the Collab's, side by side.", "The ministry")
    rows = [("Two tabs, identical in shape", "Your organisation's dashboard and Collab Intelligence: the same three figures, the same J12 matrix and heat map, in the same places."),
            ("Rooms", "Every link is its own room — a camp, a partner, a youth night — with its own results, rolling up into your whole organisation."),
            ("Overlay the Collab", "Put the Collab's pooled figure in the corner of every cell and see where you sit. Whole-organisation only, never a single room."),
            ("A heat map that doesn't overclaim", "Countries light up only once 2,000 people there have answered. Until then they stay grey — honestly."),
            ("“What does this mean?”", "Ask a Collab facilitator about exactly the view you're looking at. That's the consulting layer: from a score to a strategy.")]
    yy = y - 20
    for h, b in rows:
        c.setFillColor(VIOLET); c.roundRect(M, yy - 32, 5, 30, 2, stroke=0, fill=1)
        para(c, h, M + 16, yy - 2, TW * 0.3, style(12.5, INK, 16, True))
        para(c, b, M + 16 + TW * 0.31, yy - 2, TW * 0.66, style(11, INK2, 15.5))
        yy -= 52

    # 6 · promises
    y = slide("The promises the platform keeps.", "Privacy and honesty")
    pr = [("Of those who completed it", "Results describe the people who answered — never a whole population."), ("Nothing that points at a person", "No score under 10 people. No country on the map under 2,000."),
          ("Aggregates only", "No organisation sees an individual answer — not even its own young people's."), ("Minors protected at the edge", "Consent — including parental consent — is handled by each ministry. Nothing identifiable about under-18s is ever held centrally."),
          ("Your brand, not ours", "Respondents see your name, colour and logo."), ("Never locked", "Questions are researcher-owned and versioned; every answer stays tied to its version.")]
    cw = (TW - 20) / 2
    for i, (h, b) in enumerate(pr):
        x = M + (i % 2) * (cw + 20); yy = y - 20 - (i // 2) * 72
        para(c, h, x, yy, cw, style(12.5, CORAL_DD, 16, True))
        para(c, b, x, yy - 20, cw, style(11, INK, 15.5))

    # 7 · demo, part 1
    y = slide("Run the demo — part one: set up.", "Demo instructions · about 10 minutes")
    steps = [("Before you start", "Have a laptop to present from and a phone to answer on. For a no-risk walkthrough with invented figures, open jfindx.org/tour."),
             ("1 · Sign in", "On the laptop go to jfindx.org → “Sign in to Your Organisation”. Enter your ministry email. Open the link from the newest email — it works on any device."),
             ("2 · Your dashboard", "You land on your organisation's dashboard. Point out the three figures and the J12 matrix. Say: the dashes mean there aren't enough answers yet — that's the privacy floor at work."),
             ("3 · Make a room", "Click “+ New link”. Name it after your audience (“Demo room”), choose Public, set it to open now and close tomorrow, and save."),
             ("4 · Show the QR", "On the new card click “QR” and hold it up. Invite people to scan it with their phones.")]
    yy = y - 18
    for h, b in steps:
        para(c, h, M, yy, TW * 0.24, style(12, INK, 16, True))
        yb = para(c, b, M + TW * 0.26, yy, TW * 0.74, style(11, INK2, 15.5))
        yy = min(yy - 36, yb - 12)

    # 8 · demo, part 2
    y = slide("Run the demo — part two: answer, read, ask.", "Demo instructions · continued")
    steps = [("5 · Answer on a phone", "Scan the QR. Point out the organisation's own colour and name, the one-question-per-screen flow, and the anonymity promise. For effect, switch the phone to airplane mode halfway — it keeps working."),
             ("6 · Watch it arrive", "Back on the laptop, reload the dashboard. The room's count goes up. Explain that a score appears once 10 people have answered, so a real room fills in live."),
             ("7 · Switch views", "Toggle between the J12 matrix and the heat map; open the Collab Intelligence tab to show the pooled picture has exactly the same shape."),
             ("8 · Ask what it means", "Click “What does this mean?” and pick a suggested question. It goes to a Collab facilitator with the view attached — that's where a score becomes a strategy."),
             ("9 · Hand over", "In “Share about the JFINDX” download this guide, the two-pager and the QR code for anyone who wants to take it further.")]
    yy = y - 18
    for h, b in steps:
        para(c, h, M, yy, TW * 0.24, style(12, INK, 16, True))
        yb = para(c, b, M + TW * 0.26, yy, TW * 0.74, style(11, INK2, 15.5))
        yy = min(yy - 36, yb - 12)

    c.showPage(); c.save()

two_pager("public/share/JFINDX-two-pager.pdf")
pitch("public/share/JFINDX-pitch-and-demo.pdf")
print("ok")
