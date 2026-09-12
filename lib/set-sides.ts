import type {LoggedSet,Side} from './model';
// A combined entry records the entered weight and reps on each side.
export const coversSide=(set:LoggedSet,side:Side)=>set.side===side||set.side==='both';
export function completedRounds(sets:LoggedSet[],unilateral:boolean){
 return unilateral?Math.min(sets.filter(s=>coversSide(s,'left')).length,sets.filter(s=>coversSide(s,'right')).length):sets.length;
}
