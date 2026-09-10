import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {webkit,devices} from 'playwright';
await build({entryPoints:['lib/rtf.ts','lib/routine.ts'],bundle:true,format:'esm',platform:'node',outdir:'outputs/rtf-modules'});
const {buildProgramSession}=await import('../outputs/rtf-modules/rtf.js');
const {routineSchema}=await import('../outputs/rtf-modules/routine.js');
const original=JSON.parse(fs.readFileSync('.setwise-secrets/rtf-before.json'));
const routine=routineSchema.parse(JSON.parse(fs.readFileSync('.setwise-secrets/rtf-request.json')).routine);
let state={...structuredClone(original),sessions:[],sets:[],progressions:[],messages:[],routine:{...original.routine,revision:3,routine}};
const program=buildProgramSession(routine,'upper-a',state);
state.sessions=[{id:'mobile-test',name:'Upper A — bench strength',status:'active',startedAt:Date.now(),endedAt:null,notes:routine.workouts[0].notes,plan:routine.workouts[0].exercises.map(p=>p.variantId),prescriptions:routine.workouts[0].exercises,rules:{program}}];
const server=http.createServer((req,res)=>{const file=path.join('standalone-dist/client',req.url==='/'?'index.html':req.url);if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await webkit.launch({headless:true});fs.mkdirSync('outputs/rtf-mobile',{recursive:true});
try{
 const context=await browser.newContext({...devices['iPhone 13'],serviceWorkers:'block'});
 await context.route('**/sw.js',route=>route.fulfill({contentType:'application/javascript',body:'// No service worker in the isolated UI test; offline behavior has a separate test.'}));
 await context.route('**/api/workout',async route=>{
  if(route.request().method()==='POST'){
   const a=route.request().postDataJSON();assert.equal(a.action,'log');assert.equal(a.rir,null);state.sets.push({...a,createdAt:Date.now(),suggestedWeight:175,suggestedReps:5});
  }
  await route.fulfill({json:state});
 });
 await context.route('**/api/coach',route=>route.fulfill({json:{configured:false,proposals:[]}}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Log Set',exact:false}).waitFor();
 assert.equal(await page.getByRole('radiogroup',{name:'Reps in reserve'}).count(),0);
 assert.equal(await page.getByRole('spinbutton',{name:'Weight',exact:true}).inputValue(), '175');
 for(let i=0;i<3;i++){await page.getByRole('button',{name:'Log Set',exact:false}).click();try{await page.waitForFunction(n=>document.querySelector('.heading-meta')?.textContent?.includes(n+(n===1?' set logged':' sets logged')),i+1,{timeout:10000});}catch(e){console.log(await page.locator('body').innerText());console.log({sets:state.sets.length,errors});throw e;}}
 await page.getByText('Final set · rep out',{exact:true}).waitFor();
 assert.equal(await page.getByRole('spinbutton',{name:'Reps',exact:true}).inputValue(),'10');
 await page.screenshot({path:'outputs/rtf-mobile/rep-out-iphone.png',fullPage:true});
 for(const width of [390,375]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 // Check the actual deload UI with a frozen week-seven prescription.
 state.sets=[];state.sessions[0].rules.program={...program,week:7,lifts:program.lifts.map(l=>({...l,reps:5,maxReps:5,repOutTarget:null,weight:{both:150},sets:l.sets}))};
 await page.reload();await page.getByText('Deload set',{exact:true}).waitFor();
 assert.equal(await page.getByRole('radiogroup',{name:'Reps in reserve'}).count(),0);
 await page.screenshot({path:'outputs/rtf-mobile/deload-iphone.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('iPhone WebKit: fixed working load, final-set transition, RIR-free save payload, deload display, 375/390px layout passed. No live data modified.');
}finally{await browser.close();server.close();}
