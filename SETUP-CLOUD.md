# EZ Tracker — cloud sync setup

The app is already wired to your **existing** Firebase project `ez-money-manager-f796c`
(the EZ Money one). **No new project, no new dataset, nothing to pay for.** EZ Tracker
writes to its own top-level collection `ezTracker`, so EZ Money's data is untouched.

Sign in with **the same email and password you use for EZ Money** and you land on the
same Firebase account — same uid, so the two apps agree on who you are.

---

## The one step you must do

**Firestore Database → Rules.** You should already see an `ezMoney` block. Add the
`ezTracker` block beside it — **don't delete the EZ Money one** — then **Publish**.
Or just paste the whole of [`firestore.rules`](firestore.rules) from this folder, which
contains both.

```
match /ezTracker/{uid} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
  match /tasks/{taskId} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
}
```

Until this is published, sign-in works but the app can't read or write — you'll see
`☁ offline` in the corner.

This rule is what actually protects your data: only the account whose uid matches the
folder can touch it. The values in `docs/firebase-config.js` are **project identifiers,
not secrets** — they're meant to ship in the browser. Anyone can load the app; without
your login they get nothing.

---

## Nothing else is needed for email sign-in

Email/Password is **already enabled** on this project (EZ Money uses it) — verified, so
there's no provider to switch on. Email sign-in also doesn't care about authorized
domains, so there's no domain to whitelist either.

### Optional: the "Sign in with Google" button

The gate has a Google button as a second option. It needs two extra console steps, and
you only need them if you actually want to use it:

1. **Authentication → Sign-in method** → add provider **Google** → Enable → Save.
2. **Authentication → Settings → Authorized domains** → Add `tony-digitalcreate.github.io`.

Skip both and just use email/password. If you press the Google button without doing them,
the app tells you exactly which one is missing.

> Note: Google and email/password are **different providers**. Signing in with Google as
> `you@gmail.com` does not necessarily give the same uid as signing in with that email and
> a password — so pick one and stick to it, or you'll end up with two separate trackers.

---

## Then use it

**On your phone**

1. Open <https://tony-digitalcreate.github.io/ez-tracker/>
2. Sign in with your EZ Money email + password.
3. Install it: **Android/Chrome** — ⋮ → *Add to Home screen*.
   **iPhone/Safari** — Share → *Add to Home Screen*.
4. It opens fullscreen, works offline, and syncs when you have signal.

**On your PC** — the **EZ TRACKER** desktop shortcut opens it in its own Chrome window.
Sign in with the same email and password. Changes appear on the other device within a
second or two while both are open.

**First time on a device?** If the email has no account in this Firebase project yet, tap
**Create account** — it makes one with that email and password. If you already use the
email for EZ Money, use **Sign in** instead, not Create account.

---

## Moving your existing local data up

The local Node app (`EZ TRACKER.bat`, port 3801) keeps its own copy on your PC:

1. In the local app, click **⬇ Backup** — downloads `ez-tracker-backup-<date>.json`.
2. In the hosted app, tap **⋯** → **📥 Import a backup** → pick that file.

Tasks merge by id, so importing the same file twice is harmless.

---

## Offline / no-sync mode

The gate has a **"Use this device only (no sync)"** link — everything stays in the
browser's storage and Firebase is never contacted. Sign in later from **⋯ → Sign in to
sync** and anything you made locally gets pushed up on first connect.
