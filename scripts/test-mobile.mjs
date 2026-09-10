import {webkit,chromium,devices} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='https://setwise-test.setwise-jlk298.workers.dev';
const {loginKey}=JSON.parse(await fs.readFile('.setwise-secrets/credentials.json','utf8'));
await fs.mkdir('outputs/mobile',{recursive:true});
const isChromium=process.argv.includes('--chromium');
const browser=isChromium?await chromium.launch({channel:'chrome',headless:true}):await webkit.launch({headless:true});
try{
 const context=await browser.newContext({...devices['iPhone 13'],baseURL:base});
 const login=await context.request.post('/login',{form:{key:loginKey},headers:{Origin:base},maxRedirects:0});assert.equal(login.status(),303);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('button',{name:'Log Set',exact:false}).waitFor();
 const original=await (await context.request.get('/api/workout')).json();
 await page.screenshot({path:'outputs/mobile/train-iphone.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll at iPhone width');
 assert.equal((await context.request.get('/mcp')).status(),404);
 const manifest=await context.request.get('/manifest.webmanifest');assert.equal(manifest.status(),200);assert.match(manifest.headers()['content-type'],/application\/manifest\+json/);
 assert.equal((await context.request.get('/apple-touch-icon.png')).status(),200);
 await page.getByRole('button',{name:'Install Setwise'}).click();
 await page.getByText('Tap Share, then Add to Home Screen.').waitFor();
 await page.screenshot({path:'outputs/mobile/install-iphone.png',fullPage:true});
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('tab',{name:'Coach',exact:true}).click();await page.getByRole('button',{name:'Ask coach'}).waitFor();
 await page.screenshot({path:'outputs/mobile/coach-iphone.png',fullPage:true});
 await page.getByRole('tab',{name:'History',exact:true}).click();await page.getByRole('heading',{name:'Training history'}).waitFor();
 await page.screenshot({path:'outputs/mobile/history-iphone.png',fullPage:true});
 await page.getByRole('tab',{name:'Train',exact:true}).click();
 await page.getByRole('spinbutton',{name:'Weight',exact:true}).fill('20');await page.getByRole('spinbutton',{name:'Reps',exact:true}).fill('10');
 // Simulate a dropped save request, then retry the exact same pending set.
 await context.setOffline(true);
 await page.getByRole('button',{name:'Log Set',exact:false}).click();
 await page.getByText('Set waiting for confirmation').waitFor();
 await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry save');return b&&!b.disabled;});await context.setOffline(false);
 await page.getByRole('button',{name:'Retry save',exact:true}).click();
 await page.getByText('Set waiting for confirmation').waitFor({state:'hidden'});
 await page.reload();await page.getByRole('button',{name:'Undo last set'}).waitFor();
 const saved=await (await context.request.get('/api/workout')).json();
 assert.equal(saved.sets.length,original.sets.length+1);
 const extra=saved.sets.find(s=>!original.sets.some(o=>o.id===s.id));assert.equal(extra.weight,20);assert.equal(extra.reps,10);
 await page.getByRole('button',{name:'Undo last set'}).click();
 await page.getByRole('button',{name:'Undo last set'}).waitFor({state:'hidden'});
 const restored=await (await context.request.get('/api/workout')).json();assert.equal(restored.sets.length,original.sets.length);
 await page.setViewportSize({width:375,height:667});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll on a small iPhone');
 await page.screenshot({path:'outputs/mobile/train-small-iphone.png',fullPage:true});
 // Playwright's service-worker controls support Chromium; verify cold offline navigation there.
 if(isChromium){await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'Back in a moment.'}).waitFor();await context.setOffline(false);await page.goto('/');await page.getByRole('button',{name:'Log Set',exact:false}).waitFor();}

 assert.deepEqual(errors,[]);
 console.log((isChromium?'Chromium':'WebKit')+' mobile checks passed: authentication, layout, history, coach screen, install assets, failed-save retry, reopen, and undo. Test set removed.'+(isChromium?' Cold offline navigation also passed.':''));
 await context.close();
}finally{await browser.close();}
