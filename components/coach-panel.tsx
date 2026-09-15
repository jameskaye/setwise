'use client';
import {useEffect,useRef,useState} from 'react';
import {LoaderCircle,Check,ArrowUpRight} from 'lucide-react';
import type {Snapshot} from '@/lib/model';
import type {Prescription} from '@/lib/routine';
import type {CoachProposal} from '@/lib/coach-operations';

export function CoachPanel({data,onSaved}:{data:Snapshot;onSaved:(s:Snapshot)=>void}){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[configured,setConfigured]=useState<boolean|null>(null),[proposals,setProposals]=useState<CoachProposal[]>([]);
 const lock=useRef(false),pending=useRef<{message:string;id:string}|null>(null);
 useEffect(()=>{let active=true;fetch('/api/coach',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);if(active){setConfigured(d.configured);setProposals(d.proposals);}}).catch(()=>{if(active)setError('Could not load coach. You can keep logging workouts.');});return()=>{active=false;};},[]);
 async function send(action:'propose'|'apply',id?:string){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  if(action==='propose'&&pending.current?.message!==message)pending.current={message,id:crypto.randomUUID()};
  try{
   const r=await fetch('/api/coach',{method:'POST',headers:{'Content-Type':'application/json',...(data.account?{'X-Setwise-Account':data.account.id}:{})},body:JSON.stringify({action,requestId:id??pending.current!.id,...(action==='propose'?{message}:{})})});
   const d=await r.json();if(!r.ok){if(action==='propose'&&r.status!==409)pending.current=null;throw new Error(d.error);}
   setProposals(old=>[d.proposal,...old.filter(p=>p.id!==d.proposal.id)]);
   if(action==='propose'){pending.current=null;setMessage('');}
   if(d.snapshot)onSaved(d.snapshot);
  }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 function targetText(p:CoachProposal,e:Prescription){
   const active=data.sessions.find(s=>s.id===p.sessionId),lift=p.operation?.type==='adjust_workout'?active?.rules.program?.lifts.find(l=>l.variantId===e.variantId):undefined,baseline=active?.prescriptions?.find(x=>x.variantId===e.variantId);
   if(lift){const repsChanged=baseline?(e.minReps!==baseline.minReps||e.maxReps!==baseline.maxReps):e.minReps!==lift.reps||e.maxReps!==lift.maxReps;const sets=baseline&&e.sets===baseline.sets?lift.sets:e.sets;const min=repsChanged?e.minReps:lift.reps,max=repsChanged?e.maxReps:lift.maxReps;return sets+' sets × '+min+(max!==min?'–'+max:'')+' reps'+(!repsChanged&&lift.repOutTarget!==null?' · final set '+lift.repOutTarget+'+ reps':'');}
   if(data.routine?.routine.program)return e.sets+' sets × '+e.minReps+'–'+e.maxReps+' reps'+(p.operation?.type==='adjust_workout'?' · controlled starting load':' · programmed lifts retain weekly RTF targets');
   return e.sets+' sets × '+e.minReps+'–'+e.maxReps+' reps · '+e.targetRir+' RIR';
 }
 return <section className="coach-panel">
  <p className="muted">Ask for a routine or an adjustment. Review the exact changes before applying. Your logged sets stay intact.</p>
  {configured===false&&<p className="coach-notice">Coach is waiting for your OpenRouter key. Training, history, and progression are ready to use.</p>}
  <form className="coach-form" onSubmit={e=>{e.preventDefault();void send('propose');}}>
   <label className="form-field">What would you like to change?<textarea rows={3} maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Skip lat pulldown today, or reduce today’s sets."/></label>
   <div className="quick-prompts">{['Skip an exercise today','Two sets per exercise today'].map(t=><button key={t} type="button" onClick={()=>setMessage(t)}>{t}</button>)}</div>
   <button className="log-button" disabled={busy||configured!==true||!message.trim()}>{busy?<LoaderCircle className="spin"/>:<ArrowUpRight/>}{busy?'Working…':'Ask coach'}</button>
  </form>
  <p className="small-copy muted">Only coach requests use AI. Your request and relevant workout context are sent through OpenRouter.</p>
  {error&&<p role="alert" className="sheet-error">{error}</p>}
  <div aria-live="polite">{proposals.map(p=>{
   const op=p.operation,workouts=op?.type==='adjust_workout'?[op.workout]:op?.type==='replace_routine'?op.routine.workouts:[];
   return <article className="coach-proposal" key={p.id}><p className="eyebrow">{p.status==='applied'?'SAVED CHANGE':op?'PROPOSED CHANGE':'COACH REPLY'}</p><h3>{p.message}</h3><p className="coach-reply">{p.reply}</p>
    {!op&&<p className="scope-label">Advice only — no changes were proposed or saved.</p>}{op?.type==='adjust_workout'&&<>{data.sessions.find(s=>s.id===p.sessionId)?.plan.filter(id=>!op.workout.exercises.some(e=>e.variantId===id)).map(id=><p key={id} className="scope-label">Skip today: {data.variants.find(v=>v.id===id)?.name}</p>)}{data.sessions.find(s=>s.id===p.sessionId)?.rules.program&&<p className="muted small-copy">Unchanged lifts keep their RTF targets. Modified lifts hold progression for this workout; added exercises use a starting load you enter.</p>}</>}{op&&<p className="scope-label">{op.type==='adjust_workout'?'Today’s active workout only':'Future workouts · replaces your saved routine'}</p>}
    {op?.type==='replace_routine'&&<><h3>{op.routine.name}</h3><p className="muted">{op.routine.notes}</p>{op.routine.constraints.map((c,i)=><p key={i}>{c}</p>)}</>}
    {workouts.map((w,i)=><div key={i} className="proposal-workout"><h4>{w.name}</h4>{'notes' in w&&<p>{String(w.notes)}</p>}{'timeLimitMinutes' in w&&w.timeLimitMinutes!=null&&<p>{String(w.timeLimitMinutes)} minute limit</p>}<ul>{w.exercises.map(e=><li key={e.variantId}><strong>{data.variants.find(v=>v.id===e.variantId)?.name??'Unknown exercise'}</strong><span>{targetText(p,e)}</span></li>)}</ul></div>)}
    {op&&p.status==='proposed'&&<button className="wide-button" disabled={busy} onClick={()=>void send('apply',p.id)}>Apply these changes <Check size={18}/></button>}
    {p.status==='applied'&&<p className="scope-label">Saved to your workout database.</p>}
   </article>;
  })}</div>
 </section>;
}
