import {env} from 'cloudflare:workers';
import {ApiError} from '@/db/routine-store';
const encoder=new TextEncoder();
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function equal(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export async function actionOwner(r:Request){
 if(env.AUTH_MODE!=='standalone'||!env.OWNER_ID||!env.COACH_KEY_HASH)throw new ApiError(503,'Coach API is not configured on this host.');
 const token=r.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
 if(!token||!equal(await digest(token),env.COACH_KEY_HASH))throw new ApiError(401,'Invalid coach credential.');
 return env.OWNER_ID;
}
async function signature(value:string){
 if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw new ApiError(503,'Browser sign-in is not configured.');
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function makeCookie(){const expires=Date.now()+30*86400000;const value=String(expires);return `__Host-setwise=${value}.${await signature(value)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`;}
export async function browserOwner(r:Request){
 if(env.AUTH_MODE==='standalone'){
  if(!env.OWNER_ID)throw new ApiError(503,'Owner not configured.');
  const token=r.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-setwise='))?.slice(15);
  const [expires,sig]=token?.split('.')??[];
  if(!expires||!/^\d{13}$/.test(expires)||Number(expires)<Date.now()||Number(expires)>Date.now()+31*86400000||!sig||!equal(sig,await signature(expires)))throw new ApiError(401,'Sign in to open your workouts.');
  return env.OWNER_ID;
 }
 // Only the Sites build trusts dispatch identity. The standalone entry requires AUTH_MODE explicitly.
 const owner=r.headers.get('oai-authenticated-user-id');if(!owner)throw new ApiError(401,'Sign in to open your workouts.');return owner;
}
export function sameOrigin(r:Request){if(r.headers.get('sec-fetch-site')==='cross-site'||(r.headers.has('origin')&&r.headers.get('origin')!==new URL(r.url).origin))throw new ApiError(403,'Use the workout app for this action.');}
export function json(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});}
