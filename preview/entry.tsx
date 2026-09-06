import React from 'react';
import {createRoot} from 'react-dom/client';
import WorkoutApp from '../app/workout-app';
import {starterExercises,type Snapshot,type LoggedSet,type Variant} from '../lib/model';
import {recommend,interpretCoach} from '../lib/coach';
const now=Date.now();
let data:Snapshot={exercises:starterExercises.map(v=>({id:'ex-'+v.key,name:v.base})),variants:starterExercises.map(v=>({...v,id:v.key,exerciseId:'ex-'+v.key})),sessions:[{id:'known',name:'Known history',startedAt:0,endedAt:null,status:'seed',notes:'User-supplied history. Date, side, and RIR were not supplied.',plan:['extension'],rules:{}},{id:'today',name:'Leg day',startedAt:now,endedAt:null,status:'active',notes:'',plan:starterExercises.slice(0,5).map(v=>v.key),rules:{}}],sets:[{id:'known-set',variantId:'extension',sessionId:'known',createdAt:0,weight:95,reps:10,rir:null,side:'unknown',type:'working',painLocation:'',painSeverity:0,note:'User-supplied performance; side and date unknown.',suggestedWeight:null,suggestedReps:null}],messages:[],progressions:[]};
window.fetch=async(_input,init)=>{
 try{
 if(init?.method==='POST'){
  const a=JSON.parse(String(init.body)),s=data.sessions.find(s=>s.id===a.sessionId),v=data.variants.find(v=>v.id===a.variantId);
  if(a.action==='log'&&s&&v&&!data.sets.some(s=>s.id===a.id)){
   const before=recommend(v,s,data.sets,a.side,a.type);
   if(before.status==='pause'||before.status==='complete')throw Error(before.reason);
   const set:LoggedSet={...a,createdAt:Date.now(),suggestedWeight:before.weight,suggestedReps:before.reps};data.sets.push(set);
   data.progressions.push({id:a.id+'-next',setId:a.id,sessionId:s.id,variantId:v.id,createdAt:set.createdAt,recommendation:recommend(v,s,data.sets,a.side)});
  }else if(a.action==='undo'){data.progressions=data.progressions.filter(p=>p.setId!==a.setId);data.sets=data.sets.filter(s=>s.id!==a.setId);}
  else if(a.action==='coach'&&s){const r=interpretCoach(a.message,s.rules,data.variants,a.variantId);s.rules=r.rules;data.messages.push({id:a.id,sessionId:s.id,createdAt:Date.now(),message:a.message,response:r.response});}
  else if(a.action==='finish'&&s){s.status='finished';s.endedAt=Date.now();}
  else if(a.action==='start'){data.sessions.push({id:a.id,name:a.name,startedAt:Date.now(),endedAt:null,status:'active',notes:'',plan:a.plan,rules:{}});}
  else if(a.action==='session'&&s){s.name=a.name;s.notes=a.notes;s.plan=a.plan;}
  else if(a.action==='variant'){if(a.minReps>a.maxReps)throw Error('Minimum reps cannot exceed maximum reps.');const exerciseId=a.exerciseId||a.id+'-base';if(!a.exerciseId)data.exercises.push({id:exerciseId,name:a.baseName});data.variants.push({...a,exerciseId,unilateral:Number(a.unilateral)});}
  else if(a.action==='targets'&&v){if(a.minReps>a.maxReps)throw Error('Minimum reps cannot exceed maximum reps.');Object.assign(v,{increment:a.increment,minReps:a.minReps,maxReps:a.maxReps,defaultSets:a.defaultSets});}
 }
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 }catch(e){return new Response(JSON.stringify({error:(e as Error).message}),{status:400});}
};
// This file is an isolated, non-authoritative review surface. Real Site writes go to D1.
createRoot(document.getElementById('root')!).render(<><div className="review-banner">INTERACTIVE PREVIEW <span>Sample data · test sets reset on reload · Site unpublished</span></div><WorkoutApp initialData={structuredClone(data)}/></>);
