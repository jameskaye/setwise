# RTF coach edits — 2026-09-14

Deployment `25db71e8c7b041e1ae8c9bab8329be7b` removes the three advice-only gates that previously disabled coach operations whenever a rep-out program existed.

The existing authenticated propose/apply API remains the only write path for coach changes. Proposals alone never change workouts. The UI identifies skipped exercises, displays the proposed prescriptions, distinguishes advice from changes, and requires Apply before saving. The request includes the account identity to reject stale tabs after a sign-in switch.

Current-workout edits preserve unchanged frozen RTF prescriptions, logged sets, and session constraints. Removed logged exercises stay visible but are skipped; removed unlogged lifts retain their prior training max internally so the next week does not reset them. Superset pairs are filtered when an exercise is removed. Modified lifts hold progression for that workout; added exercises use controlled prescriptions with no invented weight. Rep-range edits disable that lift's rep-out for the modified session. The write checks configuration and set count atomically, and retries are idempotent.

Future-routine proposals retain the existing RTF cycle, matching lift configurations/training maxes and valid superset pairs. Newly added lifts default to controlled work until explicitly configured. General changes to the underlying RTF percentage schedule or automatic invention of maxes remain unsupported.

Verification: RTF coach API tests exercise proposal-only behavior, actual Apply/retry, skipping logged and unlogged exercises, set reduction, held progression, preserved earned maxes, and future program retention. Existing coach, account-isolation, RTF and abort tests passed. TypeScript and client/Worker builds passed. iPhone WebKit verified proposal preview → Apply → persisted active-workout change against an isolated database.

The real OpenRouter flow was then used for the user's requested volume change: 5 sets for main lifts, 4 for auxiliary lifts, 2 for accessory lifts, controlled work unchanged. Its complete proposal was checked against the previous routine before calling Apply. Saved revision 7 was reread and matched. All 63 logged entries and existing sessions were preserved; there was no active workout when applying the future-routine change.
