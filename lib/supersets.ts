import type {Session,Side,Snapshot} from './model';
import {recommend} from './coach';
import {coversSide} from './set-sides';

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
    const counts=sides.map(side=>({side,count:state.sets.filter(s=>s.sessionId===session.id&&s.variantId===id&&coversSide(s,side)&&s.type==='working').length}));
    const available=counts.filter(({side})=>['ready','calibrate'].includes(recommend(v,session,state.sets,side,'working',now).status)).sort((a,b)=>a.count-b.count);
    if(!available.length)return [];
    return [{variantId:id,side:available[0].side,rounds:counts.reduce((sum,s)=>sum+s.count,0)/sides.length}];
  }).sort((a,b)=>{
    // Finish the other side of a legacy separate-side round before switching.
    const partial=(c:typeof a)=>c.variantId===variantId&&c.rounds%1!==0;
    return Number(partial(b))-Number(partial(a))||a.rounds-b.rounds||Number(a.variantId===variantId)-Number(b.variantId===variantId);
  });
  return candidates[0]??null;
}

export function nextAfterSavedSet(state:Snapshot,session:Session,variantId:string,type='working',autoSuperset=true,now=Date.now()):{variantId:string}|{finish:true}|null {
  if(type!=='working')return null;
  if(autoSuperset){const paired=nextSupersetSet(state,session,variantId,type,now);if(paired)return {variantId:paired.variantId};}
  const current=state.variants.find(v=>v.id===variantId);
  if(!current||['ready','calibrate'].includes(recommend(current,session,state.sets,'both','working',now).status))return null;
  const position=session.plan.indexOf(variantId),ordered=session.plan.slice(position+1).concat(session.plan.slice(0,position));
  for(const id of ordered){const v=state.variants.find(v=>v.id===id);if(v&&['ready','calibrate'].includes(recommend(v,session,state.sets,'both','working',now).status))return {variantId:id};}
  return {finish:true};
}
