'use client';
import {useEffect,useState} from 'react';
import {Minus,Plus} from 'lucide-react';
export function Counter({label,value,onChange,step=1,unit,max=2000}:{label:string;value:number|null;onChange:(v:number|null)=>void;step?:number;unit?:string;max?:number}){
 const [text,setText]=useState(value===null?'':String(value));
 useEffect(()=>{setText(value===null?'':String(value));},[value]);
 function adjust(amount:number){const next=Math.min(max,Math.max(0,Math.round(((value??0)+amount)*100)/100));setText(String(next));onChange(next);}
 return <div className="counter"><div className="field-label">{label}<span>{unit}</span></div><div className="counter-controls"><button aria-label={`Decrease ${label.toLowerCase()}`} onClick={()=>adjust(-step)}><Minus size={23}/></button><input aria-label={label} inputMode="decimal" type="number" min="0" max={max} step={step} value={text} placeholder="—" onFocus={e=>e.target.select()} onChange={e=>{const raw=e.target.value;setText(raw);const number=Number(raw);onChange(raw!==''&&Number.isFinite(number)&&number>=0&&number<=max?number:null);}}/><button aria-label={`Increase ${label.toLowerCase()}`} onClick={()=>adjust(step)}><Plus size={23}/></button></div></div>;
}
