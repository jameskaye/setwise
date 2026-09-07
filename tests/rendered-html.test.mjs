import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

test('standalone entry contains the app title and references existing bundled assets',()=>{
 const root=resolve('standalone-dist/client');
 const html=readFileSync(resolve(root,'index.html'),'utf8');
 assert.match(html,/<title>Setwise<\/title>/);
 assert.match(html,/data-host="standalone"/);
 const scripts=[...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)];
 assert.ok(scripts.some(m=>m[1].endsWith('.js')),'a runnable entry script is required');
 assert.ok(scripts.some(m=>m[1].endsWith('.css')),'styles must be bundled');
 for(const [,asset] of scripts)assert.ok(existsSync(root+asset),asset+' exists');
});
