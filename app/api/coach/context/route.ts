import {apiCall,context} from '@/lib/coach-api';
export const dynamic='force-dynamic';
export function GET(r:Request){return apiCall(r,context);}
