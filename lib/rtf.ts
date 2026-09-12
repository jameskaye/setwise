import type {LoggedSet, Recommendation, Session, Side, Snapshot, Variant} from './model';
import type {Routine} from './routine';
import {coversSide} from './set-sides';

// Transcribed from the supplied SBS Setup rows 4 and 9. Deload overrides are
// in the workout sheets (4x!AS5:AU5, CP5:CR5, EM5:EO5), not Setup's rep lookup.
export const RTF_MAIN = [
  [.7,5,10],[.75,4,8],[.8,3,6],[.725,5,9],[.775,4,7],[.825,3,5],[.6,5,0],
  [.75,4,8],[.8,3,6],[.85,2,4],[.775,4,7],[.825,3,5],[.875,2,3],[.6,5,0],
  [.8,3,6],[.85,2,4],[.9,1,2],[.85,2,4],[.9,1,2],[.95,1,1],[.6,5,0],
] as const;
export const RTF_AUXILIARY = [
  [.6,7,14],[.65,6,12],[.7,5,10],[.625,7,13],[.675,6,11],[.725,5,9],[.5,5,0],
  [.65,6,12],[.7,5,10],[.75,4,8],[.675,6,11],[.725,5,9],[.775,4,7],[.5,5,0],
  [.7,5,10],[.75,4,8],[.8,3,6],[.75,4,8],[.8,3,6],[.85,2,4],[.5,5,0],
] as const;
export function rtfAdjustment(reps:number,target:number){
  const delta=reps-target;
  return delta<=-2?-.05:delta===-1?-.02:delta===0?0:delta>=5?.03:delta*.005;
}
export const isDeload=(week:number)=>week%7===0;
export const roundLoad=(load:number,step:number)=>Math.round((load+1e-9)/step)*step;
export interface ProgramLift {
  variantId:string; profile:'main'|'auxiliary'|'accessory'|'controlled';
  sets:number; reps:number; maxReps:number; repOutTarget:number|null;
  intensity:number|null; trainingMax:Partial<Record<Side,number>>;
  weight:Partial<Record<Side,number>>; increment:number;
}
export interface ProgramSession {id:string;workoutId:string;week:number;advance?:boolean;lifts:ProgramLift[];}
export function programWeek(routine:Routine,workoutId:string,sessions:Session[]){
  if(!routine.program)return 1;
  const done=sessions.filter(s=>s.status==='finished'&&s.rules.program?.id===routine.program!.id&&s.rules.program.workoutId===workoutId&&s.rules.program.advance);
  return Math.max(0,...done.map(s=>s.rules.program!.week))+1;
}
export function nextProgramWorkout(routine:Routine,sessions:Session[]){
  return routine.workouts.slice().sort((a,b)=>programWeek(routine,a.id,sessions)-programWeek(routine,b.id,sessions))[0];
}
function workingSets(session:Session,variantId:string,side:Side,sets:LoggedSet[]){
  return sets.filter(s=>s.sessionId===session.id&&s.variantId===variantId&&coversSide(s,side)&&s.type==='working').sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
}
export function liftOutcome(session:Session,lift:ProgramLift,side:Side,sets:LoggedSet[]){
  const work=workingSets(session,lift.variantId,side,sets);
  const load=lift.weight[side]??work[0]?.weight;
  const tm=lift.trainingMax[side]??(lift.intensity&&load?load/lift.intensity:undefined);
  const valid=work.length===lift.sets&&work.every(s=>s.weight===load&&s.painSeverity===0)
    &&work.slice(0,-1).every(s=>s.reps>=lift.reps)&&!session.rules.easy&&!session.rules.skipped?.includes(lift.variantId)
    &&session.rules.maxSets===undefined&&session.rules.minReps===undefined&&session.rules.maxReps===undefined;
  const adjustment=valid&&lift.repOutTarget!==null?rtfAdjustment(work.at(-1)!.reps,lift.repOutTarget):0;
  return {trainingMax:tm===undefined?undefined:tm*(1+adjustment),adjustment,valid,load,
    reason:!valid?'Incomplete, changed-load, modified, or painful work: training max held.':lift.repOutTarget===null?'No rep-out adjustment.':`Final set ${work.at(-1)!.reps} / ${lift.repOutTarget}: training max ${adjustment>0?'+':''}${Number((adjustment*100).toFixed(2))}%.`};
}
export function buildProgramSession(routine:Routine,workoutId:string,state:Snapshot):ProgramSession|undefined {
  if(!routine.program)return;
  const template=routine.workouts.find(w=>w.id===workoutId)!;
  const week=programWeek(routine,workoutId,state.sessions);
  if(week>21)throw new Error('This workout has completed all 21 weeks. Set up a new cycle before continuing.');
  const previous=state.sessions.filter(s=>s.status==='finished'&&s.rules.program?.id===routine.program!.id&&s.rules.program.workoutId===workoutId&&s.rules.program.advance)
    .sort((a,b)=>b.rules.program!.week-a.rules.program!.week)[0];
  const lifts=template.exercises.map(p=>{
    const v=state.variants.find(v=>v.id===p.variantId)!;
    const config=routine.program!.lifts.find(l=>l.workoutId===workoutId&&l.variantId===p.variantId);
    const profile=config?.profile??'accessory';
    const rtf=profile==='main'||profile==='auxiliary';
    const schedule=(profile==='main'?RTF_MAIN:RTF_AUXILIARY)[week-1];
    const lift:ProgramLift={variantId:v.id,profile,sets:rtf?p.sets:isDeload(week)?Math.max(1,Math.ceil(p.sets/2)):p.sets,
      reps:rtf?schedule[1]:p.minReps,maxReps:rtf?schedule[1]:p.maxReps,
      repOutTarget:rtf&&!isDeload(week)?schedule[2]:null,intensity:rtf?schedule[0]:null,
      trainingMax:{},weight:{},increment:v.increment};
    const old=previous?.rules.program?.lifts.find(l=>l.variantId===v.id&&l.profile===profile);
    for(const side of (v.unilateral?['left','right']:['both']) as Side[]){
      const outcome=old&&previous?liftOutcome(previous,old,side,state.sets):undefined;
      if(rtf){
        const tm=outcome?.trainingMax??config?.trainingMax;
        if(tm){lift.trainingMax[side]=tm;lift.weight[side]=roundLoad(tm*lift.intensity!,v.increment);}
      }else{
        // Accessories progress between completed sessions, never from a guessed RIR.
        // Ignore deloads when choosing their next normal working load.
        const prior=state.sessions.filter(s=>s.status==='finished'&&s.rules.program?.id===routine.program!.id&&s.rules.program.workoutId===workoutId&&!isDeload(s.rules.program.week)&&s.rules.program.advance)
          .sort((a,b)=>b.rules.program!.week-a.rules.program!.week).find(s=>workingSets(s,v.id,side,state.sets).length);
        const work=prior?workingSets(prior,v.id,side,state.sets):[];
        let load=work[0]?.weight??config?.startingWeight;
        const oldLift=prior?.rules.program?.lifts.find(l=>l.variantId===v.id);
        if(load!==undefined&&profile==='accessory'&&oldLift&&work.length===oldLift.sets&&work.every(s=>s.weight===load&&s.reps>=oldLift.maxReps&&!s.painSeverity)&&!prior!.rules.easy&&!prior!.rules.skipped?.includes(v.id))load+=v.increment;
        if(load!==undefined)lift.weight[side]=isDeload(week)?roundLoad(load*.9,v.increment):load;
      }
    }
    return lift;
  });
  return {id:routine.program.id,workoutId,week,lifts};
}
export function programRecommendation(v:Variant,session:Session,sets:LoggedSet[],side:Side,type:string):Recommendation|undefined{
  const program=session.rules.program,lift=program?.lifts.find(l=>l.variantId===v.id);
  if(!program||!lift)return;
  const work=workingSets(session,v.id,side,sets),count=work.length;
  const weight=work.at(-1)?.weight??lift.weight[side]??null;
  const final=lift.repOutTarget!==null&&count===lift.sets-1;
  const base={min:lift.reps,max:lift.maxReps,targetRir:0,reps:final?lift.repOutTarget!:lift.reps,weight,status:'ready' as Recommendation['status'],label:final?'Final set · rep out':isDeload(program.week)?'Deload set':'Prescribed set',program:true,repOut:final};
  if(type==='warmup')return {...base,weight:weight===null?null:roundLoad(weight*.55,lift.increment),label:'Warmup',repOut:false,reason:'Light rehearsal. Warmups do not affect the program.'};
  if(type!=='working')return {...base,status:'pause',label:'Use working sets',reason:'Use Working for the prescribed sets; only the final prescribed working set drives RTF progression.'};
  if(count>=lift.sets)return {...base,status:'complete',label:'Target complete',reason:liftOutcome(session,lift,side,sets).reason};
  if(session.rules.easy)return {...base,repOut:false,weight:weight===null?null:roundLoad(weight*.9,lift.increment),reps:lift.reps,label:'Easy workout',reason:'Rep-out progression is held for this modified workout. Keep the effort comfortable.'};
  return {...base,status:weight===null?'calibrate':'ready',reason:weight===null?
    `Choose a familiar light working load. The first working set anchors this side's load; ${lift.repOutTarget===null?'build clean reps.':'the final set is your rep-out set.'}`:
    final?`Aim to match or beat ${lift.repOutTarget} clean reps. Stop when another full rep with good form is not possible. Record actual reps; RIR is not required.`:
    `Week ${program.week}: ${lift.sets} sets${v.unilateral?' per side':''}, ${lift.reps}${lift.reps!==lift.maxReps?'–'+lift.maxReps:''} reps${lift.repOutTarget!==null?`, then ${lift.repOutTarget}+ on the final set`:''}. ${lift.profile==='controlled'?'Keep these controlled during recovery; automatic increases are held.':'Weight stays fixed within this workout.'}`};
}
