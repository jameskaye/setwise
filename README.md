# Setwise

A mobile-first strength workout logger. The main flow is log a set → commit it and its recommendation to D1 → show the next recommendation. The Log Set action stays in the thumb zone on phones.

## Data and privacy

The private Site reads the platform-authenticated user ID. Every API operation scopes reads and writes to that ID and rejects anonymous access. Structured workout data lives in D1, never ChatGPT Memory or localStorage. SQL schema changes are managed by the included Drizzle migration.

The schema records exercise families and variants, sessions, individual sets, coach instructions, and recommendation history. Set records include side, set type, RIR, pain location/severity, free text, and the recommendation shown before logging. A set and its subsequent recommendation are written in one transaction. Stable request IDs prevent retries from creating duplicate sets. The active session survives reopening, and only one session can be active per user.

The supplied 95 lb × 10 single-leg extension record is initialized once per user. Its date, side, and RIR remain explicitly unknown. No other working weights are invented. All loads use pounds and a visible per-dumbbell, per-leg, machine-load, or total-load convention.

## Coaching

This version uses transparent, deterministic coaching rules, not an external language model. Recommendations combine recent same-variant, same-side working history, rep range, RIR, and a within-session rep-capacity trend. Warmups do not cause progression. Reaching the top of the range with reserve can add an equipment increment; failure, reps below range, or a substantial performance drop reduce load. Backoff and drop sets use smaller loads. Pain pauses further recommendations for the affected side in that workout.

Tell coach recognizes conservative loads, RIR targets, set caps, rep ranges, time limits, exercise skips, pain, and clearing constraints. It records both the instruction and the concrete change. Unrecognized text remains a note and explicitly reports that no change was inferred. Workout notes and coach constraints are separate. New variants maintain distinct histories.

These are adjustable training heuristics, not a medical assessment or a prediction of exact strength.

## Review before deployment

The source and deployment archive are saved without publishing. The standalone interactive review file is generated from the same application component by `scripts/build-review.mjs`. It uses a clearly labeled, in-memory sample adapter. Test entries in that file reset on reload and never write real workout history. The preview adapter is not imported by the Site route.

## Validation

- `node --test tests/workout.test.mjs`: meaningful algorithm checks and SQLite-backed API integration checks for seeding, durability after reopen, atomic records, retries, ownership isolation, coaching, pain pauses, and session lifecycle.
- `npx tsc --noEmit`: TypeScript validation.
- Build with the Sites build helper. Generate migrations with `npm run db:generate` when the schema changes.

Browser QA completed in Chrome at 390 × 844 and 375 × 667 layouts. The actual application was exercised against local D1 for set logging, independent unilateral recommendations, coach constraints, pain pauses, set types, session history, variant creation, reopening, undo, and an uncertain-save retry without duplication. The standalone review was also checked with JavaScript disabled to verify that its initial layout remains visible. This is not an iOS Safari or hosted production test. Live D1 wiring is only activated when the saved Site is deployed.
