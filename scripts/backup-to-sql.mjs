import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const [input,owner,output]=process.argv.slice(2);
if(!input||!owner||!output)throw new Error('Usage: node scripts/backup-to-sql.mjs INPUT.json OWNER_ID OUTPUT.sql');
const temp=mkdtempSync(join(tmpdir(),'setwise-import-'));
try{await build({entryPoints:['lib/backup.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'backup.mjs')});const {backupToSQL}=await import(pathToFileURL(join(temp,'backup.mjs')));const sql=backupToSQL(JSON.parse(readFileSync(input,'utf8')),owner);writeFileSync(output,sql,{mode:0o600,flag:'wx'});console.log('Validated import written. Apply only to an empty, migrated D1 database.');}finally{rmSync(temp,{recursive:true,force:true});}
