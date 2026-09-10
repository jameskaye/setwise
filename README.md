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

The original workout logger is privately published through Sites. The coaching API and portable-host changes are being prepared separately; do not assume the external GPT is connected. The standalone interactive review file is generated from the same application component by `scripts/build-review.mjs`. It uses a clearly labeled, in-memory sample adapter. Test entries in that file reset on reload and never write real workout history. The preview adapter is not imported by the Site route.

## Validation

- `node --test tests/workout.test.mjs`: meaningful algorithm checks and SQLite-backed API integration checks for seeding, durability after reopen, atomic records, retries, ownership isolation, coaching, pain pauses, and session lifecycle.
- `npx tsc --noEmit`: TypeScript validation.
- Build with the Sites build helper. Generate migrations with `npm run db:generate` when the schema changes.

Browser QA completed in Chrome at 390 × 844 and 375 × 667 layouts. The actual application was exercised against local D1 for set logging, independent unilateral recommendations, coach constraints, pain pauses, set types, session history, variant creation, reopening, undo, and an uncertain-save retry without duplication. The standalone review was also checked with JavaScript disabled to verify that its initial layout remains visible. This is not an iOS Safari or hosted production test. Live D1 wiring is only activated when the saved Site is deployed.

## Portable hosting and ChatGPT coaching

See `docs/DEPLOY.md` for Cloudflare hosting and `docs/gpt/SETUP.md` for the private GPT. The standalone build reuses the logger and server logic; only rendering and authentication differ from Sites. The GPT API is disabled in Sites mode because a GPT Action cannot reuse the browser's private Sites session. No MCP server is declared.

The routine contains named workout templates and per-exercise prescriptions. Each save stores an immutable revision, including the original baseline, and rejects stale versions. Session adjustments preserve actual logged sets and existing session rules. New sessions capture prescriptions from the chosen saved routine, so later routine changes do not rewrite previous sessions.

Validation for this change: all ten automated tests pass; TypeScript and both build profiles pass; Wrangler standalone upload dry-run succeeds. The API integration tests cover authorization, separate browser/coach keys, forged identity rejection, cross-origin login rejection, persistent revisions after reopening SQLite, plan changes in new sessions, current-session changes, retries, conflicts, finished sessions, tenant isolation, and backup/import round-trip including SQL-looking note text. Browser QA uses a 390 × 844 Chrome frame displaying a synthetic snapshot produced by those integration tests; today's 10–12 range is distinct from the future 12–15 range. Native iPhone GPT Actions and a live external Cloudflare deployment remain untested.

The old starter render test assumed a Node-compatible stateless Worker and preview metadata; it is replaced with checks for the portable entry's actual title, runnable script, stylesheet and emitted asset existence. Unused starter scrollbar-catalog expectations were removed; used animation/reduced-motion and component semantics checks remain.
# Current direction: mobile Setwise

Use the Cloudflare-backed mobile tracker described in [docs/MOBILE-STATUS.md](docs/MOBILE-STATUS.md). The standalone Worker has browser authentication, ordinary workout logging without an LLM, and one optional OpenRouter coach endpoint. MCP, ChatGPT plugins, and GPT Actions are no longer the deployment path.
