# Private accounts for two people

Deployed 2026-09-11 to https://setwise-test.setwise-jlk298.workers.dev.
Deployment: `99f248a82e794d96b1782c93b2285d35`.

## Sharing

1. The original user signs in with their existing key.
2. Open **Account → Create partner access**. Enter the partner's name.
3. Copy the sign-in details and share them privately. The key is shown only when created.
4. The partner signs in at the same site and selects **Set up my plan**.
5. On iPhone Safari, use Share → Add to Home Screen. The home-screen app may require its own sign-in.

No public signup or email service is needed. There is one partner slot. The organizer can replace a lost key in Account; replacement signs out the partner's previous sessions while preserving all their data. A failed response after creation may require reloading and replacing the key to obtain a new one.

## Plans

The **Plan** tab includes an editable four-day starter with no starting weights, history, or personal injury notes. Each account has separate exercise IDs, equipment increments, routine revisions, sessions, sets, and progression. Main/auxiliary lifts use the existing 21-week rep-out engine; accessories use rep-range progression; controlled lifts retain their weight. Normal logging and progression never call the LLM.

Use **Exercises** for equipment variants and weight increments. The plan editor supports workout/exercise changes, sets, rep ranges, progression profiles, and initial loads. Changes affect future sessions; an active workout retains its frozen prescription. Initial max changes do not override earned progression mid-cycle; select a new cycle to restart at week 1 using the edited initial maxes. Completed history remains intact.

Under **Program files for ChatGPT**, download the routine and personal exercise catalog, then import/paste the edited routine and review it before saving. The program download omits history and credentials. Imports validate the strict routine schema and must reference the receiving account's catalog; this is a personal program-edit format, not a cross-account history importer. A full personal backup remains available under Account.

## Storage and authentication

Migration `0004_private_accounts.sql` adds the private account table and insertion guards for cross-owner foreign keys. Partner keys contain 256 random bits; D1 stores only SHA-256 hashes. Signed, secure, HTTP-only cookies bind owner ID, credential version, and expiration. A key replacement increments the version. Existing original-owner cookies remain exclusively associated with the original account. The original login hash and session secret remain Cloudflare secrets.

All APIs resolve ownership from verified authentication; the Sites identity header is ignored by standalone hosting. Partner management requires the original owner. Snapshots, exports, coach requests and workout mutations remain owner-scoped. Browser set drafts are scoped to account IDs; legacy drafts are recovered only when the signed-in account owns the referenced session. Workout and plan mutations include the expected account ID to reject stale tabs after an account switch.

New profiles get an exercise catalog only: no sample history and no automatically started workout. Existing profiles are left intact. This release does not migrate the original Sites history.

## Verification

- 19 tests passed across the full API, engine, component and build-output suite, including independent rep-out progression, cross-account access rejection, credential tampering/replacement, legacy-cookie compatibility, database ownership guards, and original-data preservation.
- TypeScript and production client/Worker builds passed.
- Isolated iPhone WebKit flow passed: owner login, partner creation, logout, partner login, blank loads, plan save, set log/reopen, program import/review/save, draft isolation, and 375px layout. Route transport adapts redirects/cookies for WebKit interception; real deployed redirects were separately tested.
- Live iPhone WebKit sign-in and Account/Plan screens passed without modifying workouts. Before/after exports matched all existing workout data and routine revisions exactly (excluding the newly added account metadata).
- Physical iPhone/home-screen acceptance remains with the user. Original Sites history migration remains deferred.

