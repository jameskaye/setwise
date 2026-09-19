import {museCall,currentRoutine,saveRoutine,snapshot,readBody} from '@/lib/coach-api';
export const dynamic='force-dynamic';
// Saved routine: the program template future workouts are built from,
// including training constraints. PUT affects future sessions only.
export function GET(r:Request){return museCall(r,async owner=>currentRoutine(owner,await snapshot(owner)));}
export function PUT(r:Request){return museCall(r,async owner=>({saved:true,scope:'future workouts',...(await saveRoutine(owner,await readBody(r),await snapshot(owner)))}));}
