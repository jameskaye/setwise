import {env} from 'cloudflare:workers';
import {query} from '@/db/store';
import {ApiError} from '@/db/routine-store';
import {browserOwner,digest,json,sameOrigin} from './server-auth';
import {z} from 'zod';

export async function accountInfo(owner:string){
 const row=env.AUTH_MODE==='standalone'&&owner!==env.OWNER_ID?await query('SELECT name FROM private_accounts WHERE owner = ?',owner).first():null;
 return {id:owner,name:row?String(row.name):'My account',canInvite:env.AUTH_MODE==='standalone'&&owner===env.OWNER_ID};
}
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('create_partner'),name:z.string().trim().min(1).max(60)}).strict(),
 z.object({action:z.literal('reset_partner_key'),expectedVersion:z.number().int().positive()}).strict(),
]);
export async function accountRoute(r:Request){
 const owner=await browserOwner(r),account=await accountInfo(owner);
 if(r.method==='GET'){
  const partner=account.canInvite?await query('SELECT name, session_version AS version FROM private_accounts WHERE slot = ?', 'partner').first():null;
  return json({account,partner});
 }
 if(r.method!=='POST')return new Response(null,{status:405});
 sameOrigin(r);if(!account.canInvite)throw new ApiError(403,'Only the account organizer can manage partner access.');
 const text=await r.text();if(text.length>1000)throw new ApiError(413,'Request too large');
 let body:unknown;try{body=JSON.parse(text);}catch{throw new ApiError(400,'Check the account details.');}
 const parsed=input.safeParse(body);if(!parsed.success)throw new ApiError(400,'Check the account details.');
 const a=parsed.data,key=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join(''),hash=await digest(key);
 if(a.action==='create_partner'){
  const result=await query('INSERT OR IGNORE INTO private_accounts (owner,slot,name,key_hash,session_version,created_at) VALUES (?,?,?,?,1,?)','member-'+crypto.randomUUID(),'partner',a.name,hash,Date.now()).run();
  if(!result.meta.changes)throw new ApiError(409,'Partner access already exists. Reload to manage it.');
 }else{
  const result=await query('UPDATE private_accounts SET key_hash = ?, session_version = session_version + 1 WHERE slot = ? AND session_version = ?',hash,'partner',a.expectedVersion).run();
  if(!result.meta.changes)throw new ApiError(409,'Partner access changed. Reload before resetting the key.');
 }
 return json({key,loginUrl:new URL('/login',r.url).href});
}
