# Setwise Coach setup

Status: implementation and local integration tests only. No external host or GPT has been created. `openapi.json` deliberately uses `https://setwise.example.invalid` until a real host exists.

1. Deploy the standalone app using `docs/DEPLOY.md`.
2. In the checkout run `node scripts/gpt-schema.mjs https://YOUR-ACTUAL-HOST`.
3. In ChatGPT on the web, create a GPT named **Setwise Coach**. Set visibility to **Only me**. Paste `instructions.md` as the instructions.
4. Add an Action; paste the generated `openapi.json`. Choose API Key authentication with Bearer. Put the separately generated coach key in the authentication field, never in instructions, source, or the schema. This key is for YOUR workout API, not an OpenAI API billing key.
5. Save. Test reads and writes in the GPT editor. Keep it private: its credential authorizes access to the one owner's records.
6. Open this GPT on the native iPhone ChatGPT app and complete the acceptance test below. Account/model/mobile availability must be verified here, not assumed from a web test.

Suggested conversation starters:
- Review my last three leg workouts and adjust next week's routine.
- What changed in my training plan recently?
- Keep my next workout under 45 minutes.

## Required iPhone acceptance test before moving real data

Use the new host's isolated seeded account only:
1. Ask for the current routine and the single-leg extension history; expect the supplied 95 lb × 10 record with unknown date, side, and RIR.
2. Ask: "For future workouts, change single-leg extension to 12–15 reps, two sets per side, three RIR. Keep everything else. Save this."
3. Verify a saved revision in the GPT response and in Setwise → Coach → Refresh from coach.
4. Finish the empty initial session. Start the routine's workout. Verify 12–15 reps, two sets and three RIR in the app.
5. Ask: "For today's workout only, change extension to 10–12 reps. Save it." Refresh the app and verify today's range changed while the future routine still says 12–15.
6. Open a new GPT conversation and ask it to read the saved routine. Verify it retrieves the same revision.
7. Restore the old routine using revision history. The restore must create a new revision.

If native iPhone Actions cannot execute, stop before data migration. Retain the live Sites app. Web success alone is not acceptance. The same authenticated service functions can later support MCP, but no MCP server has been implemented or connected in this version.

Actions are marked non-consequential so the client can offer Always Allow for these reversible plan edits. The GPT still follows your request scope; the API rejects stale writes and records revisions. ChatGPT may ask for connection/tool approval.
