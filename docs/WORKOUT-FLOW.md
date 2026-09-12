# Workout flow update — 2026-09-12

Live deployment: `ec77b6f4f4834dce8498c7c9870309ff`.

- Unilateral exercises use one entry for both sides. Weight and reps are per side; the load is not doubled. A single `side=both` record covers each side for counts and progression. Existing separate-side history remains unchanged. Where prior side recommendations differ, the combined suggestion uses the lower load.
- Supersets alternate exercises after completing both sides. Legacy separate-side requests finish the other side of the current round first. Warmups do not switch exercises.
- Completing the prescribed working sets automatically selects the next available exercise, including exercises outside a superset. Completing the final exercise opens the finish dialog; it does not automatically finish/save or advance the workout.
- The most recently logged working weight carries to the next set of that exercise and survives switching/reopening. The frozen program prescription still determines whether a changed-load rep-out qualifies for progression.
- Weight/reps inputs permit a genuine empty state, select their contents on focus, and disable logging while required entries are empty/invalid. A cleared field is not converted into zero.
- **Finish → Abort workout without saving → Discard workout** deletes only the active session, its sets, progression records, attached workout messages and linked proposals. A transactional active-session lock protects completed history. Abort retries are harmless; late set saves cannot recreate the deleted workout. The program week does not advance. The local pending set clears only after successful discard.

Verification: 16 focused API/engine tests, TypeScript, production client and Worker builds passed. iPhone WebKit checked combined entry, superset switching, changed-weight carryover, reload, undo, failed-save retry, abort cancellation/discard, blank inputs, unpaired automatic advancement, final finish dialog and 375/390px layout. Live authentication/assets were checked read-only; before/after exports preserved all 48 existing set entries, sessions, routine revision 4 and revision history. No original Sites history was imported.
