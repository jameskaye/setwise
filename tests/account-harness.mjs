import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export async function accountHarness(){
 const temp=mkdtempSync(join(tmpdir(),'setwise-accounts-')),sql=new DatabaseSync(join(temp,'test.sqlite'));
 sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 const adapter={prepare(text){return{bind(...values){const execute=()=>{const stmt=sql.prepare(text);if(/^\s*SELECT/i.test(text))return{results:stmt.all(...values)};const info=stmt.run(...values);return{results:[],meta:{changes:Number(info.changes)}};};return{first:async()=>execute().results[0]??null,all:async()=>execute(),run:async()=>execute(),execute};}};},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.execute());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const loginKey='owner-test-'.padEnd(48,'o'),secret='session-test-secret-'.padEnd(48,'s');
 globalThis.__accountEnv={DB:adapter,AUTH_MODE:'standalone',OWNER_ID:'original-owner',LOGIN_KEY_HASH:createHash('sha256').update(loginKey).digest('hex'),SESSION_SECRET:secret,ASSETS:{fetch:async r=>{const root=resolve('standalone-dist/client'),path=new URL(r.url).pathname,file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root)||!existsSync(file))return new Response('Not found',{status:404});return new Response(readFileSync(file),{headers:{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(file)]??'application/octet-stream'}});}}};
 await build({entryPoints:['standalone/worker.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'worker.mjs'),plugins:[{name:'test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__accountEnv',loader:'js'}));}}]});
 const worker=(await import(pathToFileURL(join(temp,'worker.mjs')))).default;
 const call=(path,cookie='',body,extra={})=>worker.fetch(new Request('https://setwise.test'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:'https://setwise.test',...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})}));
 const login=key=>worker.fetch(new Request('https://setwise.test/login',{method:'POST',headers:{Origin:'https://setwise.test'},body:new URLSearchParams({key})}));
 return {worker,sql,call,login,loginKey,secret,close(){sql.close();rmSync(temp,{recursive:true,force:true});}};
}
