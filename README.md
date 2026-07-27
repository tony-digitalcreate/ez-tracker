# EZ Tracker

A daily routine and task tracker split into five life sections. Tasks record the day you
created them; each one holds a checklist of subtasks you tick off as you go.

**Live app → <https://tony-digitalcreate.github.io/ez-tracker/>**

Sections: **FAO Career** 🌾 · **Content Creator** 🎬 · **Billing & Docs** 🧾 ·
**Household** 🏠 · **Sport & Recreation** ⚽

---

## What it does

- **Tasks** — title, date created (always stamped), optional note and due date. Overdue
  tasks turn red and sort to the top.
- **Subtasks** — the tick boxes. Parent and children stay in sync both ways: tick every
  subtask and the task completes itself; untick the task and the list clears; add a new
  subtask to a finished task and it reopens.
- **🔁 Daily tasks** — a task marked daily clears its boxes each calendar day, files the
  finished day into its history, and shows a 🔥 streak with a 7-day dot strip.
- Per-section stats (open / done today / % complete), Open·Done·All filter, and search
  across titles, notes and subtasks.
- **Cloud sync** — sign in with Google and the same data appears on your phone and PC.
  Works offline; changes queue and sync when signal returns.
- **PWA** — installable on Android, iPhone and desktop, opens fullscreen.

## Two ways to run it

| | Hosted PWA (`docs/`) | Local app (`server.js`) |
|---|---|---|
| Where | GitHub Pages, any device | This PC only, port 3801 |
| Storage | Firestore + browser cache | `data/tracker.json` |
| Sync | Yes, across devices | No |
| Needs internet | Only to sync | No |

The hosted PWA is the one to use day to day. The local app came first and still works —
launch it with `EZ TRACKER.bat`. To move its data across: **⬇ Backup** in the local app,
then **⋯ → 📥 Import a backup** in the hosted one.

## Cloud setup

Three one-time clicks in the Firebase console — see **[SETUP-CLOUD.md](SETUP-CLOUD.md)**.
It reuses an existing Firebase project and writes to its own `ezTracker` collection.

The Firebase values in `docs/firebase-config.js` are project identifiers, not secrets —
they are designed to ship in the browser. Access is controlled by Google sign-in plus the
Firestore rules in [`firestore.rules`](firestore.rules), which scope every document to the
signed-in account's uid.

## Development

```bash
node server.js        # local app on http://localhost:3801
node docs-server.js   # preview the hosted build on http://localhost:3802
node gen-icons.js     # regenerate PWA icons from the SVG source
```

`docs/` is what GitHub Pages serves. It is fully static — no build step.
