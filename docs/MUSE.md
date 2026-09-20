# Muse integration

Muse (the AI assistant) talks to Setwise through a dedicated bearer-token API.
Setwise's D1 database remains the source of truth; the web app and Muse read
and write the same data.

## Endpoints

All endpoints live under `/api/muse` on the standalone Worker and require
`Authorization: Bearer <museKey>`. The credential is scoped to the owner's
workout data only.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/muse` | Today's workout: active session (with prescriptions and `configurationVersion`), exercise/variant catalog, saved routine + constraints, recent sets/sessions |
| POST | `/api/muse` | Targeted actions (same validated operations as the web app): `start`, `log`, `undo`, `update_set`, `delete_set`, `finish`, `abort`, `session` (rename/notes/reorder exercises), `variant`, `targets`, `coach` (training constraints in plain language), `supersets` |
| GET | `/api/muse/history?kind=sets&variantId=&sessionId=&offset=` | Paginated set history for progression questions |
| GET | `/api/muse/history?kind=sessions` | Recent sessions |
| GET | `/api/muse/history?kind=revisions` | Routine revision history |
| POST | `/api/muse/apply` | Replace the active workout's lineup/prescriptions. Needs `expectedConfiguration` from GET (optimistic concurrency) and a `requestId` (idempotent). Logged sets are preserved |
| GET/PUT | `/api/muse/routine` | Saved routine template (PUT affects future workouts only) |

Example read:

```sh
curl -s -H "Authorization: Bearer $MUSE_KEY" https://<worker>/api/muse | jq .activeSession
```

Example set log:

```sh
curl -s -X POST -H "Authorization: Bearer $MUSE_KEY" -H 'Content-Type: application/json' \
  -d '{"action":"log","id":"<uuid>","sessionId":"<session>","variantId":"<variant>",
       "weight":80,"reps":11,"rir":1,"side":"both","type":"working",
       "painLocation":"","painSeverity":0,"note":""}' \
  https://<worker>/api/muse
```

`side` is `left`/`right` for unilateral variants, `both` otherwise. Reuse the
same `id` when retrying: duplicate deliveries are idempotent and return the
current state instead of double-logging.

## Setup on an existing deployment

No extra secret is required: the Muse API accepts your existing site sign-in
key as its bearer token (`Authorization: Bearer <login key>`). Deploy the
latest code and enter the sign-in key into Muse's secure credential store when
prompted. It is never committed to git.

A dedicated token remains supported for least-privilege setups:

1. Generate a token (32+ URL-safe characters, shown once):
   ```sh
   MUSE_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
   echo "$MUSE_KEY"
   ```
2. Store only its SHA-256 hash on the Worker:
   ```sh
   node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "$MUSE_KEY"
   npx wrangler secret put MUSE_KEY_HASH --config standalone/wrangler.json
   # paste the hex hash when prompted
   ```
3. Deploy the latest code: `npx wrangler deploy --config standalone/wrangler.json`
4. Save `$MUSE_KEY` in a password manager, then enter it into Muse's secure
   credential store when prompted.

For new deployments, `node scripts/configure-cloudflare.mjs <D1 UUID>` now
generates `museKey` alongside the other keys and writes `MUSE_KEY_HASH` into
`.setwise-secrets/worker-secrets.json`.

## Rotation and revocation

Replace the secret and update the stored credential:

```sh
npx wrangler secret put MUSE_KEY_HASH --config standalone/wrangler.json
npx wrangler deploy --config standalone/wrangler.json
```

The old token stops working immediately. The browser login key and the legacy
coach key are unaffected.

## Muse workflow

When the user asks to change training data: read `GET /api/muse` (and history
if progression matters), determine the change, persist it through the API,
read the result back to verify, then summarize. Never claim a change succeeded
without the confirming read.
