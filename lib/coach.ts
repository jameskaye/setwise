import type {Variant, Session, LoggedSet, Side, SetType, Recommendation, Rules} from './model';
import {sessionVariant} from './routine';
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const sameSide=(s:LoggedSet,side:Side)=>s.side===side || s.side==='unknown';
export function recommend(v:Variant, session:Session, all:LoggedSet[], side:Side, type:SetType='working', now=Date.now()):Recommendation {
  v=sessionVariant(v,session);
  const rules=session.rules;
  const min=rules.minReps??v.minReps,max=rules.maxReps??v.maxReps,targetRir=rules.targetRir??session.prescriptions?.find(p=>p.variantId===v.id)?.targetRir??2;
  const base={min,max,targetRir,reps:min,weight:null as number|null,status:'ready' as Recommendation['status'],label:'Next set'};
  const relevant=all.filter(s=>s.variantId===v.id && sameSide(s,side)).sort((a,b)=>a.createdAt-b.createdAt || a.id.localeCompare(b.id));
  const current=relevant.filter(s=>s.sessionId===session.id);
  const work=current.filter(s=>s.type!=='warmup');
  const historic=relevant.filter(s=>s.sessionId!==session.id && s.type==='working');
  const lastWork=work.at(-1),last=lastWork??historic.at(-1);
  if(rules.skipped?.includes(v.id)) return {...base,status:'pause',label:'Exercise skipped',reason:'Your workout constraint pauses this exercise. Choose another exercise or update the constraint.'};
  if(current.some(s=>s.painSeverity>0)) return {...base,status:'pause',label:'Pause this exercise',reason:'Pain was logged on this side. Switch exercises; do not push through pain.'};
  if(rules.deadline && now>=rules.deadline) return {...base,status:'complete',label:'Time is up',reason:'You reached your workout time limit. Finish the session or update the limit.'};
  if(type!=='warmup' && (type==='working'||rules.maxSets!==undefined) && work.length>=(rules.maxSets??v.defaultSets)) return {...base,weight:last?.weight??null,reps:clamp(last?.reps??min,min,max),status:'complete',label:'Target complete',reason:`${work.length} sets logged${v.unilateral?' on this side':''}. ${rules.maxSets!==undefined?'Your coach set limit is reached.':'Move on, or deliberately add a backoff or drop set.'}`};
  if(!last) return {...base,status:'calibrate',label:'Find your starting weight',reason:`No working-set history for this variant. Pick a familiar light load for ${min}–${max} reps with ${targetRir}+ reps left.`};
  const step=v.increment;
  const down=(w:number,fraction=.05)=>Math.max(0,Math.floor((w-Math.max(step,w*fraction))/step)*step);
  let weight=last.weight,reps=clamp(last.reps,min,max),reason='Repeat the load and build clean reps within your range.';
  const rir=last.rir;
  const capacity=(s:LoggedSet)=>s.weight*(1+(s.reps+(s.rir??2))/30);
  const first=work.find(s=>s.type==='working');
  const fatigued=!!(lastWork && first && work.length>1 && capacity(lastWork)<capacity(first)*.9);
  if(type==='warmup') return {...base,weight:Math.floor(weight*.55/step)*step,reps:min,label:'Warmup',reason:'A light rehearsal based on your working load. Warmups do not drive progression.'};
  if(type==='drop'||type==='backoff') return {...base,weight:down(weight,type==='drop'?.2:.1),reps:max,label:type==='drop'?'Drop set':'Backoff set',reason:`Reduce about ${type==='drop'?'20':'10'}% from your last working load; stay within a controlled rep range.`};
  if(lastWork && lastWork.type!=='working') {weight=lastWork.weight; reason='Keep the reduced load after your backoff or drop set; fatigue is already elevated.';}
  else if(last.reps<min || rir===0 || fatigued) {
    weight=down(weight,fatigued?.1:.05);reps=min;
    reason=fatigued?'Performance has dropped across this workout. Reduce the load and preserve reps.':rir===0?'You reached failure. Reduce the load for the next set.':'Reps fell below your range. Reduce the load to get back inside it.';
  } else if(last.reps>=max && rir!==null && rir>=targetRir && work.length<3 && !rules.easy) {
    weight+=step;reps=min;reason=`You reached the top of your range with ${rir===3?'3+':rir} reps left. Add one ${step} lb increment and reset to ${min} reps.`;
  } else if(rir!==null && rir<targetRir) {
    reps=clamp(last.reps-1,min,max);reason=`Keep the load, aim for ${reps} reps, and leave ${targetRir} in reserve.`;
    if(last.reps===min){weight=down(weight);reason=`Reduce one increment to leave ${targetRir} reps in reserve.`;}
  } else if(rir!==null && rir>targetRir){reps=clamp(last.reps+1,min,max);reason='You have room to add a rep before increasing the load.';}
  else if(rir===null){reason='Start from your recorded performance. Log RIR today so the next recommendation can adapt.';}
  if(rules.easy){weight=(!lastWork || lastWork.createdAt<=(rules.easySince??0))?Math.min(weight,down(last.weight,.1)):Math.min(weight,lastWork.weight);reps=min;reason=`Easy mode: keep a conservative load and leave ${Math.max(3,targetRir)} reps in reserve.`;}
  return {...base,weight,reps,targetRir:rules.easy?Math.max(3,targetRir):targetRir,reason};
}
export function interpretCoach(message:string, old:Rules, variants:Variant[], selectedId:string, now=Date.now()):{rules:Rules;response:string} {
  const t=message.toLowerCase().replace(/[’]/g,"'"); const rules={...old,skipped:[...(old.skipped??[])]}; const changes:string[]=[];
  if(/\b(reset|clear) (coach|constraints|rules)\b/.test(t)) return {rules:{},response:'Coaching constraints cleared. Exercise defaults apply again; your notes and sets are preserved.'};
  if(/\b(tired|fatigued|exhausted|lighter|take it easy|easy mode|deload)\b/.test(t) && !/\b(not tired|not fatigued|don't go lighter|do not go lighter)\b/.test(t)){if(!rules.easy)rules.easySince=now;rules.easy=true;rules.targetRir=3;changes.push('Use conservative loads and keep 3+ reps in reserve for the rest of this workout.');}
  if(/\b(no failure|avoid failure|don't (?:go to|train to) failure)\b/.test(t)){rules.targetRir=Math.max(rules.targetRir??2,2);changes.push('Keep at least 2 reps in reserve.');}
  const rir=t.match(/(?:leave|keep|target)\s+([0-3])\s*(?:rir|reps? (?:in reserve|left))/);if(rir){rules.targetRir=Number(rir[1]);changes.push(`Target ${rir[1]}${rir[1]==='3'?'+':''} reps in reserve.`);}
  const sets=t.match(/\b(?:only |cap at |limit to |do |max )?(\d{1,2})\s+(?:working )?sets?\b/);if(sets && +sets[1]>=1 && +sets[1]<=10){rules.maxSets=+sets[1];changes.push(`Cap each exercise at ${rules.maxSets} total sets per side, including sets already logged.`);}
  const reps=t.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*reps?\b/);if(reps && +reps[1]>=1 && +reps[2]>=+reps[1] && +reps[2]<=50){rules.minReps=+reps[1];rules.maxReps=+reps[2];changes.push(`Use a ${rules.minReps}–${rules.maxReps} rep range for the remaining workout.`);}
  const mins=t.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/);if(mins && +mins[1]>=1 && +mins[1]<=180){rules.deadline=now+(+mins[1]*60000);changes.push(`Finish within ${mins[1]} minutes from now.`);}
  if(/\b(skip|avoid|stop|no more)\b/.test(t)){
    const named=variants.filter(v=>{const name=v.name.toLowerCase().replace(/single-(leg|arm) |dumbbell /g,'');return t.includes(name);});
    const targets=named.length?named.map(v=>v.id):/\b(this|current) (exercise|one)\b/.test(t)?[selectedId]:[];
    targets.forEach(id=>{if(!rules.skipped!.includes(id))rules.skipped!.push(id);});
    if(targets.length)changes.push(`Skip ${variants.filter(v=>targets.includes(v.id)).map(v=>v.name).join(', ')} for this workout.`);
  }
  if(/\b(pain|hurts|painful|aching)\b/.test(t) && !/\b(no pain|pain.free|doesn't hurt|not painful)\b/.test(t)){
    if(!rules.skipped!.includes(selectedId))rules.skipped!.push(selectedId);
    changes.push('Pause the current exercise because you mentioned pain. Choose a pain-free alternative; this does not diagnose the cause.');
  }
  return {rules,response:changes.length?changes.join(' '):'Saved as a workout note. I could not confidently map this to a plan change. Try “go lighter”, “2 sets per exercise”, “8–12 reps”, or “skip leg press”.'};
}
