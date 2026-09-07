import {browserOwner,json} from '@/lib/server-auth';
import {snapshot} from '@/db/store';
import {ApiError,routineHistory} from '@/db/routine-store';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{
 const owner=await browserOwner(r),data=await snapshot(owner),revisions=[];let before=Number.MAX_SAFE_INTEGER;
 for(;;){const page=await routineHistory(owner,before);revisions.push(...page);if(page.length<10)break;before=page.at(-1)!.revision;}
 return new Response(JSON.stringify({format:'setwise-backup',version:1,exportedAt:Date.now(),data,revisions}),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="setwise-backup.json"','Cache-Control':'no-store, private'}});
 }catch(e){return json({error:e instanceof ApiError?e.message:'Export unavailable'},e instanceof ApiError?e.status:503);}}
