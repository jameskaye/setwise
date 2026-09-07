import {apiCall,currentRoutine,saveRoutine,snapshot,readBody} from '@/lib/coach-api';
export const dynamic='force-dynamic';
export function GET(r:Request){return apiCall(r,async owner=>currentRoutine(owner,await snapshot(owner)));}
export function PUT(r:Request){return apiCall(r,async owner=>({saved:true,scope:'future workouts',...(await saveRoutine(owner,await readBody(r),await snapshot(owner)))}));}
