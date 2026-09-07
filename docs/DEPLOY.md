# Deploy Setwise on your Cloudflare account

The existing private Site remains the production source of truth until the iPhone acceptance test and data migration pass. No live workout data is embedded in this repository. The standalone build reuses the same React workout component, coach engine, API handlers, and D1 schema. It serves a small SPA instead of the Sites/Vinext server renderer.

## What is ready

- Browser logging with a separate private sign-in key and secure HttpOnly cookie.
- Bearer-authenticated GPT Actions: context/history, read and save future routines, adjust active session prescriptions.
- Immutable routine revisions with optimistic concurrency and safe retry IDs.
- Structured session prescriptions preserved when future routines change.
- Owner-scoped backup export at `/api/export`.
- Small independent Worker + static client build, using the existing locked dependencies.

## Accounts needed

A GitHub account with permission to create a private repository, your Cloudflare account, and access to the GPT editor. GitHub's connected-app account list was empty in this session; no Cloudflare account credential was available. No repository, paid plan, domain, Worker or GPT was created on those accounts.

GitHub is source storage, not the live workout database. Do not commit workouts, exports, or credentials there. Hosting and database can start on Cloudflare's free tier. No external LLM is called, and no OpenAI API billing key is needed.

## Source and deployment

1. Create a private `setwise` GitHub repository and push this source. Keep the existing Sites remote if resuming here; add the GitHub repository as a separate remote. A source ZIP has no Git history; initialize a new repository if using that copy.
2. Install Node 22.13+ and run `npm ci`. Run `npm run test:unit` and `npx tsc --noEmit`.
3. Run `npx wrangler login` on your computer and select your own account. Then create the database:

```sh
npx wrangler d1 create setwise
node scripts/configure-cloudflare.mjs YOUR_DATABASE_UUID
```

The configuration script generates two random keys and a session-signing secret. It refuses to overwrite existing configuration. Only hashes of the two access keys are stored on the Worker. Save `.setwise-secrets/credentials.json` in your password manager. Never paste it into a chat or commit it.

4. Build and dry-run the Worker:

```sh
npm run build:standalone
npx wrangler deploy --config standalone/wrangler.json --dry-run
```

5. Upload secrets, apply migrations, and deploy. All three use your local, ignored configuration:

```sh
npx wrangler secret bulk .setwise-secrets/worker-secrets.json --config standalone/wrangler.json
npx wrangler d1 migrations apply setwise --remote --config standalone/wrangler.json
npx wrangler deploy --config standalone/wrangler.json
```

The schema-only migrations are append-only. Never modify an applied migration. The initial test deployment has separate seeded sample data, not the live Site's real history.

6. Open the returned HTTPS workers.dev URL. Sign in with loginKey. Configure the private GPT per `docs/gpt/SETUP.md`, using coachKey as its Bearer API key. Never share that GPT: the key authorizes its single owner's workout data. The website has its own browser login and does not depend on Sites identity headers.

7. Pass the native iPhone read → change → reload test BEFORE switching your real workout logging. Web/Node tests do not establish native mobile GPT compatibility.

## Migrate real workout data after acceptance

The Site and external Worker use different owner identities and separate databases. Copying the source does not copy workout history.

- Download `/api/export` while signed into the updated existing Site. The endpoint requires the owner session. A backup has a format/version marker, all sets, sessions, variants, messages, recommendations, and routine revisions. Keep this sensitive file out of Git.
- Use a NEW empty D1 database for the final import; keep the test database separate. Configure it using a separate checkout/configuration so the setup script never overwrites a working deployment's credentials.
- `scripts/backup-to-sql.mjs` validates a backup, preserves record IDs, remaps ownership to the standalone owner, and writes an SQL import file. Apply all schema migrations to the new empty database first. Check every application table is empty. The import script does not delete data or merge with existing records.
- Import the generated SQL with Wrangler D1 execute. Compare all table counts and several historical sets against the old Site; verify the active session and routine in the new app before switching.
- Freeze logging briefly during final export/import. Leave the original Site intact as a fallback. Do not log concurrently into both stores.

```sh
node scripts/backup-to-sql.mjs /PRIVATE/PATH/setwise-backup.json personal-owner /PRIVATE/PATH/setwise-import.sql
npx wrangler d1 execute setwise --remote --config standalone/wrangler.json --file /PRIVATE/PATH/setwise-import.sql
```

## Operational notes

- The standalone entry refuses requests unless AUTH_MODE is standalone. It never trusts incoming oai-authenticated-user-id headers. Sites mode remains dispatch-authenticated.
- Do not put an interactive Cloudflare Access login in front of GPT Action endpoints. They use the separate coach Bearer credential. Browser endpoints use the signed cookie, and writes check Origin.
- The random login key is intended for a password manager; this is a single-user app, not a public account-registration system. Use a proper identity provider/OAuth before adding other people.
- To revoke GPT access, replace COACH_KEY_HASH and update the private GPT's key. To revoke browser sessions, rotate SESSION_SECRET. Log out with POST /logout.
- Routine revision history supports undo; raw historical set edits are intentionally absent from the coaching API.
- Notes are saved as context. The in-app quick instruction parser is still rule-based; open your private GPT for conversation. No in-app LLM has been added.
