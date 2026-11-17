import { MIN } from './schedule.js';

/* ---------- personal agenda: walk times and conflicts (pure; `data` is the loaded schedule) ---------- */
export function walkBetween(data,a,b){
  if(!a||!b) return null; if(a===b) return 0;
  const A=data.venues.find(v=>v.id===a),B=data.venues.find(v=>v.id===b); if(!A||!B) return null;
  const w=(data.buildings[A.building]||{}).walk||{};
  return w[B.building] ?? (A.building===B.building?1:8);
}
// items: blocks + starred sessions, sorted by start then end
export function agendaIssues(data,items){
  const out=[];
  for(let i=0;i<items.length;i++){
    const a=items[i];
    for(let j=i+1;j<items.length && items[j].start<a.end;j++){            // overlaps
      const b=items[j]; out.push({type:'overlap',a,b,at:b.start,until:Math.min(a.end,b.end)});
    }
    // the next thing you'd walk to after `a` ends
    const nextStart=items.filter(x=>x!==a && x.start>=a.end).reduce((m,x)=>Math.min(m,x.start),Infinity);
    if(!isFinite(nextStart)) continue;
    items.filter(x=>x!==a && x.start===nextStart).forEach(b=>{
      const w=walkBetween(data,a.venue,b.venue); if(w==null||w===0) return;
      const gap=Math.round((b.start-a.end)/MIN);
      out.push({type:'walk',a,b,walk:w,gap,late:Math.max(0,w-gap),bad:w>gap,at:a.end});
    });
  }
  return out;
}
