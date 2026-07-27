// ============================================================================
//  EZ Tracker — Firebase config
// ----------------------------------------------------------------------------
//  Reuses the same Firebase project as EZ Money. EZ Tracker keeps its data in
//  its own top-level collection ("ezTracker"), so nothing EZ Money owns is
//  touched. Everything is stored under ezTracker/<your-uid>/ and the security
//  rules only let that one signed-in account read or write it.
//
//  These values are safe to publish — they identify the project, they are not
//  secrets. What protects the data is Google sign-in + the Firestore rules.
//  See SETUP-CLOUD.md for the three console steps.
//
//  To run local-only (no cloud at all), restore the PASTE_… placeholders.
// ============================================================================
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCBpR9h5qiJa_m5PwxEEwRXqRclwxSvkSI",
  authDomain: "ez-money-manager-f796c.firebaseapp.com",
  projectId: "ez-money-manager-f796c",
  storageBucket: "ez-money-manager-f796c.firebasestorage.app",
  messagingSenderId: "1072292658677",
  appId: "1:1072292658677:web:ea3f862ed9ac55a22c74bc"
};

// The Firestore top-level collection EZ Tracker lives in.
window.EZTRACKER_ROOT = "ezTracker";
