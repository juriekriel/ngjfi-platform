# Translating the survey

The Index only works if a question means the same thing in every language. So
translation is **researcher-owned**: anyone can help write a translation, but a
language only reaches respondents once a researcher has approved it.

## Where languages live

| File | What it holds |
|---|---|
| `src/data/locales.json` | Every language: code, names, text direction (`ltr`/`rtl`), **status**, and its fallback chain. |
| `src/data/i18n/<code>.json` | That language's survey-screen text (`ui`) and question translations (`items`). |
| `src/data/instrument.v4.json` | The questions themselves, with English and Spanish built in. Researcher-owned; translations do **not** edit it. |

### Status

| Status | Meaning |
|---|---|
| `live` | Offered to respondents. CI refuses this unless every screen string, question and answer option has text (`tests/i18n.test.ts`). |
| `review` | Complete, waiting for a researcher. Previewable. |
| `draft` | Being translated. Previewable; missing text shows in English. |
| `requested` | Asked for; not started. Not previewable. |

**Preview:** add `?preview=1` to any survey link to choose non-live languages
(add `&lang=fr` to jump straight to one). A preview in a language that isn't
live **never records an answer** — a yellow banner says so.

**Fallbacks:** Spanish (Latin America) and Spanish (Europe) inherit Spanish and
override only regional words; the Arabic dialects inherit Modern Standard Arabic.

## Adding or finishing a language

1. **Export a sheet:** `node scripts/translation-sheet.mjs export fr` → `translations/fr.csv`
   (or `--all`). One row per piece of text: id · context · english · translation · note.
   The translation column is pre-filled with whatever exists.
2. **Translate** in Excel, Google Sheets or Numbers. Keep `{placeholders}` and the
   `[highlight]` brackets exactly. Rows marked *scored* need exact meaning.
3. **Review:** a researcher checks the scored questions — ideally with a
   back-translation into English by a second person.
4. **Import:** `node scripts/translation-sheet.mjs import fr translations/fr.csv`.
   The sheet is refused whole if any row is malformed. Only `src/data/i18n/fr.json` changes.
5. **Go live:** a reviewed PR changes the language's status to `live` in
   `src/data/locales.json`. CI checks it is complete.

Every response records the language it was answered in (`sessions.locale`), so
results can always be compared or separated by language.

## Organisations

Organisations request languages from **Survey settings → Languages** (it reaches
the Collab's Consulting Requests). They can offer a translator or reviewer; the
Collab owns review and release. An organisation's custom welcome message is
shown to English-language respondents; other languages see the translated
standard welcome.

## Open questions for researchers

- **Spanish** is complete and marked `review` — approve to make it live.
- **Arabic dialects** (Egyptian, Levantine, Gulf, Maghrebi): written dialect or
  Modern Standard Arabic for a survey? Which dialects are fielded?
- **Mandarin:** Simplified only, or Traditional (`zh-Hant`) too?
- **Portuguese:** Brazilian or European conventions (or both)?
- The screen-text drafts for all languages are machine drafts and need a
  fluent reviewer like everything else.
