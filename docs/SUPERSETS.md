# Supersets

Workout templates have optional `supersets: [variantId, variantId][]`. Pairs must use distinct exercises in that workout; each exercise belongs to at most one pair. The user's four-day routine has ten pairings translated from its existing notes. These are saved in routine revision 4 and copied to `session.rules.supersets` when starting a workout. Current Upper A was backfilled with its two pairings without changing its program, sets, or progression.

The logger shows both exercise buttons and an Edit pairing control. Automatic switching is on by default; Superset options can turn it off for this device. Manual buttons remain available. The pairing editor changes today's session only. Changes persist in D1 and use an expected-pairings comparison plus a conditional rules update, preserving other session rules. Exact repeated saves are no-ops. Saved future pairings can be changed through the validated routine operation.

After a confirmed working-set save, the navigator selects the available exercise with the fewest completed rounds, preferring the partner on a tie. A unilateral round needs one set on each side. This yields A-left → B-left → A-right → B-right for two unilateral exercises, and A → B-left → B-right for a bilateral/unilateral pair. Unequal set counts leave the unfinished exercise available. Paused/skipped/completed sides are excluded by the existing recommendation engine. Warmups do not trigger exercise switching.

The switch is calculated from confirmed saved sets; failed saves stay on the current exercise. Retry and reopen use the same calculation. Undo last saved set is available within the pair even after switching away; it returns to the undone exercise and side. Each exercise's own recommendation supplies its load, reps, and rep-out target. Pairing never edits those targets or training maxima.

Validation: pure navigation tests cover bilateral/unilateral/mixed pairs, unequal goals, pain, skips, undo, reload, and invalid groupings. Authenticated API tests verify freezing, updates, stale conflicts, membership checks, and unchanged program/history. iPhone WebKit UI tests verify automatic/manual switching, per-side loads, reopen, undo, failed-save retry, auto-switch preference, editor, and 375/390px widths. Live read-only WebKit verifies the deployed pairing UI without logging sets.

Deployment: `14d953bc62f941328c1b4a1d339eecbd`. No schema migration and no original-Site history migration.
