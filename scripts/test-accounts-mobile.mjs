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
 await page.goto('https://setwise.test/login');await page.getByLabel('Sign-in key',{exact:true}).fill(h.loginKey);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Account',exact:true}).waitFor({timeout:10000}).catch(async e=>{console.log({url:page.url(),body:await page.locator('body').innerText(),errors,cookies:(await context.cookies()).map(c=>c.name)});throw e;});await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByLabel('Partner’s name').fill('Test partner');await page.getByRole('button',{name:'Create partner access'}).click();
 await page.getByRole('textbox',{name:/Partner sign-in key/}).waitFor({timeout:10000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e;});const key=await page.getByRole('textbox',{name:/Partner sign-in key/}).inputValue();assert.match(key,/^[a-f0-9]{64}$/);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Sign-in key',{exact:true}).fill(key);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Set up my plan',exact:true}).click();await page.getByRole('button',{name:'Set up a four-day strength plan'}).click();
 await page.getByLabel('Plan name',{exact:true}).fill('My independent plan');
 await page.getByLabel(/Initial training max/).first().fill('100');
 assert.equal(await page.getByLabel(/Initial training max/).nth(1).inputValue(),'');
 await page.setViewportSize({width:375,height:812});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'editor fits iPhone width');
 await page.screenshot({path:'outputs/accounts-mobile/plan-iphone.png',fullPage:false});
 await page.getByRole('button',{name:'Save my plan',exact:true}).click();await page.getByRole('button',{name:'Edit my plan',exact:true}).waitFor();
 await page.getByRole('tab',{name:'Train',exact:true}).click();await page.getByRole('button',{name:'Start workout',exact:true}).click();
 const weight=page.getByRole('spinbutton',{name:'Weight',exact:true});await weight.waitFor();assert.equal(await weight.inputValue(),'70');
 await page.getByRole('button',{name:/Log Set/}).click();await page.getByText('70 lb × 5 saved',{exact:false}).first().waitFor();
 await page.reload();await weight.waitFor();
 assert.equal(h.sql.prepare('SELECT count(*) AS n FROM sets').get().n,1);
 assert.equal(h.sql.prepare('SELECT owner FROM sets').get().owner,h.sql.prepare('SELECT owner FROM private_accounts').get().owner);
 await page.screenshot({path:'outputs/accounts-mobile/logged-iphone.png',fullPage:true});
 await page.getByRole('tab',{name:'Plan',exact:true}).click();await page.getByText('Program files for ChatGPT',{exact:true}).click();
 const saved=JSON.parse(h.sql.prepare('SELECT routine FROM routine_revisions WHERE owner = ? ORDER BY revision DESC LIMIT 1').get(h.sql.prepare('SELECT owner FROM private_accounts').get().owner).routine);
 const imported=structuredClone(saved);imported.name='Reviewed program update';imported.notes='My updated plan';
 await page.getByRole('textbox',{name:/Or paste the updated program/}).fill(JSON.stringify(imported));await page.getByRole('button',{name:'Review imported program'}).click();
 assert.equal(await page.getByLabel('Plan name',{exact:true}).inputValue(),'Reviewed program update');
 await page.getByRole('button',{name:'Save my plan',exact:true}).click();await page.getByRole('button',{name:'Edit my plan',exact:true}).waitFor();
 assert.equal(h.sql.prepare('SELECT count(*) AS n FROM sets').get().n,1);
 assert.equal(JSON.parse(h.sql.prepare('SELECT rules FROM sessions WHERE status = ?').get('active').rules).program.week,1);
 await page.getByRole('tab',{name:'Train',exact:true}).click();
 // A draft from another account must never appear after switching sign-in.
 await page.evaluate(()=>localStorage.setItem('setwise-pending-set:original-owner',JSON.stringify({weight:999,reps:1,sessionId:'owner-private'})));
 await page.reload();await weight.waitFor();assert.equal(await page.getByText('Set waiting for confirmation',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByText('Test partner',{exact:true}).waitFor();assert.equal(await page.getByText('Partner access',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Sign-in key',{exact:true}).fill(h.loginKey);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Set up my plan',exact:true}).waitFor();assert.equal(h.sql.prepare("SELECT count(*) AS n FROM sets WHERE owner='original-owner'").get().n,0);
 assert.equal(errors.length,0,errors.join('\n'));console.log('iPhone WebKit: partner creation, sign-in, personal plan, log/reopen, account isolation, reviewed program import and 375px layout passed.');
 await context.close();
}finally{await browser.close();h.close();}

