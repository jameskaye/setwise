# Setwise mobile tracker

Updated September 10, 2026. This supersedes the MCP, plugin, and GPT Actions deployment plans. The new rep-out program is described in [RTF-PROGRESSION.md](RTF-PROGRESSION.md) and the update below; the earlier coach workflow applies only when no structured program is configured.

Test site: https://setwise-test.setwise-jlk298.workers.dev

Deployment: `14d953bc62f941328c1b4a1d339eecbd`. D1 migration `0003_mobile_coach.sql` is applied; rep-out and superset updates need no schema migration. Routine revision 4 includes ten saved superset pairings; see [SUPERSETS.md](SUPERSETS.md).

The standalone entry is `standalone/worker.ts`. Cloudflare D1 is the source of truth for workouts, sets, history, progression, routines, and coach proposals. `/mcp` and OAuth endpoints return 404. No ChatGPT app installation is required.

## Core tracker

- `/api/workout` uses the browser's HttpOnly signed session cookie. Set logging, undo, finish/start, exercise management, history, and deterministic progression do not call any LLM.
- An unconfirmed set is retained as a local draft, with its original ID, for safe retry. It is never displayed as saved until D1 confirms it. The local draft is not the workout database.
- The manifest, PNG icons, Apple home-screen metadata, safe-area layout, and service worker support home-screen installation. A full offline load shows a reconnect screen. Workout/API responses are not cached by the service worker.

## Optional coach

One endpoint, `/api/coach`, handles status/history (`GET`) and proposal/application (`POST`). Only proposal generation calls OpenRouter. The model defaults to `openai/gpt-4.1-mini`; its structured-output support was verified against the live OpenRouter model catalog.

Set `OPENROUTER_API_KEY` as a Worker secret. Never add the key to frontend variables or source control. The key is configured as a Cloudflare Worker secret. A live OpenRouter call successfully produced a validated current-workout proposal (two sets per exercise, 3 RIR). The proposal was not applied, and a before/after database snapshot confirmed workout and history were unchanged. Future deployments must preserve the OPENROUTER_API_KEY secret binding.

The model returns an explanation and at most one schema-validated operation: `adjust_workout` or `replace_routine`. Existing exercise IDs must be used. Unknown IDs, duplicate exercises, invalid ranges, arbitrary SQL/actions, and client-supplied operation modifications are rejected. The user reviews named exercises and targets and taps Apply. Application uses a stored proposal, ownership checks, revision checks, and idempotent writes. Logged sets are preserved. Proposals expire after 24 hours. Generation is limited to 10 requests per owner per 10 minutes and has a 45-second provider timeout.

Current adjustments retain pre-existing session constraints and pain pauses; a future-routine replacement does not change an active workout. Add new exercise variants through Exercises before asking the coach to include them.

## Validation

- Ten automated tests pass, including authenticated logging, duplicate prevention, provider failure isolation, structured-operation validation, stale proposals, routine application, and deterministic progression.
- TypeScript, client build, and Worker deployment dry run pass.
- `scripts/test-mobile.mjs` uses Playwright WebKit with iPhone 13 and small iPhone dimensions against the deployed test site. It checks sign-in, layout, screens, install assets, offline save retry, reopen, and undo. It removes its synthetic test set.
- Physical iPhone Safari and home-screen installation still require the user's device test. WebKit emulation is not proof of a physical-device pass.
- Cold offline navigation passes in Chromium. Playwright WebKit on Windows reports an internal navigation error during that specific offline test despite an activated worker and cached reconnect page; cold offline launch on a physical iPhone remains unverified. The ordinary lost-connection save/retry test passes in WebKit. The service worker rebuilds cached fallback responses to avoid carrying HTML-host redirect metadata into navigation.

## Data boundary

Only the separate `setwise-test` D1 database has been used. The original private Site and real workout history are untouched. Do not migrate real history until the user confirms the iPhone experience passes.
# Rep-out program update — 2026-09-10

The test Worker now runs deterministic SBS-style rep-out progression. Personal routine revision 3 uses the supplied workbook's formulas and deloads, with the existing four-day exercise lineup and set counts. RIR is not required in programmed sessions. Single-leg RDL and calf work use controlled recovery prescriptions. See [RTF-PROGRESSION.md](RTF-PROGRESSION.md) for formulas, adaptations, persistence, and verification.

Deployment: `b46e2f47c25c480bacbc9215c4cf7bd0`. Browser sign-in and OpenRouter secret bindings were inherited. Coach is configured but advice-only while this structured program is active. The old empty “Upper body — test” session remains current; finish it and start Upper A to enter week one. No real history was migrated.

## Private partner accounts — 2026-09-11

Deployed `99f248a82e794d96b1782c93b2285d35`. Account → Create partner access gives the partner a separate key and empty workout history. Plan now includes a personal starter/editor and reviewed program-file import for ChatGPT changes. See [PRIVATE-ACCOUNTS.md](PRIVATE-ACCOUNTS.md) for use and verification. Live sign-in and screens passed iPhone WebKit checks; original workout data and revision 4 matched the pre-deployment export. No original Sites history was imported.

## Combined sets and automatic workout flow — 2026-09-12

Deployment `ec77b6f4f4834dce8498c7c9870309ff` adds one-entry logging for both sides, exercise-by-exercise supersets, automatic advancement, carried working weights, clearable number fields and active-workout discard. See [WORKOUT-FLOW.md](WORKOUT-FLOW.md). All 48 pre-deployment entries and routine revision 4 were preserved.
