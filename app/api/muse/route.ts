import {museCall,museCallRaw,context,readBody} from '@/lib/coach-api';
import {performWorkout} from '../workout/route';
export const dynamic='force-dynamic';
// GET: today's workout — active session with prescriptions, exercise catalog,
// saved routine (with constraints), and recent sets/sessions for context.
export function GET(r:Request){return museCall(r,context);}
// POST: targeted workout actions, same validated operations as the web app:
// start, log, undo, update_set, delete_set, finish, abort, session (rename/notes/reorder exercises),
// variant, targets, coach (training constraints), supersets, save_routine.
export function POST(r:Request){return museCallRaw(r,async owner=>performWorkout(owner,await readBody(r)));}
