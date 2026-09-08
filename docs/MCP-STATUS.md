# Setwise MCP connection status

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
