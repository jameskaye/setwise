import {apiCall,applyWorkout,readBody} from '@/lib/coach-api';
export const dynamic='force-dynamic';
export function POST(r:Request){return apiCall(r,async owner=>applyWorkout(owner,await readBody(r)));}
