import { MIN, PALETTE, finish } from './schedule.js';

/* ---------- calendar import (.ics) ---------- */
// Only used by parseICS_legacy below.
export function icsDate(v){
  const m=String(v).match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/); if(!m||!m[4]) return null; // skip all-day
  const a=[+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)];
  return m[7]?Date.UTC(...a):new Date(...a).getTime();   // floating/TZID times read as this device's zone
}
export function icsDur(v){const m=String(v).match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);return m?((+m[1]||0)*24*60+(+m[2]||0)*60+(+m[3]||0))*MIN:0;}
export const icsUnesc=s=>s.replace(/\\n/gi,' ').replace(/\\([,;\\])/g,'$1');
export function zonedToUtc(a,tz){            // a = [y, month0, d, h, mi, s] as wall-clock time in IANA zone tz
  const base=Date.UTC(...a);
  try{
    const f=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
    let g=base;
    for(let i=0;i<3;i++){
      const p=Object.fromEntries(f.formatToParts(new Date(g)).map(x=>[x.type,x.value]));
      const seen=Date.UTC(+p.year,+p.month-1,+p.day,(+p.hour)%24,+p.minute,+p.second);
      const diff=base-seen; if(!diff) break; g+=diff;
    }
    return g;
  }catch(e){ return new Date(...a).getTime(); }   // unknown zone name (e.g. Windows names): read as device-local
}
export function icsTime(val,params){
  const m=String(val).trim().match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/); if(!m||!m[4]) return null;
  const a=[+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)];
  if(m[7]) return Date.UTC(...a);
  const tz=(params.match(/TZID=("?)([^";:]+)\1/i)||[])[2];
  return tz?zonedToUtc(a,tz):new Date(...a).getTime();
}
export const icsText=v=>v.replace(/\\n/gi,'\n').replace(/\\([,;\\])/g,'$1').trim();
export function parseICSEvents(text){
  const lines=String(text).replace(/\r?\n[ \t]/g,'').split(/\r?\n/), evs=[]; let cur=null, cal={}, depth=0;
  for(const L of lines){
    if(/^BEGIN:VEVENT$/i.test(L)){cur={};continue;}
    if(/^END:VEVENT$/i.test(L)){ if(cur&&cur.start){ if(!cur.end&&cur.dur) cur.end=cur.start+cur.dur; if(cur.end>cur.start) evs.push(cur);} cur=null; continue; }
    if(/^BEGIN:(VTIMEZONE|VALARM|STANDARD|DAYLIGHT)$/i.test(L)){depth++;continue;}
    if(/^END:(VTIMEZONE|VALARM|STANDARD|DAYLIGHT)$/i.test(L)){depth--;continue;}
    if(depth>0) continue;
    const i=L.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/); if(i<0) continue;
    const key=L.slice(0,i), val=L.slice(i+1), name=key.split(';')[0].toUpperCase(), params=key.slice(name.length);
    if(!cur){ if(name==='X-WR-CALNAME') cal.name=icsText(val); if(name==='X-WR-TIMEZONE') cal.tz=val.trim(); continue; }
    if(name==='SUMMARY') cur.title=icsText(val);
    else if(name==='LOCATION') cur.loc=icsText(val);
    else if(name==='DESCRIPTION') cur.notes=icsText(val);
    else if(name==='CATEGORIES') cur.cats=icsText(val);
    else if(name==='URL') cur.url=val.trim();
    else if(name==='UID') cur.uid=val.trim();
    else if(name==='DTSTART') cur.start=icsTime(val, params||(cal.tz?';TZID='+cal.tz:''));
    else if(name==='DTEND') cur.end=icsTime(val, params||(cal.tz?';TZID='+cal.tz:''));
    else if(name==='DURATION') cur.dur=icsDur(val);
  }
  evs.cal=cal; return evs;
}
// Sched titles often end with " - Speaker Name, Company"
export function splitTitle(t){
  const i=t.lastIndexOf(' - '); if(i<8) return {title:t,speakers:[]};
  const tail=t.slice(i+3);
  if(tail.split(/\s+/).length<=16 && /,/.test(tail)) return {title:t.slice(0,i).trim(),speakers:tail.split(/\s*(?:&|;|\band\b)\s*/).map(x=>x.trim()).filter(Boolean)};
  return {title:t,speakers:[]};
}
// A whole-event calendar feed (Sched “iCal”, Swapcard/Cvent exports…) → a schedule: LOCATION becomes the room lane
export function scheduleFromICS(text,fallbackName){
  const evs=parseICSEvents(text); if(!evs.length) throw new Error('No timed events found in that calendar.');
  const seen=new Set(), rooms=new Map(), sessions=[];
  const levelOf=loc=>{const m=loc.match(/\(([^)]*\b(level|floor|lvl|ground|mezzanine|mezz|hall|building|tower|wing)\b[^)]*)\)/i)||loc.match(/\b(level\s*\w+|floor\s*\w+|\w+\s+floor)\b/i);return m?m[1].trim():null;};
  evs.forEach((e,i)=>{
    const id=e.uid||('ics'+i); if(seen.has(id)) return; seen.add(id);
    const loc=(e.loc||'').trim()||'Room TBA';
    if(!rooms.has(loc)){ const lv=levelOf(loc); rooms.set(loc,{id:loc,name:loc,building:lv||'venue',where:lv||''}); }
    const tt=splitTitle(e.title||'Untitled');
    sessions.push({id,title:tt.title,speakers:tt.speakers,start:e.start,end:e.end,venue:loc,track:(e.cats||'').split(',')[0].trim(),desc:e.notes||'',url:e.url||''});
  });
  const venues=[...rooms.values()].sort((a,b)=>a.building.localeCompare(b.building,undefined,{numeric:true})||a.name.localeCompare(b.name,undefined,{numeric:true}));
  const bids=[...new Set(venues.map(v=>v.building))], buildings={};
  bids.forEach((b,i)=>buildings[b]={name:b==='venue'?'Venue':b,color:PALETTE[i%PALETTE.length],walk:{}});
  bids.forEach(a=>bids.forEach(b=>buildings[a].walk[b]= a===b?1:3));   // floors of one venue: ~3 min by escalator (edit in config)
  return finish(evs.cal.name||fallbackName||'Imported calendar',venues,sessions,buildings);
}
export function parseICS(text){
  return parseICSEvents(text).map(e=>({title:e.title,loc:e.loc,notes:(e.notes||'').slice(0,400),uid:e.uid,start:e.start,end:e.end}));
}
// UNUSED: superseded by parseICSEvents (which handles TZID, X-WR-TIMEZONE, quoted params and
// VTIMEZONE/VALARM sub-blocks). Nothing in the app calls it; test/unit/ics.test.js asserts that and
// documents where it differs, so it can be deleted in a follow-up together with icsDate/icsUnesc.
export function parseICS_legacy(text){
  const lines=text.replace(/\r?\n[ \t]/g,'').split(/\r?\n/), evs=[]; let cur=null;
  for(const L of lines){
    if(L==='BEGIN:VEVENT') cur={};
    else if(L==='END:VEVENT'){ if(cur&&cur.start){ if(!cur.end&&cur.dur) cur.end=cur.start+cur.dur; if(cur.end>cur.start) evs.push(cur);} cur=null; }
    else if(cur){ const i=L.indexOf(':'); if(i<0) continue; const name=L.slice(0,i).split(';')[0], val=L.slice(i+1);
      if(name==='SUMMARY') cur.title=icsUnesc(val); else if(name==='LOCATION') cur.loc=icsUnesc(val);
      else if(name==='DESCRIPTION') cur.notes=icsUnesc(val).slice(0,400); else if(name==='UID') cur.uid=val;
      else if(name==='DTSTART') cur.start=icsDate(val); else if(name==='DTEND') cur.end=icsDate(val); else if(name==='DURATION') cur.dur=icsDur(val); }
  }
  return evs;
}
