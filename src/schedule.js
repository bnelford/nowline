/* NowLine schedule model + importers (pure: no DOM, no storage).
   Every importer produces the normalized shape:
   { name, buildings:{id:{name,color,walk:{id:min}}},
     venues:[{id,name,building}],
     sessions:[{id,title,start,end,venue,track,speakers,desc,floating}],   // start/end: ms since epoch (real instants);
                                                                   // floating: true when read without an offset
     tz,          // the event's IANA zone if the source gives one, else null
     floating } // set when some times had no offset: the zone they were read in (see tz.js rezone) */
import { parseWhen, validZone, deviceZone, shiftToToday } from './tz.js';
export const MIN = 60000, HOUR = 60*MIN;
export const PALETTE = ['#7cc4ff','#b48cff','#5fd39b','#ffb066','#ff7fb0','#6fe0e0','#d8d36a','#a0a8ff'];

/* ---------- importers: pretalx/frab, Sessionize (all-data & grid), simple JSON ---------- */
export function hm(str){const [h,m]=String(str).split(':').map(Number);return (h*60+(m||0))*MIN}
export function normalize(j){
  let name='Imported schedule', rooms=new Map(), sessions=[], tz=null, floating=false, fl=false;
  const at=v=>{const r=parseWhen(v,tz); if(r.floating) floating=fl=true; return r.t;};
  const add=s=>{ if(fl) s.floating=true; fl=false; sessions.push(s); };   // marks the session whose times were just read
  const room = (key,label,building)=>{ if(!rooms.has(key)) rooms.set(key,{id:key,name:label||key,building:building||'venue'}); return key; };

  if (j && j.schedule && j.schedule.conference){                       // pretalx / frab schedule.json
    const c=j.schedule.conference; name=c.title||name; tz=c.time_zone_name||null;
    (c.days||[]).forEach(day=>Object.entries(day.rooms||{}).forEach(([rn,evs])=>evs.forEach(e=>{
      const st=at(e.date); if(isNaN(st)){fl=false;return;}
      add({id:String(e.guid||e.id||Math.random()),title:e.title,start:st,end:st+hm(e.duration||'0:30'),
        venue:room(rn,rn),track:e.track||e.type||'',speakers:(e.persons||[]).map(p=>p.public_name||p.name||''),
        desc:e.abstract||e.description||''});
    })));
  } else if (j && Array.isArray(j.sessions) && Array.isArray(j.rooms)){ // Sessionize "All data"
    tz=j.timeZone||j.timezone||null;   // Sessionize exports may not carry a zone; used if present
    const sp=new Map((j.speakers||[]).map(s=>[s.id,s.fullName||((s.firstName||'')+' '+(s.lastName||''))]));
    j.rooms.forEach(r=>room(String(r.id),r.name));
    j.sessions.forEach(s=>{ if(!s.startsAt) return;
      add({id:String(s.id),title:s.title,start:at(s.startsAt),end:at(s.endsAt),
        venue:room(String(s.roomId),s.room),track:'',speakers:(s.speakers||[]).map(x=>sp.get(x)||x.name||x),desc:s.description||''});
    });
  } else if (Array.isArray(j) && j[0] && Array.isArray(j[0].rooms)){  // Sessionize "Schedule grid"
    j.forEach(day=>day.rooms.forEach(r=>{ room(String(r.id),r.name);
      (r.sessions||[]).forEach(s=>add({id:String(s.id),title:s.title,start:at(s.startsAt),
        end:at(s.endsAt),venue:String(r.id),track:'',speakers:(s.speakers||[]).map(x=>x.name||x),desc:s.description||''}));
    }));
  } else {                                                            // simple format
    const list = Array.isArray(j) ? j : (j.sessions||[]);
    if (j && j.name) name=j.name;
    if (j && j.timezone) tz=j.timezone;
    const bmap = {};
    (j.venues||[]).forEach(v=>{ room(v.id||v.name, v.name, v.building); if(v.where) rooms.get(v.id||v.name).where=v.where; });
    list.forEach((s,i)=>{
      const v = s.venue||s.room||'Main';
      room(v, v, s.building);
      add({id:String(s.id||i),title:s.title,start:at(s.start),end:at(s.end),
        venue:v,track:s.track||'',speakers:[].concat(s.speakers||s.speaker||[]),desc:s.description||s.desc||''});
    });
    if (j.buildings){ const d=withZone(finish(name,[...rooms.values()],sessions,j.buildings)); d.routes=j.routes||{}; return d; }
  }
  return withZone(finish(name,[...rooms.values()],sessions,null));
  function withZone(d){ d.tz=validZone(tz)?tz:null; if(floating&&d.sessions.some(s=>s.floating)) d.floating=d.tz||deviceZone(); return d; }
}
// Imported buildings are untrusted and end up in HTML/SVG attributes: keep only a text name, a hex color
// (else a palette one) and numeric walk minutes.
const HEX=/^#[0-9a-f]{3,8}$/i;
export function cleanBuildings(buildings){
  const out={};
  Object.entries(buildings).forEach(([id,b],i)=>{
    b=b||{}; const walk={};
    Object.entries(b.walk||{}).forEach(([k,m])=>{ m=Number(m); if(isFinite(m)&&m>=0) walk[k]=m; });
    out[id]={name:String(b.name??id),color:HEX.test(b.color)?b.color:PALETTE[i%PALETTE.length],walk};
  });
  return out;
}
export function finish(name,venues,sessions,buildings){
  sessions = sessions.filter(s=>s.title && isFinite(s.start) && isFinite(s.end) && s.end>s.start);
  if(!sessions.length) throw new Error('No sessions with valid start/end times found.');
  if(buildings) buildings=cleanBuildings(buildings);
  else{
    buildings={}; const ids=[...new Set(venues.map(v=>v.building))];
    ids.forEach((b,i)=>buildings[b]={name:b==='venue'?'Venue':b,color:PALETTE[i%PALETTE.length],walk:{}});
    // unknown geography: same building = 1 min, others = 8 min (editable later)
    ids.forEach(a=>ids.forEach(b=>buildings[a].walk[b]= a===b?1:8));
  }
  // if only one building, color lanes individually so they're distinguishable
  const single = Object.keys(buildings).length===1;
  venues.forEach((v,i)=>v.color = single ? PALETTE[i%PALETTE.length] : (buildings[v.building]||{}).color);
  return {name,buildings,venues,sessions};
}
// "Shift dates to today": whole days, so the event's first day (in its zone) is today there. Wall-clock times are kept.
export function rebaseToToday(data,tz,now){ return shiftToToday(data,validZone(tz)?tz:deviceZone(),now); }
// What changed between two loads of one schedule, by session id: a different room or start, or gone.
// → [{id,title,was,now,room,time,gone}]
export function diffSessions(a,b){
  const m=new Map(b.map(s=>[s.id,s])), out=[];
  a.forEach(s=>{ const n=m.get(s.id);
    if(!n) out.push({id:s.id,title:s.title,was:s,now:null,room:false,time:false,gone:true});
    else if(n.venue!==s.venue||n.start!==s.start) out.push({id:s.id,title:n.title,was:s,now:n,room:n.venue!==s.venue,time:n.start!==s.start,gone:false});
  });
  return out;
}
