import type {Snapshot} from './model';
import type {Routine} from './routine';
export function starterPlan(state:Snapshot):Routine {
 const byKey=(key:string)=>state.variants.find(v=>v.id.endsWith('-'+key))??state.variants[0];
 const days=[{id:'upper-a',name:'Upper A',keys:['bench','row','lateral']},{id:'lower-a',name:'Lower A',keys:['press','extension','rdl']},{id:'upper-b',name:'Upper B',keys:['shoulder','bench','curl']},{id:'lower-b',name:'Lower B',keys:['press','rdl','thrust']}];
 const lifts:NonNullable<Routine['program']>['lifts']=[];
 const workouts=days.map(day=>({id:day.id,name:day.name,notes:'',timeLimitMinutes:null,exercises:day.keys.map((key,i)=>{
  const v=byKey(key);lifts.push({workoutId:day.id,variantId:v.id,profile:key==='rdl'?'controlled':i===0?'main':i===1?'auxiliary':'accessory'});
  return {variantId:v.id,sets:i===0?4:3,minReps:v.minReps,maxReps:v.maxReps,targetRir:0};
 })}));
 return {name:'My strength plan',notes:'',constraints:[],workouts,program:{id:crypto.randomUUID(),lifts}};
}
