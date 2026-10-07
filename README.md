# Einbürgerungstest Trainer

A static, offline-capable trainer for the German naturalisation test (Einbürgerungstest), using the Bavaria question pool: 300 general questions plus 10 for Bayern. German wording with English translations and a short explanation for every answer.

## Features

- All 310 questions, including the 9 figure questions, with English translations that can be switched off.
- Explanations after each answer.
- Spaced repetition (Leitner boxes): correct answers move a question to a longer review interval (1, 3, 7, 16, 35 days), a wrong answer sends it back to be relearned. The **Study** tab serves what is due first (weakest boxes first), then up to 15 new questions, Bavaria first. The **Browse** menu filters the catalogue (all, general, Bayern, new, mistakes, mastered).
- Timed mock exam: 33 questions (30 general, 3 Bavaria), 60 minutes, pass mark 17. Answers can be changed until you finish, the clock survives a page reload, and the exam is submitted automatically when time runs out.
- Progress is stored in the browser's `localStorage`. Export and import it as JSON to back it up or move devices; exports from the original single-file trainer can be imported too.

## Run locally

No build step and no dependencies. Open `index.html` directly, or serve the folder:

```bash
npm start   # http://localhost:8080
```

```bash
npm test    # unit tests and data validation
```

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `css/styles.css` | Page and styles (dark and light themes) |
| `js/srs.js` | Spaced-repetition scheduling |
| `js/exam.js` | Mock exam construction, scoring, clock |
| `js/storage.js` | Progress persistence, import and migration |
| `js/app.js` | UI |
| `data/questions.js` | Question catalogue (German, English, answer key) |
| `data/explanations.js` | Explanation per question id |
| `images/` | Figures for the nine picture questions |
| `sw.js` | Service worker for offline use over HTTP(S) |
| `scripts/validate-data.js` | Consistency checks for the data files |

Scripts are plain browser scripts, not ES modules, so the page also works from `file://`.

## Data

Questions come from the BAMF *Fragenkatalog zum Einbürgerungstest* (07.05.2025). The English translations and explanations are study aids; the German text is what the exam uses. Time-dependent questions (current Chancellor, largest parliamentary groups, population) reflect that edition and will need updating when the catalogue changes.

## Deploying

The site is plain static files: publish the repository root with no build command.
