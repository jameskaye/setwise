import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root='standalone-dist/client';
const manifest={};
for(const file of fs.readdirSync(root,{recursive:true}).filter(p=>fs.statSync(path.join(root,p)).isFile())){
 const bytes=fs.readFileSync(path.join(root,file));
 manifest['/'+file.replaceAll('\\','/')]={hash:createHash('sha256').update(bytes.toString('base64')+path.extname(file).slice(1)).digest('hex').slice(0,32),size:bytes.length};
}
if(process.argv[2]==='manifest'){console.log(JSON.stringify(manifest));}
else{
 const session=JSON.parse(fs.readFileSync('.setwise-secrets/asset-session.json','utf8'));
 let jwt=session.jwt;
 for(const bucket of session.buckets){
  const form=new FormData();
  for(const hash of bucket){
   const [file]=Object.entries(manifest).find(([,v])=>v.hash===hash);
   const type=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream';
   form.append(hash,new Blob([fs.readFileSync(root+file).toString('base64')],{type}),hash);
  }
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/09c8c2fe171d03bfbdea44e8ad445c07/workers/assets/upload?base64=true',{method:'POST',headers:{Authorization:'Bearer '+session.jwt},body:form});
  const data=await r.json();if(!r.ok||!data.success)throw new Error(JSON.stringify(data.errors));
  if(data.result?.jwt)jwt=data.result.jwt;
 }
 fs.writeFileSync('.setwise-secrets/asset-completion.json',JSON.stringify({jwt}));
 console.log('Assets uploaded. Completion credential saved privately.');
}
