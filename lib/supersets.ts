import type {Session,Side,Snapshot} from './model';
import {recommend} from './coach';

export function supersetFor(session:Session|undefined,variantId:string){
  return session?.rules.supersets?.find(pair=>pair.includes(variantId));
}
// Balance completed rounds, not raw counts: a unilateral exercise needs two
// side-specific sets per round. Use confirmed D1 sets, so retries/reloads agree.
export function nextSupersetSet(state:Snapshot,session:Session,variantId:string,type='working',now=Date.now()){
  const pair=supersetFor(session,variantId);
  if(!pair||type!=='working')return null;
  const candidates=pair.flatMap(id=>{
    const v=state.variants.find(v=>v.id===id);
    if(!v||!session.plan.includes(id))return [];
    const sides:Side[]=v.unilateral?['left','right']:['both'];
    const counts=sides.map(side=>({side,count:state.sets.filter(s=>s.sessionId===session.id&&s.variantId===id&&s.side===side&&s.type==='working').length}));
    const available=counts.filter(({side})=>['ready','calibrate'].includes(recommend(v,session,state.sets,side,'working',now).status)).sort((a,b)=>a.count-b.count);
    if(!available.length)return [];
    return [{variantId:id,side:available[0].side,rounds:counts.reduce((sum,s)=>sum+s.count,0)/sides.length}];
  }).sort((a,b)=>a.rounds-b.rounds||Number(a.variantId===variantId)-Number(b.variantId===variantId));
  return candidates[0]??null;
}
