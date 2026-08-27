# The palette — how colour works, and what warming it costs

**Status:** working note, August 2026. Written to answer one question from Ulrich —
*"can we see the site in a warmer palette instead of the current green?"* — properly,
rather than by find-and-replace.

---

## 1. Where colour lives

One place: the `:root` block at the top of `src/app/globals.css`.

Everything else points at it.

| Layer | Reads the palette via |
|---|---|
| Tailwind utility classes (`bg-paper`, `text-emerald`) | `tailwind.config.ts` maps names → `rgb(var(--c-*) / <alpha-value>)` |
| The stylesheet itself (`::selection`, `:focus-visible`, `.figcap`) | `rgb(var(--c-*))` |
| Chart primitives and inline styles | `src/lib/model.ts` exports `EMERALD`, `NAVY`, `TIER_TINT`… as `rgb(var(--c-*))` strings |

Before this note, thirteen places in `src/` restated `#0B8A60` inline, so the design
system's own rule — *"do not restate these values in a component"* — was not actually
true. Those are now gone. Changing a colour is one edit to one file.

**The one deliberate exception:** `SAMPLE_ORG.brand` in `src/lib/sample.ts` stays a
literal hex. That is a white-label ministry's *own* brand colour — org data, not a
platform token. Re-skinning the Index must never silently re-skin someone's brand.

---

## 2. Colour is load-bearing here

Three colours carry meaning, and they are not interchangeable:

| Token | Means | Used by |
|---|---|---|
| `--c-emerald` `#0B8A60` | the single working colour, **and "up"** | brand marks, `delta()` positive, `heat()`, tier ramp top |
| `--c-navy` `#35639C` | levels and benchmarks, never anything else | domain bars, benchmark comparisons |
| `--c-vermillion` `#B5451B` | **"down"**, and only ever "down" | `delta()` negative |

Plus the ramp: `--c-tier-*` is one emerald at four lightnesses. **Hue is constant;
lightness alone encodes journey depth.** That is what makes the heat grid read as a
progression rather than as four unrelated categories.

### The collision

Vermillion sits at roughly **hue 19°** — red-orange. Most "warm brand" candidates
(terracotta, rust, burnt orange) land between 15° and 30°, i.e. *on top of it*. Make
the brand warm-red and a rising figure and a falling figure become the same family.
The reader loses the instant up/down read, which is most of what a dashboard is for.

Any warm brand therefore has to either **clear hue ~40°** (amber, ochre, gold) or
**move what carries "up"**. The three options below differ mainly in which of those
they choose.

---

## 3. Three options, and what each costs

### Option 1 — Warm the ground, keep the working colour

Shift only paper, plate and rules towards ochre. Emerald untouched.

```
--c-paper:      247 241 230   /* #F7F1E6 */
--c-paper-deep: 237 228 212   /* #EDE4D4 */
--c-plate:      255 252 244   /* #FFFCF4 */
--c-rule:       214 203 180   /* #D6CBB4 */
--c-rule-2:     195 182 154   /* #C3B69A */
```

- **Semantic cost:** none. Nothing that means anything moves.
- **Effect:** real but modest — the page reads as older paper. The site is still green.
- **Risk:** the tier ramp's lightest step (`#E4F1EA`) is a cool green on now-warmer
  paper; the contrast gets slightly *better*, not worse.
- **Reversible:** trivially.

### Option 2 — Warm chrome, cool data *(recommended for a first look)*

Introduce a brand colour used **only** for chrome — masthead mark, rising rule, focus
ring, selection, the accented door. Every data surface keeps emerald / navy /
vermillion exactly as they are.

```
--c-brand: 162 113 26   /* #A2711A — ochre, hue ≈ 38°, clear of vermillion's 19° */
```

- **Semantic cost:** breaks *"one working colour."* There are now two accents on
  screen — brand ochre on the furniture, emerald in the figures.
- **Gain:** the measurement layer's meaning is completely untouched. This is the honest
  split: **brand is not data.** It is also the only option that could survive a
  white-label org whose own brand is red.
- **Risk:** on the landing page, where chrome and figures sit together, the two accents
  can look unresolved. This is exactly the thing to judge on the deploy preview, not
  from a swatch.

### Option 3 — Full warm rotation

Emerald becomes ochre everywhere, ramp included. "Up" gives up its colour.

```
--c-emerald:               162 113 26   /* #A2711A */
--c-tier-exposure:         242 231 206  /* #F2E7CE */
--c-tier-response:         224 200 146  /* #E0C892 */
--c-tier-formation:        195 154  60  /* #C39A3C */
--c-tier-multiplication:   162 113  26  /* #A2711A */
```

…and `delta()` positive moves from emerald to **ink**, letting the ▲ glyph carry
direction while vermillion keeps ▼ as the only coloured exception.

- **Semantic cost:** the highest. Three things change at once: the brand, the ramp, and
  the up/down convention. Everyone reading a dashboard has to relearn it.
- **Legibility risk — the real one:** `#F2E7CE` against paper `#F7F1E6` is a much
  weaker separation than `#E4F1EA` against `#FAF7F1`. The bottom of the ramp may
  effectively disappear, which would quietly break the heat grid.
- **Gain:** it is fully coherent. One warm system, no leftover green, still one working
  colour.

---

## 4. How to judge

Not from this document, and not from a screenshot. Open the Netlify deploy preview
**on a phone in daylight and on a laptop**, and look specifically at:

1. `/tour` — the heat grid. Can you still rank the four tiers by eye, instantly?
2. `/[org]/dashboard` — a positive and a negative delta in the same view. Do they still
   separate at a glance?
3. `/learn` — the DFW pilot table, which uses navy and vermillion together.
4. Any screen at low brightness. Warm ramps lose their bottom step first.

If the answer to (1) or (2) is "I had to look twice," the option has failed regardless
of how it looks.

---

## 5. Changing the palette

Edit the `:root` block in `src/app/globals.css`. Nothing else. If you find yourself
writing a hex value in a component, the system has been broken — put it in `:root` and
reference it.
