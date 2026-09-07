// Run only on your machine after creating a D1 database. Never commit generated files.
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
const databaseId=process.argv[2];
if(!databaseId||!/^[a-f0-9-]{36}$/i.test(databaseId))throw new Error('Usage: node scripts/configure-cloudflare.mjs <D1 database UUID>');
if(existsSync('standalone/wrangler.json')||existsSync('.setwise-secrets/credentials.json'))throw new Error('Configuration already exists; refusing to replace keys or point at another database.');
const config=JSON.parse(readFileSync('standalone/wrangler.example.json','utf8'));config.d1_databases[0].database_id=databaseId;
writeFileSync('standalone/wrangler.json',JSON.stringify(config,null,2)+'\n',{mode:0o600});
const coachKey=randomBytes(32).toString('base64url'),loginKey=randomBytes(32).toString('base64url'),sessionSecret=randomBytes(32).toString('base64url');
const hash=v=>createHash('sha256').update(v).digest('hex');
mkdirSync('.setwise-secrets',{mode:0o700});
writeFileSync('.setwise-secrets/credentials.json',JSON.stringify({coachKey,loginKey},null,2)+'\n',{mode:0o600});
writeFileSync('.setwise-secrets/worker-secrets.json',JSON.stringify({COACH_KEY_HASH:hash(coachKey),LOGIN_KEY_HASH:hash(loginKey),SESSION_SECRET:sessionSecret},null,2)+'\n',{mode:0o600});
console.log('Created private configuration and credentials in .setwise-secrets. Import worker-secrets.json with wrangler secret bulk. Put coachKey into the private GPT authentication field; loginKey signs in to the web app.');
