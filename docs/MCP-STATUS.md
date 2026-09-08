# Setwise MCP connection status

## Update: 2026-09-08 Cloudflare test deployment

Worker `setwise-test` is deployed at https://setwise-test.setwise-jlk298.workers.dev with MCP at `/mcp`.
D1 `setwise-test` is `ca6ec25a-dd17-4798-8300-ba0b9650202b`; OAuth KV is `595b83da34744d42b1824d55d774cf33`, in account `09c8c2fe171d03bfbdea44e8ad445c07`.
Deployment ID: `96690d44d1eb4bb1b4a57cffd2352842`. All three original schema migrations are applied and recorded in `d1_migrations`.

The deployed entry is `standalone/oauth-worker.ts`, using `@cloudflare/workers-oauth-provider` 0.10.3. OAuth discovery, DCR, S256 PKCE, owner sign-in/consent, Origin/CSRF checks, scoped tokens, refresh, and replay revocation are implemented and tested live. The OAuth origin is deliberately fixed to this test deployment; production will require its own configuration and database.

All 10 local tests, the standalone build and TypeScript checks pass. `scripts/test-live-mcp.mjs` verifies OAuth, seven-tool discovery, authenticated reads, an idempotent active-workout change, and matching persisted data through the website endpoint without redeployment. The script revokes its temporary grant with its final replay test.

The active synthetic workout is `Upper body — test`, with incline dumbbell bench press, 3 sets, 8–12 reps and 2 RIR. No real workout history has been exported or imported. The original private Site remains unchanged and is the source of truth for real history.

Credentials are in ignored `.setwise-secrets/credentials.json`: `loginKey` for website login and OAuth consent; `coachKey` for the separate REST/GPT Actions API. Never paste credentials into chat or include them in URLs.

The user approved enabling ChatGPT Developer mode and connecting Setwise Test. Developer mode is enabled and the ChatGPT app is created (`asdk_app_6aa09bb88ea48191820d65b4e72e2d70`), with correctly discovered DCR and scope. OAuth linking is in progress. A direct MCP test does not establish an installed ChatGPT connection. Native iPhone read → change → website reload acceptance remains pending and must pass before real-history migration.

Browser blocker: Chrome shows ERR_BLOCKED_BY_CLIENT when submitting the consent form. A discovered CSP omission was corrected to permit the validated OAuth redirect origin, then deployed and type-checked; Chrome still blocks submission. No browser protection was disabled. Consent and ChatGPT setup tabs were retained for manual completion. The user can retrieve loginKey from the local credentials file and submit the consent page. If the OAuth state expires, restart 'Sign in with Setwise Test' for the existing app rather than creating a duplicate.

## Prior status (superseded by update above)

Checked 2026-09-08.

The existing private Site now includes an authenticated `/mcp` endpoint with seven tools: read training context, read routine, read paginated history, save future routine, adjust active workout, add exercise variant, and log a set. All use the same application database functions as the website. Local integration tests verify an MCP workout change appears through the website data endpoint without rebuilding it.

Activation is NOT complete. Sites returned: `Sites MCP is not enabled for this Site owner.` A successfully deployed `/mcp` route does not mean a ChatGPT connection exists. Do not work around this platform restriction by passing Sites sign-in bypass credentials to a plugin.

Cloudflare has been offered for account installation/authorization. No connection is confirmed. Use the portable deployment in `standalone/` after authorization. The portable REST API accepts a separate Bearer credential and the GPT Actions schema is in `docs/gpt/`. The portable MCP transport also accepts that credential, but custom ChatGPT MCP setup requires a supported authentication flow; the current portable build does not implement OAuth discovery/authorization. Do not label it connectable through ChatGPT OAuth until that is implemented and tested, or use the prepared GPT Actions path if verified on the user's iPhone.

Required acceptance test before history migration:

1. Deploy to an empty test database using the owner's authorized hosting account.
2. Configure a supported authenticated ChatGPT connection.
3. From the user's native iPhone ChatGPT app, read a session, change the lineup, and read it back.
4. Confirm the website shows the same stored change without a deployment.
5. Only then export the real Site history, import into an empty production database, and use the external app as the single source of truth.

Never edit source code or redeploy a website to make an ordinary workout adjustment. Never claim a plugin is connected based only on source code, local tests, or a successful Site deployment.
