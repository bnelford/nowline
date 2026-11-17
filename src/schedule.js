/* NowLine schedule model + importers (pure: no DOM, no storage).
   Every importer produces the normalized shape:
   { name, buildings:{id:{name,color,walk:{id:min}}},
     venues:[{id,name,building}],
     sessions:[{id,title,start,end,venue,track,speakers,desc}] } */
export const MIN = 60000, HOUR = 60*MIN;
export const PALETTE = ['#7cc4ff','#b48cff','#5fd39b','#ffb066','#ff7fb0','#6fe0e0','#d8d36a','#a0a8ff'];

/* ---------- importers: pretalx/frab, Sessionize (all-data & grid), simple JSON ---------- */
export function hm(str){const [h,m]=String(str).split(':').map(Number);return (h*60+(m||0))*MIN}
export function normalize(j){
  let name='Imported schedule', rooms=new Map(), sessions=[];
  const room = (key,label,building)=>{ if(!rooms.has(key)) rooms.set(key,{id:key,name:label||key,building:building||'venue'}); return key; };

  if (j && j.schedule && j.schedule.conference){                       // pretalx / frab schedule.json
    const c=j.schedule.conference; name=c.title||name;
    (c.days||[]).forEach(day=>Object.entries(day.rooms||{}).forEach(([rn,evs])=>evs.forEach(e=>{
      const st=new Date(e.date).getTime(); if(isNaN(st)) return;
      sessions.push({id:String(e.guid||e.id||Math.random()),title:e.title,start:st,end:st+hm(e.duration||'0:30'),
        venue:room(rn,rn),track:e.track||e.type||'',speakers:(e.persons||[]).map(p=>p.public_name||p.name||''),
        desc:e.abstract||e.description||''});
    })));
  } else if (j && Array.isArray(j.sessions) && Array.isArray(j.rooms)){ // Sessionize "All data"
    const sp=new Map((j.speakers||[]).map(s=>[s.id,s.fullName||((s.firstName||'')+' '+(s.lastName||''))]));
    j.rooms.forEach(r=>room(String(r.id),r.name));
    j.sessions.forEach(s=>{ if(!s.startsAt) return;
      sessions.push({id:String(s.id),title:s.title,start:new Date(s.startsAt).getTime(),end:new Date(s.endsAt).getTime(),
        venue:room(String(s.roomId),s.room),track:'',speakers:(s.speakers||[]).map(x=>sp.get(x)||x.name||x),desc:s.description||''});
    });
  } else if (Array.isArray(j) && j[0] && Array.isArray(j[0].rooms)){  // Sessionize "Schedule grid"
    j.forEach(day=>day.rooms.forEach(r=>{ room(String(r.id),r.name);
      (r.sessions||[]).forEach(s=>sessions.push({id:String(s.id),title:s.title,start:new Date(s.startsAt).getTime(),
        end:new Date(s.endsAt).getTime(),venue:String(r.id),track:'',speakers:(s.speakers||[]).map(x=>x.name||x),desc:s.description||''}));
    }));
  } else {                                                            // simple format
    const list = Array.isArray(j) ? j : (j.sessions||[]);
    if (j && j.name) name=j.name;
    const bmap = {};
    (j.venues||[]).forEach(v=>{ room(v.id||v.name, v.name, v.building); if(v.where) rooms.get(v.id||v.name).where=v.where; });
    list.forEach((s,i)=>{
      const v = s.venue||s.room||'Main';
      room(v, v, s.building);
      sessions.push({id:String(s.id||i),title:s.title,start:new Date(s.start).getTime(),end:new Date(s.end).getTime(),
        venue:v,track:s.track||'',speakers:[].concat(s.speakers||s.speaker||[]),desc:s.description||s.desc||''});
    });
    if (j.buildings){ const d=finish(name,[...rooms.values()],sessions,j.buildings); d.routes=j.routes||{}; return d; }
  }
  return finish(name,[...rooms.values()],sessions,null);
}
export function finish(name,venues,sessions,buildings){
  sessions = sessions.filter(s=>s.title && isFinite(s.start) && isFinite(s.end) && s.end>s.start);
  if(!sessions.length) throw new Error('No sessions with valid start/end times found.');
  if(!buildings){
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
export function rebaseToToday(data){
  const first = Math.min(...data.sessions.map(s=>s.start));
  const a=new Date(first); a.setHours(0,0,0,0); const b=new Date(); b.setHours(0,0,0,0);
  const delta=b-a; data.sessions.forEach(s=>{s.start+=delta;s.end+=delta}); return data;
}
