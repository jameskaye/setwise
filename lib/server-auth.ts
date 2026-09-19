import {env} from 'cloudflare:workers';
import {ApiError} from '@/db/routine-store';
import {query} from '@/db/store';
const encoder=new TextEncoder();
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function equal(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export async function actionOwner(r:Request){
 if(env.AUTH_MODE!=='standalone'||!env.OWNER_ID||!env.COACH_KEY_HASH)throw new ApiError(503,'Coach API is not configured on this host.');
 const token=r.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
 if(!token||!equal(await digest(token),env.COACH_KEY_HASH))throw new ApiError(401,'Invalid coach credential.');
 return env.OWNER_ID;
}
// Dedicated bearer credential for the Muse integration. Scoped to the owner's
// workout data only; rotate by replacing the MUSE_KEY_HASH worker secret.
export async function museOwner(r:Request){
 if(env.AUTH_MODE!=='standalone'||!env.OWNER_ID||!env.MUSE_KEY_HASH)throw new ApiError(503,'Muse API is not configured on this host.');
 const token=r.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
 if(!token||!equal(await digest(token),env.MUSE_KEY_HASH))throw new ApiError(401,'Invalid Muse credential.');
 return env.OWNER_ID;
}
async function signature(value:string){
 if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw new ApiError(503,'Browser sign-in is not configured.');
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function makeCookie(owner=env.OWNER_ID!,version=0){const expires=Date.now()+30*86400000;const value=`v2.${encodeURIComponent(owner)}.${version}.${expires}`;return `__Host-setwise=${value}.${await signature(value)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`;}
export async function browserOwner(r:Request){const owner=await resolveBrowserOwner(r);const expected=r.headers.get('X-Setwise-Account');if(expected&&expected!==owner)throw new ApiError(409,'The signed-in account changed. Reload before saving.');return owner;}
async function resolveBrowserOwner(r:Request){
 if(env.AUTH_MODE==='standalone'){
  if(!env.OWNER_ID)throw new ApiError(503,'Owner not configured.');
  const token=r.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-setwise='))?.slice(15);
  if(token?.startsWith('v2.')){
   const parts=token.split('.'),[,encoded,version,expires,sig]=parts,value=parts.slice(0,4).join('.');
   if(parts.length!==5||!/^\d{13}$/.test(expires)||Number(expires)<Date.now()||Number(expires)>Date.now()+31*86400000||!equal(sig,await signature(value)))throw new ApiError(401,'Sign in to open your workouts.');
   const owner=decodeURIComponent(encoded);
   if(owner===env.OWNER_ID&&version==='0')return owner;
   const row=await query('SELECT session_version FROM private_accounts WHERE owner = ?',owner).first();
   if(!row||String(row.session_version)!==version)throw new ApiError(401,'Sign in to open your workouts.');
   return owner;
  }
  const [expires,sig,...extra]=token?.split('.')??[];
  if(!expires||!/^\d{13}$/.test(expires)||Number(expires)<Date.now()||Number(expires)>Date.now()+31*86400000||!sig||!equal(sig,await signature(expires)))throw new ApiError(401,'Sign in to open your workouts.');
  if(extra.length)throw new ApiError(401,'Sign in to open your workouts.');
  // Existing signed cookies remain bound exclusively to the original owner.
  return env.OWNER_ID;
 }
 // Only the Sites build trusts dispatch identity. The standalone entry requires AUTH_MODE explicitly.
 const owner=r.headers.get('oai-authenticated-user-id');if(!owner)throw new ApiError(401,'Sign in to open your workouts.');return owner;
}
export function sameOrigin(r:Request){if(r.headers.get('sec-fetch-site')==='cross-site'||(r.headers.has('origin')&&r.headers.get('origin')!==new URL(r.url).origin))throw new ApiError(403,'Use the workout app for this action.');}
export function json(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});}
