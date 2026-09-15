import {webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {accountHarness} from '../tests/account-harness.mjs';
const h=await accountHarness(),browser=await webkit.launch({headless:true});
mkdirSync('outputs/accounts-mobile',{recursive:true});
try{
 const context=await browser.newContext({...devices['iPhone 13'],serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request();
  if(new URL(req.url()).pathname==='/sw.js')return route.fulfill({status:200,contentType:'text/javascript',body:''});
  const headers=await req.allHeaders();headers.cookie=(await context.cookies(req.url())).map(c=>c.name+'='+c.value).join('; ');const r=await h.worker.fetch(new Request(req.url(),{method:req.method(),headers,...(['GET','HEAD'].includes(req.method())?{}:{body:req.postDataBuffer()})}));
  if(r.status>=400)console.log(req.method(),new URL(req.url()).pathname,r.status,await r.clone().text());
  if(r.status===303)return route.fulfill({status:200,headers:{...Object.fromEntries(r.headers),'Content-Type':'text/html'},body:`<meta http-equiv="refresh" content="0;url=${r.headers.get('location')}">`});
  await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer())});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const cookie=(await h.login(h.loginKey)).headers.get('set-cookie').split(';')[0];let data=await (await h.call('/api/workout',cookie)).json();const vs=data.variants.slice(0,2);const exercises=vs.map(v=>({variantId:v.id,minReps:8,maxReps:12,sets:3,targetRir:0}));const routine={name:'RTF coach test',notes:'',constraints:[],workouts:[{id:'a',name:'A',notes:'',timeLimitMinutes:null,exercises}],program:{id:'test-cycle',lifts:vs.map(v=>({workoutId:'a',variantId:v.id,profile:'main',trainingMax:100}))}};
 await h.call('/api/workout',cookie,{action:'save_routine',requestId:'setup',expectedRevision:0,reason:'test',routine});await h.call('/api/workout',cookie,{action:'start',id:'active',name:'A',plan:vs.map(v=>v.id),workoutId:'a',expectedRoutineRevision:1});
 globalThis.__accountEnv.OPENROUTER_API_KEY='test-only';const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({reply:'Proposed skipping leg press today. Apply to save.',operation:{type:'adjust_workout',workout:{name:'A',exercises:[exercises[0]]}}})}}]});
 await page.goto('https://setwise.test/login');await page.getByLabel('Sign-in key',{exact:true}).fill(h.loginKey);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Tell coach',exact:false}).click();await page.getByRole('textbox',{name:/What would you like to change/}).fill('Skip leg press today');await page.getByRole('button',{name:'Ask coach',exact:true}).click();await page.getByRole('button',{name:'Apply these changes',exact:false}).waitFor();assert.equal(JSON.parse(h.sql.prepare('SELECT plan FROM sessions WHERE id=?').get('active').plan).length,2);await page.getByText('Skip today: Leg press',{exact:true}).waitFor();await page.getByRole('button',{name:'Apply these changes',exact:false}).click();await page.getByText('Saved to your workout database.',{exact:true}).waitFor();assert.equal(JSON.parse(h.sql.prepare('SELECT plan FROM sessions WHERE id=?').get('active').plan).length,1);assert.equal(errors.length,0,errors.join('\n'));console.log('iPhone coach proposal preview and Apply persist an RTF workout edit.');globalThis.fetch=originalFetch;await context.close();
}finally{await browser.close();h.close();}
