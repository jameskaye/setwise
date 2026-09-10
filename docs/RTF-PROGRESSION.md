# Rep-out progression

Source: user-supplied `SBS Strength Program reps to failure.xlsx`, Setup rows 3–6 (main), 9–14 (auxiliary), with formulas traced to Quick Setup and the 4x workout sheet. Workbook example maxes are not user data and were not imported.

## Rules

`lib/rtf.ts` owns the 21-week main and auxiliary intensity, normal-rep, and rep-out-target schedules. Working weight is training max × that week's intensity, rounded to the exercise increment. The last prescribed working set is the rep-out; the set count includes it. Warmups never count. Normal sets keep their weight; zero RIR does not reduce the next set. RIR is optional and saved as null by the program UI.

Rep-out versus target changes the **training max**, not the rounded working weight:

| Reps versus target | Change |
|---|---:|
| −2 or fewer | −5% |
| −1 | −2% |
| Equal | 0% |
| +1 | +0.5% |
| +2 | +1% |
| +3 | +1.5% |
| +4 | +2% |
| +5 or more | +3% |

The next week applies its scheduled intensity to the updated training max. Training maxima are not rounded. Left and right are separate, as are different workouts using the same variant. The optional spreadsheet single-at-8 override is not implemented.

Weeks 7, 14, and 21 use 60% for main lifts and 50% for auxiliaries, five reps, and **no rep-out**. This overrides Setup's generic rep lookup, matching 4x!AS5:AU5, CP5:CR5 and EM5:EO5. The previous training week's result feeds the deload training max; deload performance does not adjust it.

## Adaptations

The personal four-day exercise lineup and existing working-set counts are retained instead of the workbook's sample five sets per lift. Bench and the primary shoulder press use the main schedule; selected presses and rows use auxiliary progression. Leg extension and other accessories use double progression: finish all sets at the top of the range with the same load and no recorded pain before adding one equipment increment next session. Bodyweight/core work, RDL and calves use a controlled profile with no automatic increase. Accessories/controlled work deload to half sets rounded up and 90% load rounded to equipment, while SBS lifts retain their set counts as in the sheet.

Starting training maxima are explicit estimates from the user's reported performance, never synthetic logged sets. Unknown RTF loads calibrate from the first working weight divided by the scheduled intensity. Subsequent sets keep that first load. The final rep-out result then adjusts the inferred max if all qualifying sets were completed. No estimated barbell-to-dumbbell conversion is used.

## Persistence and integrity

Routine revisions contain a validated `program` configuration. Each new session freezes its week and per-lift schedule, weights, increments, and training maxima inside the existing D1 `sessions.rules` JSON. No schema migration is needed. The next session derives its state from completed frozen sessions and their actual sets; existing history is not rewritten.

Finishing a session with any working sets advances that workout by one week, even when some exercises were omitted. An empty finished session does not advance. A workout cannot advance ahead of the other workouts in the same cycle. Week 21 ends the cycle; a new program ID must explicitly start a new cycle.

Incomplete sets, changed working loads, pain, skipped exercises, modified constraints or missed normal-set reps hold that lift's training max. A zero-rep result is accepted only on a rep-out set. Undo removes the latest set and its progression; the final result is recalculated from remaining sets. Finished sessions cannot be undone. Session finish and set writes check current active state, rules and set count; stale writes return a conflict rather than silently advancing. Retrying a finished session or an already saved set is idempotent.

The browser-authenticated `save_routine` operation accepts an explicit validated routine with optimistic revision checks. The optional OpenRouter coach receives program context but is advice-only while a program is configured; both proposal and apply paths protect progression from incompatible legacy RIR operations. The old Site's real history remains separate until the user's physical iPhone test passes.

## Validation

- Formula tests exercise all 21 weeks, every adjustment threshold, unilateral differences, changed-load/pain/incomplete holds, calibration, accessory progression, controlled loads and cycle end.
- API tests save/reopen the program, log with null RIR, undo, retry saved sets after finish, retry finish, hold empty sessions, prevent jumping weeks and recover independent left/right maxima.
- iPhone WebKit UI tests check fixed load, normal-to-final-set transition, null-RIR save payload, deload rendering and 375/390px widths. These use isolated fixtures; service workers are excluded from mocked requests. The separate mobile test covers live offline/retry behavior.
- Physical iPhone Safari/home-screen verification remains the user's acceptance step.
