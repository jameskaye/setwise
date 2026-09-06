import {env} from 'cloudflare:workers';
import {starterExercises, type Snapshot} from '@/lib/model';
export function database(){if(!env.DB)throw new Error('Workout storage is unavailable');return env.DB;}
export function query(sql:string,...values:unknown[]){return database().prepare(sql).bind(...values);}
const camel=(r:Record<string,unknown>)=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='owner').map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v]));
export async function initialize(owner:string){
  if(await query('SELECT owner FROM profiles WHERE owner = ?',owner).first())return;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner)))).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,24);
  const p=`seed-${hash}-`,now=Date.now();
  const q=starterExercises.flatMap(v=>[
    query('INSERT OR IGNORE INTO exercises (id,owner,name) VALUES (?,?,?)',p+'ex-'+v.key,owner,v.base),
    query('INSERT OR IGNORE INTO variants (id,owner,exercise_id,name,equipment,unilateral,load_mode,increment,min_reps,max_reps,default_sets) VALUES (?,?,?,?,?,?,?,?,?,?,?)',p+v.key,owner,p+'ex-'+v.key,v.name,v.equipment,v.unilateral,v.loadMode,v.increment,v.minReps,v.maxReps,v.defaultSets)
  ]);
  q.push(query('INSERT OR IGNORE INTO sessions (id,owner,name,started_at,ended_at,status,notes,plan,rules) VALUES (?,?,?,?,?,?,?,?,?)',p+'history',owner,'Known history',0,null,'seed','Imported from your supplied history. Date, side, and RIR were not supplied.',JSON.stringify([p+'extension']),'{}'));
  q.push(query('INSERT OR IGNORE INTO sets (id,owner,session_id,variant_id,created_at,weight,reps,rir,side,type,pain_location,pain_severity,note,suggested_weight,suggested_reps) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',p+'set',owner,p+'history',p+'extension',0,95,10,null,'unknown','working','',0,'User-supplied performance; side and date unknown.',null,null));
  q.push(query('INSERT OR IGNORE INTO sessions (id,owner,name,started_at,ended_at,status,notes,plan,rules) VALUES (?,?,?,?,?,?,?,?,?)',p+'first',owner,'Leg day',now,null,'active','',JSON.stringify(starterExercises.slice(0,5).map(v=>p+v.key)),'{}'));
  q.push(query('INSERT OR IGNORE INTO profiles (owner,created_at) VALUES (?,?)',owner,now));
  await database().batch(q);
}
export async function snapshot(owner:string):Promise<Snapshot>{
  const names=['exercises','variants','sessions','sets','coach_messages','progressions'];
  const rows=await database().batch(names.map(name=>query(`SELECT * FROM ${name} WHERE owner = ?`,owner)));
  const [exercises,variants,sessions,sets,messages,progressions]=rows.map(r=>r.results.map(x=>camel(x as Record<string,unknown>)));
  return {exercises,variants,sessions:sessions.map(s=>({...s,plan:JSON.parse(s.plan as string),rules:JSON.parse(s.rules as string)})),sets,messages,progressions:progressions.map(p=>({...p,recommendation:JSON.parse(p.recommendation as string)}))} as unknown as Snapshot;
}
