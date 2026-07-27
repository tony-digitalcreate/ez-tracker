# EZ Tracker — cloud sync setup (3 console steps, ~5 minutes)

The app is already wired to your **existing** Firebase project `ez-money-manager-f796c`
(the EZ Money one). **No new project, no new dataset, nothing to pay for.** EZ Tracker
writes to its own top-level collection `ezTracker`, so EZ Money's data is untouched.

You only need to do these three things once, in the Firebase console.

---

## 1. Turn on Google sign-in

<https://console.firebase.google.com> → project **ez-money-manager-f796c** →
**Authentication** → **Sign-in method** → **Add new provider** → **Google** → toggle
**Enable** → pick your email as the support email → **Save**.

(Email/Password stays enabled for EZ Money — adding Google doesn't remove it.)

---

## 2. Authorise the GitHub Pages domain

Same page → **Authentication** → **Settings** tab → **Authorized domains** → **Add domain**:

```
tony-digitalcreate.github.io
```

Without this, Google sign-in fails with `auth/unauthorized-domain`. The app tells you
exactly this if you forget.

---

## 3. Add the security rules

**Firestore Database** → **Rules** tab. You should already see an `ezMoney` block.
Paste the **`ezTracker`** block in beside it (don't delete the EZ Money one) — or just
paste the whole contents of **`firestore.rules`** from this folder, which contains both.
Then **Publish**.

```
match /ezTracker/{uid} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
  match /tasks/{taskId} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
}
```

This is what actually protects your data: only the account whose uid matches the folder
can read or write it. The `firebase-config.js` values in the public repo are **project
identifiers, not secrets** — they are meant to ship in the browser. Anyone can load the
app, but without your Google login they get nothing.

---

## Then use it

**On your phone**

1. Open <https://tony-digitalcreate.github.io/ez-tracker/>
2. Sign in with Google.
3. Install it: **Android/Chrome** — menu ⋮ → *Add to Home screen* (or the install prompt).
   **iPhone/Safari** — Share button → *Add to Home Screen*.
4. It now opens fullscreen like a real app, works offline, and syncs when you have signal.

**On your PC** — open the same URL and sign in with the same Google account. Chrome shows
an install icon in the address bar if you want it as a desktop app too.

Changes appear on the other device within a second or two while both are open.

---

## Moving your existing local data up

The local Node app (`EZ TRACKER.bat`, port 3801) keeps its own copy on your PC. To carry
that data into the cloud version:

1. In the local app, click **⬇ Backup** — it downloads `ez-tracker-backup-<date>.json`.
2. In the hosted app, tap **⋯** → **📥 Import a backup** → pick that file.

Tasks merge by id, so importing the same file twice is harmless.

---

## Offline / no-sync mode

The gate has a **"Use this device only (no sync)"** link. That keeps everything in the
browser's local storage and never contacts Firebase — handy for a quick look without
signing in. Sign in later from **⋯ → Sign in to sync** and anything you created locally
gets pushed up on first connect.
