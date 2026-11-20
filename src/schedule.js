/* NowLine schedule model + importers (pure: no DOM, no storage).
   Every importer produces the normalized shape:
   { name, buildings:{id:{name,color,walk:{id:min}}},
     venues:[{id,name,building}],
     sessions:[{id,title,start,end,venue,track,speakers,desc}],   // start/end: ms since epoch (real instants)
     tz,          // the event's IANA zone if the source gives one, else null
     floating } // set when some times had no offset: the zone they were read in (see tz.js rezone) */
import { parseWhen, validZone, deviceZone, shiftToToday } from './tz.js';
export const MIN = 60000, HOUR = 60*MIN;
export const PALETTE = ['#7cc4ff','#b48cff','#5fd39b','#ffb066','#ff7fb0','#6fe0e0','#d8d36a','#a0a8ff'];

/* ---------- importers: pretalx/frab, Sessionize (all-data & grid), simple JSON ---------- */
export function hm(str){const [h,m]=String(str).split(':').map(Number);return (h*60+(m||0))*MIN}
export function normalize(j){
  let name='Imported schedule', rooms=new Map(), sessions=[], tz=null, floating=false;
  const at=v=>{const r=parseWhen(v,tz); if(r.floating) floating=true; return r.t;};
  const room = (key,label,building)=>{ if(!rooms.has(key)) rooms.set(key,{id:key,name:label||key,building:building||'venue'}); return key; };

  if (j && j.schedule && j.schedule.conference){                       // pretalx / frab schedule.json
    const c=j.schedule.conference; name=c.title||name; tz=c.time_zone_name||null;
    (c.days||[]).forEach(day=>Object.entries(day.rooms||{}).forEach(([rn,evs])=>evs.forEach(e=>{
      const st=at(e.date); if(isNaN(st)) return;
      sessions.push({id:String(e.guid||e.id||Math.random()),title:e.title,start:st,end:st+hm(e.duration||'0:30'),
        venue:room(rn,rn),track:e.track||e.type||'',speakers:(e.persons||[]).map(p=>p.public_name||p.name||''),
        desc:e.abstract||e.description||''});
    })));
  } else if (j && Array.isArray(j.sessions) && Array.isArray(j.rooms)){ // Sessionize "All data"
    tz=j.timeZone||j.timezone||null;   // Sessionize exports may not carry a zone; used if present
    const sp=new Map((j.speakers||[]).map(s=>[s.id,s.fullName||((s.firstName||'')+' '+(s.lastName||''))]));
    j.rooms.forEach(r=>room(String(r.id),r.name));
    j.sessions.forEach(s=>{ if(!s.startsAt) return;
      sessions.push({id:String(s.id),title:s.title,start:at(s.startsAt),end:at(s.endsAt),
        venue:room(String(s.roomId),s.room),track:'',speakers:(s.speakers||[]).map(x=>sp.get(x)||x.name||x),desc:s.description||''});
    });
  } else if (Array.isArray(j) && j[0] && Array.isArray(j[0].rooms)){  // Sessionize "Schedule grid"
    j.forEach(day=>day.rooms.forEach(r=>{ room(String(r.id),r.name);
      (r.sessions||[]).forEach(s=>sessions.push({id:String(s.id),title:s.title,start:at(s.startsAt),
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
      sessions.push({id:String(s.id||i),title:s.title,start:at(s.start),end:at(s.end),
        venue:v,track:s.track||'',speakers:[].concat(s.speakers||s.speaker||[]),desc:s.description||s.desc||''});
    });
    if (j.buildings){ const d=withZone(finish(name,[...rooms.values()],sessions,j.buildings)); d.routes=j.routes||{}; return d; }
  }
  return withZone(finish(name,[...rooms.values()],sessions,null));
  function withZone(d){ d.tz=validZone(tz)?tz:null; if(floating) d.floating=d.tz||deviceZone(); return d; }
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

/* ---------- venue overlay (venue.json): buildings, walk times, room → building/where, routes ----------
   { buildings:{id:{name,color,walk:{otherId:min}}}, rooms:{"<feed room id or name>":{building,where}}, routes:{"a>b":"text"} }
   Untrusted (fetched from a link): ids are checked, text is kept as plain capped strings (the UI escapes it
   on output), colors go through cleanBuildings, walks are numbers. Rooms match by id, else by case-insensitive name. */
const BAD_KEY=new Set(['__proto__','constructor','prototype']);
const okId=k=>k.length>0&&k.length<=64&&!BAD_KEY.has(k)&&!k.includes('>');
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const text=(s,n)=>typeof s==='string'?s.replace(/[\u0000-\u001f\u007f]+/g,' ').trim().slice(0,n):'';
export function applyVenue(data,venue){
  if(!plain(venue)) throw new Error('Venue file must be a JSON object.');
  const vb=plain(venue.buildings)?Object.entries(venue.buildings).filter(([k,b])=>okId(k)&&plain(b)).slice(0,200):[];
  const ids=new Set(vb.map(([k])=>k)), raw={};
  vb.forEach(([k,b])=>{ const walk={};
    if(plain(b.walk)) Object.entries(b.walk).forEach(([o,m])=>{ if(ids.has(o)&&typeof m==='number'&&isFinite(m)&&m>=0&&m<=1440) walk[o]=m; });
    raw[k]={name:text(b.name,80)||k,color:b.color,walk};
  });
  const added=cleanBuildings(raw);
  const byId=new Map(data.venues.map(v=>[String(v.id),v])), byName=new Map(data.venues.map(v=>[String(v.name).trim().toLowerCase(),v]));
  const patch=new Map();
  if(plain(venue.rooms)) Object.entries(venue.rooms).slice(0,5000).forEach(([k,r])=>{
    if(!plain(r)) return;
    const v=byId.get(k)||byName.get(k.trim().toLowerCase()); if(!v) return;
    const p={}; if(typeof r.building==='string'&&ids.has(r.building)) p.building=r.building;
    const w=text(r.where,200); if(w) p.where=w;
    patch.set(v.id,{...patch.get(v.id),...p});
  });
  const venues=data.venues.map(v=>{ const {map,...rest}=v; return {...rest,...patch.get(v.id)}; });   // map positions get re-laid out
  // the feed's own buildings stay for rooms the venue file doesn't place
  const used=new Set(venues.map(v=>v.building)), buildings={...added};
  Object.entries(data.buildings||{}).forEach(([k,b])=>{ if(used.has(k)&&!BAD_KEY.has(k)&&!buildings[k]){ const {map,...rest}=b; buildings[k]=rest; } });
  const routes={...(data.routes||{})};
  if(plain(venue.routes)) Object.entries(venue.routes).slice(0,2000).forEach(([k,t])=>{
    const [a,b,...more]=k.split('>'); t=text(t,500);
    if(!more.length&&ids.has(a)&&ids.has(b)&&t) routes[k]=t;
  });
  const single=Object.keys(buildings).length===1;
  venues.forEach((v,i)=>v.color=single?PALETTE[i%PALETTE.length]:(buildings[v.building]||{}).color||PALETTE[i%PALETTE.length]);
  const out={...data,buildings,venues,routes}; delete out.site;
  return out;
}
