import {museCall,historyResult} from '@/lib/coach-api';
export const dynamic='force-dynamic';
// Paginated training history. kind=sets (filter by variantId/sessionId),
// kind=sessions, kind=revisions.
export function GET(r:Request){return museCall(r,async owner=>historyResult(r,owner));}
