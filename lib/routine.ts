import {z} from 'zod';
import type {Session, Snapshot, Variant} from './model';

export const identifier=z.string().min(1).max(180);
const bounded=z.number().int().min(1).max(50);
export const supersetsSchema=z.array(z.tuple([identifier,identifier])).max(10).refine(groups=>new Set(groups.flat()).size===groups.flat().length,'Each exercise can belong to only one superset');
export const prescriptionSchema=z.object({
  variantId:identifier,minReps:bounded,maxReps:bounded,
  sets:z.number().int().min(1).max(10),targetRir:z.number().int().min(0).max(3),
}).strict().refine(v=>v.minReps<=v.maxReps,'Minimum reps cannot exceed maximum reps');
export const workoutTemplateSchema=z.object({
  id:identifier,name:z.string().trim().min(1).max(80),notes:z.string().max(2000),
  timeLimitMinutes:z.number().int().min(5).max(180).nullable(),
  exercises:z.array(prescriptionSchema).min(1).max(20),
  supersets:supersetsSchema.optional(),
}).strict().refine(w=>new Set(w.exercises.map(e=>e.variantId)).size===w.exercises.length,'Use distinct variants').refine(w=>(w.supersets??[]).flat().every(id=>w.exercises.some(e=>e.variantId===id)),'Superset exercises must be in the workout');
export const routineSchema=z.object({
  name:z.string().trim().min(1).max(80),notes:z.string().max(2000),
  constraints:z.array(z.string().trim().min(1).max(300)).max(15),
  workouts:z.array(workoutTemplateSchema).min(1).max(7),
  program:z.object({id:identifier,lifts:z.array(z.object({
    workoutId:identifier,variantId:identifier,profile:z.enum(['main','auxiliary','accessory','controlled']),
    trainingMax:z.number().finite().positive().max(2000).optional(),
    trainingMaxOverride:z.number().finite().positive().max(2000).optional(),
    startingWeight:z.number().finite().min(0).max(2000).optional(),
  }).strict()).max(140)}).strict().optional(),
}).strict().refine(r=>new Set(r.workouts.map(w=>w.id)).size===r.workouts.length,'Use distinct workout IDs');
export const saveRoutineSchema=z.object({requestId:identifier,expectedRevision:z.number().int().min(0),reason:z.string().trim().min(1).max(1000),routine:routineSchema}).strict();
export type Prescription=z.infer<typeof prescriptionSchema>;
export type Routine=z.infer<typeof routineSchema>;
export interface RoutineRevision {revision:number;requestId:string;createdAt:number;reason:string;routine:Routine;}
export function defaultRoutine(state:Snapshot):Routine {
  const recent=state.sessions.filter(s=>s.status!=='seed').sort((a,b)=>b.startedAt-a.startedAt)[0];
  const ids=recent?.plan??state.variants.slice(0,5).map(v=>v.id);
  return {name:'My routine',notes:'',constraints:[],workouts:[{id:'leg-day',name:recent?.name??'Leg day',notes:'',timeLimitMinutes:null,exercises:ids.map(id=>{
    const v=state.variants.find(v=>v.id===id)!;
    return {variantId:id,minReps:v.minReps,maxReps:v.maxReps,sets:v.defaultSets,targetRir:2};
  })}]};
}
export function sessionVariant(v:Variant,session?:Session):Variant {
  const lift=session?.rules.program?.lifts.find(l=>l.variantId===v.id);
  if(lift)return {...v,minReps:lift.reps,maxReps:lift.maxReps,defaultSets:lift.sets,increment:lift.increment};
  const p=session?.prescriptions?.find(p=>p.variantId===v.id);
  return p?{...v,minReps:p.minReps,maxReps:p.maxReps,defaultSets:p.sets}:v;
}
