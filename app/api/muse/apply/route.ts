import {museCall,applyWorkout,readBody} from '@/lib/coach-api';
export const dynamic='force-dynamic';
// Replace the active workout's exercise lineup and prescriptions.
// Requires expectedConfiguration from GET /api/muse (optimistic concurrency)
// and a requestId (idempotent). Logged sets are preserved.
export function POST(r:Request){return museCall(r,async owner=>applyWorkout(owner,await readBody(r)));}
