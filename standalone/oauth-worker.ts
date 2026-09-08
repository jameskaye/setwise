import {OAuthProvider, type OAuthHelpers} from '@cloudflare/workers-oauth-provider';
import app from './worker';
import {handleMcp} from '../lib/mcp';
import {digest,equal} from '../lib/server-auth';

interface OAuthEnv { OAUTH_PROVIDER:OAuthHelpers; OWNER_ID:string; LOGIN_KEY_HASH:string; AUTH_MODE:string }
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const origin='https://setwise-test.setwise-jlk298.workers.dev';
const scope='setwise:workouts';
const provider=new OAuthProvider<OAuthEnv>({
 apiRoute:'/mcp',
 apiHandler:{async fetch(request:Request,env:OAuthEnv,ctx:{props:unknown}){
  const props=ctx.props as {owner?:string;scopes?:string[]};
  if(env.AUTH_MODE!=='standalone'||props.owner!==env.OWNER_ID||!props.scopes?.includes(scope))return new Response('Forbidden',{status:403});
  return handleMcp(request,props.owner);
 }},
 defaultHandler:{async fetch(request:Request,env:OAuthEnv){
  const url=new URL(request.url);
  if(url.pathname!=='/authorize')return app.fetch(request);
  if(env.AUTH_MODE!=='standalone'||!env.LOGIN_KEY_HASH||!env.OWNER_ID)return new Response('Not configured',{status:503});
  try{
   const auth=await env.OAUTH_PROVIDER.parseAuthRequest(request);
   const client=await env.OAUTH_PROVIDER.lookupClient(auth.clientId);
   if(!client)return new Response('Unknown client',{status:400});
   if(auth.scope.some(s=>s!==scope))return new Response('Unsupported scope',{status:400});
   if(request.method==='GET'){
    const csrf=crypto.randomUUID();
    const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Setwise Test</title><style>body{font:18px system-ui;max-width:440px;margin:12vh auto;padding:24px;line-height:1.5}input,button{box-sizing:border-box;width:100%;padding:16px;margin:12px 0;font:inherit}button{background:#d0ec94;border:1px solid #193c2f;border-radius:10px}</style><h1>Connect Setwise Test</h1><p><strong>${escape(client.clientName||'MCP client')}</strong> requests access to read and change your test workouts, routines and logged sets.</p><p>This test database is separate from your real history.</p><p>Return address: ${escape(new URL(auth.redirectUri).origin)}</p><form method="post"><input type="hidden" name="csrf" value="${csrf}"><label for="key">Your Setwise sign-in key</label><input id="key" name="key" type="password" autocomplete="current-password" required maxlength="256"><button name="consent" value="allow">Allow test workout access</button></form></html>`;
    return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Set-Cookie':`__Host-setwise-oauth=${csrf}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=600`,'Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(auth.redirectUri).origin}; frame-ancestors 'none'; base-uri 'none'`,'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
   }
   if(request.method!=='POST')return new Response(null,{status:405});
   if(request.headers.get('origin')!==url.origin)return new Response('Invalid origin',{status:403});
   const raw=await request.text();if(raw.length>2000)return new Response('Too large',{status:413});
   const form=new URLSearchParams(raw);
   const csrf=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-setwise-oauth='))?.split('=')[1];
   const key=form.get('key')||'';
   if(!csrf||!equal(csrf,form.get('csrf')||'')||form.get('consent')!=='allow')return new Response('Reload the authorization page and retry.',{status:403});
   if(!/^[A-Za-z0-9_-]{32,256}$/.test(key)||!equal(await digest(key),env.LOGIN_KEY_HASH))return new Response('Sign-in key was not recognized. Go back and retry.',{status:401});
   const {redirectTo}=await env.OAUTH_PROVIDER.completeAuthorization({request:auth,userId:env.OWNER_ID,metadata:{clientName:client.clientName},scope:[scope],props:{owner:env.OWNER_ID,scopes:[scope]}});
   return new Response(null,{status:303,headers:{Location:redirectTo,'Cache-Control':'no-store','Set-Cookie':'__Host-setwise-oauth=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'}});
  }catch{return new Response('Authorization request is invalid. Restart the connection from your MCP client.',{status:400});}
 }},
 authorizeEndpoint:'/authorize',tokenEndpoint:'/oauth/token',clientRegistrationEndpoint:'/oauth/register',
 scopesSupported:[scope],allowPlainPKCE:false,accessTokenTTL:3600,refreshTokenTTL:30*86400,
 resourceMetadata:{resource:origin+'/mcp',authorization_servers:[origin],scopes_supported:[scope],resource_name:'Setwise Test'},
});
export default provider;
