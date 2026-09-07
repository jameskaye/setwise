import {env} from 'cloudflare:workers';
import {handleMcp} from '../lib/mcp';
import * as workout from '../app/api/workout/route';
import * as context from '../app/api/coach/context/route';
import * as routine from '../app/api/coach/routine/route';
import * as history from '../app/api/coach/history/route';
import * as apply from '../app/api/coach/apply/route';
import * as backup from '../app/api/export/route';
import {ApiError} from '../db/routine-store';
import {json,browserOwner,sameOrigin,digest,equal,makeCookie} from '../lib/server-auth';

const loginHTML=(error='')=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Setwise</title><style>body{font:18px system-ui;background:#f4f6f4;color:#193c2f;margin:0;padding:24px}main{max-width:380px;margin:15vh auto}input,button{box-sizing:border-box;width:100%;font:inherit;padding:18px;margin:12px 0;border:1px solid #b8c7b9;border-radius:12px}button{background:#d0ec94}p{line-height:1.5}</style><main><h1>setwise.</h1><p>Enter your private sign-in key. This device stays signed in for 30 days.</p><p role="alert">${error}</p><form method="post" action="/login"><label for="key">Sign-in key</label><input id="key" name="key" type="password" autocomplete="current-password" required maxlength="256"><button>Sign in</button></form></main></html>`;
export default {async fetch(r:Request):Promise<Response>{
 // Fail closed if this portable Worker is deployed without standalone auth configuration.
 if(env.AUTH_MODE!=='standalone')return json({error:'Standalone authentication must be configured before using this deployment.'},503);
 const url=new URL(r.url),path=url.pathname;
 try{
  if(path==='/mcp')return handleMcp(r);
  if(path==='/login'){
   if(r.method==='GET')return new Response(loginHTML(),{headers:{'Content-Type':'text/html','Cache-Control':'no-store'}});
   if(r.method!=='POST')return new Response(null,{status:405});
   sameOrigin(r);
   if(!env.LOGIN_KEY_HASH||!env.SESSION_SECRET||!env.OWNER_ID)throw new ApiError(503,'Sign-in is not configured.');
   const text=await r.text();if(text.length>1000)throw new ApiError(413,'Request too large');
   const key=new URLSearchParams(text).get('key')??'';
   if(!/^[A-Za-z0-9_-]{32,256}$/.test(key)||!equal(await digest(key),env.LOGIN_KEY_HASH))return new Response(loginHTML('Sign-in key was not recognized.'),{status:401,headers:{'Content-Type':'text/html','Cache-Control':'no-store'}});
   return new Response(null,{status:303,headers:{Location:'/', 'Set-Cookie':await makeCookie(),'Cache-Control':'no-store'}});
  }
  if(path==='/logout'&&r.method==='POST'){sameOrigin(r);return new Response(null,{status:303,headers:{Location:'/login','Set-Cookie':'__Host-setwise=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'}});}
  const routes:Record<string,Record<string,(r:Request)=>Promise<Response>>>={
   '/api/workout':{GET:workout.GET,POST:workout.POST},'/api/coach/context':{GET:context.GET},'/api/coach/routine':{GET:routine.GET,PUT:routine.PUT},'/api/coach/history':{GET:history.GET},'/api/coach/apply':{POST:apply.POST},'/api/export':{GET:backup.GET},
  };
  if(routes[path]){const fn=routes[path][r.method];return fn?fn(r):new Response(null,{status:405});}
  if(path.startsWith('/api/'))return json({error:'Not found'},404);
  await browserOwner(r);
  if(!env.ASSETS)throw new ApiError(503,'App assets are not configured.');
  return env.ASSETS.fetch(r);
 }catch(e){if(e instanceof ApiError){if(e.status===401&&!path.startsWith('/api/'))return new Response(null,{status:303,headers:{Location:'/login'}});return json({error:e.message},e.status);}console.error('Setwise request failed');return json({error:'Request failed. Please retry.'},503);}
}};
