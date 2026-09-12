import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {build} from 'esbuild';import {webkit,devices} from 'playwright';
await build({entryPoints:['lib/rtf.ts'],bundle:true,format:'esm',platform:'node',outfile:'outputs/superset-rtf.mjs'});
const {buildProgramSession}=await import('../outputs/superset-rtf.mjs');
const original=JSON.parse(fs.readFileSync('.setwise-secrets/superset-before.json'));
const routine=JSON.parse(fs.readFileSync('.setwise-secrets/superset-request.json')).routine,template=routine.workouts.find(w=>w.id==='lower-b');
const state={...structuredClone(original),sessions:[],sets:[],progressions:[],messages:[],account:{id:'mobile-test',name:'Test',canInvite:false},routine:{...original.routine,routine}};
state.sessions=[{id:'superset-ui',name:template.name,status:'active',startedAt:Date.now(),notes:'Isolated UI test',plan:template.exercises.map(p=>p.variantId),prescriptions:template.exercises,rules:{program:buildProgramSession(routine,'lower-b',state),supersets:template.supersets}}];
const server=http.createServer((req,res)=>{const file=path.join('standalone-dist/client',req.url==='/'?'index.html':req.url);if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await webkit.launch({headless:true});fs.mkdirSync('outputs/supersets-mobile',{recursive:true});let failOnce=false;
try{
 const context=await browser.newContext({...devices['iPhone 13'],serviceWorkers:'block'});
 await context.route('**/sw.js',r=>r.fulfill({contentType:'application/javascript',body:'// Service workers tested separately.'}));
 await context.route('**/api/workout',async route=>{
  if(route.request().method()==='POST'){
   const a=route.request().postDataJSON();
   if(a.action==='log'){if(failOnce){failOnce=false;return route.abort('failed');}state.sets.push({...a,createdAt:Date.now()});}
   else if(a.action==='undo')state.sets=state.sets.filter(s=>s.id!==a.setId);
   else if(a.action==='abort'){state.sessions=[];state.sets=[];state.progressions=[];}
   else if(a.action==='supersets')state.sessions[0].rules.supersets=a.supersets;
   else throw Error('Unexpected action '+a.action);
  }
  await route.fulfill({json:state});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const check=async(name,weight)=>{await page.locator('.exercise-title').filter({hasText:name}).waitFor();assert.equal(await page.getByRole('spinbutton',{name:'Weight',exact:true}).inputValue(),String(weight));assert.equal(await page.getByRole('radio',{name:'Left',exact:true}).count(),0);await page.getByText('Do both sides before logging.',{exact:false}).waitFor();};
 const log=()=>page.getByRole('button',{name:'Log Set',exact:false}).click();
 await check('RDL',75);const weight=page.getByRole('spinbutton',{name:'Weight',exact:true}),reps=page.getByRole('spinbutton',{name:'Reps',exact:true});
 await weight.fill('0');await weight.press('Backspace');assert.equal(await weight.inputValue(),'');assert.equal(await page.getByRole('button',{name:'Log Set',exact:false}).isDisabled(),true);
 await weight.pressSequentially('80');assert.equal(await weight.inputValue(),'80');await reps.fill('');assert.equal(await reps.inputValue(),'');assert.equal(await page.getByRole('button',{name:'Log Set',exact:false}).isDisabled(),true);await reps.fill('8');
 await log();await check('calf raise',40);assert.equal(state.sets.length,1);assert.equal(state.sets[0].side,'both');
 await log();await check('RDL',80);await page.reload();await check('RDL',80);
 await log();await check('calf raise',40);await page.getByRole('button',{name:'Undo last saved set',exact:true}).click();await check('RDL',80);
 await log();await check('calf raise',40);failOnce=true;await log();await page.getByText('Set waiting for confirmation',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Retry save',exact:true}).click();await check('RDL',80);assert.equal(state.sets.length,4);
 await page.screenshot({path:'outputs/supersets-mobile/combined-iphone.png',fullPage:false});
 for(const width of [390,375]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.getByRole('button',{name:'Finish',exact:true}).click();await page.getByRole('button',{name:'Abort workout without saving',exact:true}).click();
 await page.getByRole('button',{name:'Keep training',exact:true}).click();assert.equal(state.sets.length,4,'cancel leaves all sets intact');
 await page.getByRole('button',{name:'Finish',exact:true}).click();await page.getByRole('button',{name:'Abort workout without saving',exact:true}).click();
 await page.getByRole('button',{name:'Discard workout',exact:true}).click();await page.getByRole('button',{name:'Start workout',exact:true}).waitFor();
 assert.equal(state.sets.length,0);assert.equal(state.sessions.length,0);assert.deepEqual(errors,[]);
 const small=structuredClone(state.routine.routine);const programmed=buildProgramSession(small,'lower-b',state);const ids=template.exercises.slice(0,2).map(e=>e.variantId);for(const lift of programmed.lifts)lift.sets=1;
 state.sessions=[{id:'unpaired-ui',name:'Unpaired test',status:'active',startedAt:Date.now(),notes:'',plan:ids,rules:{program:programmed},prescriptions:[]}];state.sets=[];
 await page.reload();await check('RDL',75);await log();await check('calf raise',40);await log();await page.getByRole('button',{name:'Finish & save',exact:false}).waitFor();
 assert.equal(state.sets.length,2);assert.equal(state.sessions[0].status,'active','automatic finish prompt does not silently save or advance');
 console.log('iPhone WebKit passed: one entry for both sides, exercise-by-exercise supersets, reopen, undo, failed-save retry, abort cancellation/discard, 375/390px layout, clearable inputs, carried weights, unpaired auto-advance and automatic finish prompt. No live workouts changed.');
}finally{await browser.close();server.close();}
