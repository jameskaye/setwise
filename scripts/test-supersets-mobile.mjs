import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {build} from 'esbuild';import {webkit,devices} from 'playwright';
await build({entryPoints:['lib/rtf.ts'],bundle:true,format:'esm',platform:'node',outfile:'outputs/superset-rtf.mjs'});
const {buildProgramSession}=await import('../outputs/superset-rtf.mjs');
const original=JSON.parse(fs.readFileSync('.setwise-secrets/superset-before.json'));
const routine=JSON.parse(fs.readFileSync('.setwise-secrets/superset-request.json')).routine,template=routine.workouts.find(w=>w.id==='lower-b');
const state={...structuredClone(original),sessions:[],sets:[],progressions:[],messages:[],routine:{...original.routine,routine}};
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
   else if(a.action==='supersets')state.sessions[0].rules.supersets=a.supersets;
   else throw Error('Unexpected action '+a.action);
  }
  await route.fulfill({json:state});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const check=async(name,weight,side)=>{await page.locator('.exercise-title').filter({hasText:name}).waitFor();await page.waitForFunction(side=>document.querySelector('[role="radio"][aria-label="'+side+'"]')?.getAttribute('aria-checked')==='true',side,{timeout:10000});assert.equal(await page.getByRole('spinbutton',{name:'Weight',exact:true}).inputValue(),String(weight));assert.equal(await page.getByRole('radio',{name:side,exact:true}).isChecked(),true);};
 const log=()=>page.getByRole('button',{name:'Log Set',exact:false}).click();
 await check('RDL',75,'Left');await log();await check('calf raise',40,'Left');
 await log();await check('RDL',75,'Right');await page.reload();await check('RDL',75,'Right');
 await log();await check('calf raise',40,'Right');
 await page.getByRole('button',{name:'Undo last saved set',exact:true}).click();await check('RDL',75,'Right');
 await log();await check('calf raise',40,'Right');failOnce=true;await log();
 await page.getByText('Set waiting for confirmation',{exact:true}).waitFor();await check('calf raise',40,'Right');
 await page.getByRole('button',{name:'Retry save',exact:true}).click();await check('RDL',75,'Left');assert.equal(state.sets.length,4);
 await page.getByRole('button',{name:'Single-leg slant-board dumbbell calf raise',exact:true}).click();await check('calf raise',40,'Left');
 await page.getByText('Superset options · auto-switch on',{exact:true}).click();await page.getByRole('switch',{name:'Switch after saving a set'}).uncheck();await log();await check('calf raise',40,'Right');
 await page.getByText('Superset options · auto-switch off',{exact:true}).click();
 await page.screenshot({path:'outputs/supersets-mobile/pair-iphone.png',fullPage:true});
 for(const width of [390,375]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.getByRole('button',{name:'Edit pairing',exact:true}).click();await page.getByRole('combobox',{name:'Superset partner'}).click();await page.getByRole('option',{name:'No superset',exact:true}).click();await page.getByRole('button',{name:'Save pairing',exact:false}).click();await page.getByRole('button',{name:'Pair with another exercise',exact:false}).waitFor();
 assert.equal(state.sessions[0].rules.supersets.length,3);assert.deepEqual(errors,[]);
 console.log('iPhone WebKit superset checks passed: automatic/manual switch, side/load restoration, reopen, undo, failed-save retry, switch toggle, pairing editor and 375/390px layout. No live sets changed.');
}finally{await browser.close();server.close();}
