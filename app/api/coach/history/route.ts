import {apiCall,routineHistory,snapshot} from '@/lib/coach-api';
import {ApiError} from '@/db/routine-store';
export const dynamic='force-dynamic';
export function GET(r:Request){return apiCall(r,async owner=>{
 const u=new URL(r.url),offset=Number(u.searchParams.get('offset')??0),kind=u.searchParams.get('kind')??'sets';
 if(!Number.isSafeInteger(offset)||offset<0)throw new ApiError(400,'Invalid offset');
 if(kind==='revisions'){const before=Number(u.searchParams.get('before')??Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(before)||before<1)throw new ApiError(400,'Invalid revision cursor');const page=await routineHistory(owner,before),items=page.slice(0,1);return {items,nextBefore:page.length>1?items[0].revision:null};}
 const s=await snapshot(owner),variant=u.searchParams.get('variantId'),session=u.searchParams.get('sessionId');
 if(kind==='sessions'){const rows=s.sessions.filter(x=>!session||x.id===session).sort((a,b)=>b.startedAt-a.startedAt||b.id.localeCompare(a.id));const items=rows.slice(offset,offset+5);return {items,nextOffset:offset+items.length<rows.length?offset+items.length:null};}
 if(kind!=='sets')throw new ApiError(400,'Unknown history kind');
 const filtered=s.sets.filter(x=>(!variant||x.variantId===variant)&&(!session||x.sessionId===session)).sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
 const items=filtered.slice(offset,offset+30);return {items,total:filtered.length,nextOffset:offset+items.length<filtered.length?offset+items.length:null};
 });}
