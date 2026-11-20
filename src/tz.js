/* ---------- time zones (pure: Intl only, no DOM, no storage) ----------
   Sessions are stored as real instants (ms since epoch). A zone only decides how they're shown,
   and how wall-clock times without an offset ("floating" times) are read. */
const MIN=60000, DAY=1440*MIN;

export const deviceZone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch(e){return 'UTC';}};
const ok=new Map();
export function validZone(tz){
  if(typeof tz!=='string'||!tz||tz.length>64) return false;
  if(!ok.has(tz)){ try{new Intl.DateTimeFormat('en-US',{timeZone:tz});ok.set(tz,true);}catch(e){ok.set(tz,false);} }
  return ok.get(tz);
}
// for browsers without Intl.supportedValuesOf
export const FALLBACK_ZONES=['UTC','Pacific/Honolulu','America/Anchorage','America/Los_Angeles','America/Vancouver','America/Phoenix',
  'America/Denver','America/Chicago','America/Mexico_City','America/New_York','America/Toronto','America/Halifax','America/Bogota',
  'America/Sao_Paulo','America/Argentina/Buenos_Aires','America/St_Johns','Atlantic/Reykjavik','Europe/London','Europe/Dublin',
  'Europe/Lisbon','Europe/Paris','Europe/Brussels','Europe/Amsterdam','Europe/Berlin','Europe/Madrid','Europe/Rome','Europe/Stockholm',
  'Europe/Warsaw','Europe/Prague','Europe/Athens','Europe/Helsinki','Europe/Kyiv','Europe/Istanbul','Europe/Moscow','Africa/Lagos',
  'Africa/Cairo','Africa/Johannesburg','Africa/Nairobi','Asia/Jerusalem','Asia/Dubai','Asia/Tehran','Asia/Karachi','Asia/Kolkata',
  'Asia/Kathmandu','Asia/Dhaka','Asia/Bangkok','Asia/Jakarta','Asia/Singapore','Asia/Shanghai','Asia/Hong_Kong','Asia/Taipei',
  'Asia/Manila','Asia/Seoul','Asia/Tokyo','Australia/Perth','Australia/Adelaide','Australia/Brisbane','Australia/Sydney',
  'Pacific/Auckland'];
// Intl.supportedValuesOf can list legacy names only (V8 has Asia/Calcutta, not Asia/Kolkata), so the
// common current names from the fallback list are always added
export function zoneList(intl=Intl){
  let z=[]; try{ if(typeof intl.supportedValuesOf==='function') z=intl.supportedValuesOf('timeZone'); }catch(e){}
  return [...new Set(['UTC',...(z||[]),...FALLBACK_ZONES.filter(validZone)])].sort((a,b)=>a==='UTC'?-1:b==='UTC'?1:a.localeCompare(b));
}
// Asia/Kolkata and Asia/Calcutta are the same zone
const canon=new Map();
export function sameZone(a,b){
  if(a===b) return true; if(!validZone(a)||!validZone(b)) return false;
  const c=z=>{if(!canon.has(z)) canon.set(z,new Intl.DateTimeFormat('en-US',{timeZone:z}).resolvedOptions().timeZone);return canon.get(z);};
  return c(a)===c(b);
}
// case-insensitive search that also matches "new york" against America/New_York
export function searchZones(list,q){
  const n=String(q||'').trim().toLowerCase().replace(/\s+/g,'_'); if(!n) return list;
  return list.filter(z=>z.toLowerCase().includes(n));
}

const fmts=new Map();
const fmtr=(tz,key,opts)=>{const k=tz+'|'+key; if(!fmts.has(k)) fmts.set(k,new Intl.DateTimeFormat(opts.locale||'en-US',{...opts,locale:undefined,timeZone:tz})); return fmts.get(k);};
// wall-clock fields of instant t in zone tz: {y, mo (0-based), d, h, mi, s}
export function wallParts(t,tz){
  const p={}; for(const x of fmtr(tz,'parts',{hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(t))) p[x.type]=x.value;
  return {y:+p.year,mo:+p.month-1,d:+p.day,h:(+p.hour)%24,mi:+p.minute,s:+p.second};
}
// minutes east of UTC that zone tz is at instant t (DST-aware)
export function offsetMin(t,tz){const p=wallParts(t,tz);return Math.round((Date.UTC(p.y,p.mo,p.d,p.h,p.mi,p.s)-Math.floor(t/1000)*1000)/MIN);}
export function zonedToUtc(a,tz){            // a = [y, month0, d, h, mi, s] as wall-clock time in IANA zone tz
  const base=Date.UTC(...a);
  try{
    let g=base;
    for(let i=0;i<3;i++){
      const p=wallParts(g,tz), diff=base-Date.UTC(p.y,p.mo,p.d,p.h,p.mi,p.s); if(!diff) break; g+=diff;
    }
    return g;
  }catch(e){ return new Date(...a).getTime(); }   // unknown zone name (e.g. Windows names): read as device-local
}
// "2026-11-12T09:00:00" (no Z, no offset) is a floating wall-clock time: read it in tz, or the device zone.
// Anything else goes to Date as before.
const FLOAT=/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?$/;
export function parseWhen(v,tz){
  const m=typeof v==='string'&&v.trim().match(FLOAT); if(!m) return {t:new Date(v).getTime(),floating:false};
  const a=[+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)];
  return {t:validZone(tz)?zonedToUtc(a,tz):new Date(...a).getTime(),floating:true};
}
// Outlook/Exchange calendars name zones the Windows way
export const WIN_ZONES={'Eastern Standard Time':'America/New_York','Pacific Standard Time':'America/Los_Angeles',
  'Central Standard Time':'America/Chicago','Mountain Standard Time':'America/Denver','GMT Standard Time':'Europe/London',
  'W. Europe Standard Time':'Europe/Berlin','Central Europe Standard Time':'Europe/Budapest','Romance Standard Time':'Europe/Paris',
  'AUS Eastern Standard Time':'Australia/Sydney','Tokyo Standard Time':'Asia/Tokyo','India Standard Time':'Asia/Kolkata',
  'China Standard Time':'Asia/Shanghai','Singapore Standard Time':'Asia/Singapore'};
export const winZone=z=>z&&Object.hasOwn(WIN_ZONES,z)?WIN_ZONES[z]:z;

const pad=n=>String(n).padStart(2,'0');
export const dayKey=(t,tz)=>{const p=wallParts(t,tz);return p.y+'-'+pad(p.mo+1)+'-'+pad(p.d);};
export const hhmm=(t,tz)=>{const p=wallParts(t,tz);return pad(p.h)+':'+pad(p.mi);};
export const dayStart=(key,tz)=>{const [y,m,d]=key.split('-').map(Number);return zonedToUtc([y,m-1,d,0,0,0],tz);};
export const nextDayKey=key=>{const [y,m,d]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10);};
// start of the wall-clock hour containing t (works for half-hour zones and on DST days)
export const floorHour=(t,tz)=>{const p=wallParts(t,tz);return Math.floor(t/1000)*1000-(p.mi*60+p.s)*1000;};
export const fmtTime=(t,tz)=>fmtr(tz,'time',{locale:[],hour:'numeric',minute:'2-digit'}).format(new Date(t));
export const fmtDay=(t,tz)=>fmtr(tz,'day',{locale:[],weekday:'short',month:'short',day:'numeric'}).format(new Date(t));
// a short label for zone tz at instant t: "PST", "UTC", or "UTC+1", "UTC−7", "UTC+5:30" when there's no common abbreviation
export function zoneLabel(tz,t=Date.now()){
  try{ const n=(fmtr(tz,'name',{timeZoneName:'short'}).formatToParts(new Date(t)).find(x=>x.type==='timeZoneName')||{}).value;
    if(/^[A-Z]{2,5}$/.test(n||'')) return n; }catch(e){ return tz; }
  const o=offsetMin(t,tz), a=Math.abs(o);
  return o?'UTC'+(o<0?'−':'+')+Math.floor(a/60)+(a%60?':'+pad(a%60):''):'UTC';
}
export const zoneCity=tz=>String(tz).split('/').pop().replace(/_/g,' ');

// A schedule read with floating times remembers the zone it read them in (data.floating). Reading them in
// another zone keeps each session's wall-clock time and moves the instant. Only sessions marked floating at
// parse time move; instants from offsets or Z are kept. Saves from before the marks: every session moves.
export function rezone(data,tz){
  if(!data.floating||!validZone(tz)||!validZone(data.floating)||data.floating===tz) return data;
  const mv=t=>{const p=wallParts(t,data.floating);return zonedToUtc([p.y,p.mo,p.d,p.h,p.mi,p.s],tz);}, all=!data.sessions.some(s=>s.floating);
  data.sessions.forEach(s=>{if(all||s.floating){s.start=mv(s.start);s.end=mv(s.end);}});
  data.floating=tz; return data;
}
// move whole days so the event's first day (in zone tz) is today (in zone tz); wall-clock times are kept across DST
export function shiftToToday(data,tz,now=Date.now()){
  const first=Math.min(...data.sessions.map(s=>s.start));
  const [a,b]=[dayKey(first,tz),dayKey(now,tz)].map(k=>{const [y,m,d]=k.split('-').map(Number);return Date.UTC(y,m-1,d);});
  const n=Math.round((b-a)/DAY); if(!n) return data;
  const mv=t=>{const p=wallParts(t,tz);return zonedToUtc([p.y,p.mo,p.d+n,p.h,p.mi,p.s],tz);};
  data.sessions.forEach(s=>{s.start=mv(s.start);s.end=mv(s.end);}); return data;
}

/* ---------- per-event zone settings, stored as 'tz:<event key>' (the feed link, else the name) ----------
   event:   the event's zone when the schedule doesn't give one (null = this device's zone)
   display: 'event' (default), 'device', or an IANA zone */
export const tzKey=name=>'tz:'+name;
// old: the key used before (the event name), read when nothing is saved under the new one
export function loadZoneSettings(store,name,old){
  const v=store.get(tzKey(name),null)||(old&&old!==name&&store.get(tzKey(old),null))||{};
  return {event:validZone(v.event)?v.event:null, display:v.display==='device'||validZone(v.display)?v.display:'event'};
}
export function saveZoneSettings(store,name,s,old){
  const v={event:validZone(s.event)?s.event:null, display:s.display==='device'||validZone(s.display)?s.display:'event'};
  // defaults are kept explicitly while an old key exists, so they don't fall back to it
  if(!v.event&&v.display==='event'&&(!old||old===name)) store.del(tzKey(name)); else store.set(tzKey(name),v);
  return v;
}
// → {event, display, fromFeed}: the feed's zone wins, then the saved one, then the device's
export function resolveZones(data,s,device=deviceZone()){
  const fromFeed=validZone(data.tz), event=fromFeed?data.tz:(s.event||device);
  return {event, display:s.display==='device'?device:(s.display==='event'?event:s.display), fromFeed};
}
