/* ============================================================
   NowLine — the UI. No build step, no backend. Pure logic lives in
   sibling modules (schedule.js, ics.js, agenda.js, signs.js, stars.js);
   see schedule.js for the normalized data shape.
   ============================================================ */
import { MIN, HOUR, normalize, rebaseToToday } from './schedule.js';
import { parseICS, scheduleFromICS } from './ics.js';
import { walkBetween as walkBetweenIn, agendaIssues as agendaIssuesIn } from './agenda.js';
import { DEFAULT_SIGN_TEXT, roomSlug, roomLink, shareLink, defaultSignBase, signBaseFrom, parseSignLink, withoutFeed } from './signs.js';
import { starsKey, loadStars } from './stars.js';
import { demoData } from './demo.js';
import { deviceZone, validZone, zoneList, searchZones, zonedToUtc, dayKey as dayKeyIn, hhmm as hhmmIn, dayStart, nextDayKey, floorHour,
  wallParts, sameZone, fmtTime, fmtDay, zoneLabel, zoneCity, rezone, loadZoneSettings, saveZoneSettings, resolveZones } from './tz.js';
import { SAMPLE_SIMPLE } from './samples.js';

const store = {
  get(k,d){try{const v=localStorage.getItem('nowline:'+k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem('nowline:'+k,JSON.stringify(v))}catch(e){}},
  del(k){try{localStorage.removeItem('nowline:'+k)}catch(e){}}
};
// Kokoro-82M voiceover clips, one per TOUR step (see THIRD_PARTY.md); missing clips fall back to speechSynthesis
// Public feed relay used when the Relay URL field is empty ('' = none; see docs/relay.md)
const DEFAULT_RELAY='https://nowline-relay.nelfordbc.workers.dev/?url=';
const TOUR_AUDIO=Array.from({length:13},(_,i)=>`assets/tour/${String(i+1).padStart(2,'0')}.mp3`);

/* ---------- state ---------- */
let data;
const S = {
  ppm: store.get('ppm',3),           // pixels per minute
  follow:true, speed:1, anchorReal:Date.now(), anchorVirt:Date.now(),
  here: null, radius: store.get('radius','all'),
  hidden: new Set(store.get('hidden',[])), stars: new Set(), starOnly:false,   // stars load per event in boot()
  blocks: [],
};
// time zones: ZS = this event's saved settings, Z = {event, display, fromFeed}. All times are instants;
// Z.display only decides how they're shown and how typed-in times (blocks) are read.
let ZS={event:null,display:'event'}, Z={event:deviceZone(),display:deviceZone(),fromFeed:false};
function loadZones(){
  ZS=loadZoneSettings(store,data.name); Z=resolveZones(data,ZS,deviceZone());
  data=rezone(data,Z.event);   // floating times (no offset in the feed) follow the event's zone
}
// demo data is regenerated around today, so demo blocks are kept per day
const blockKey=()=>'blocks:'+data.name+(data.name.startsWith('Demo')?':'+new Date().toDateString():'');
const saveBlocks=()=>store.set(blockKey(),S.blocks);
const saveStars=()=>store.set(starsKey(data.name),[...S.stars]);

/* ---------- personal agenda: blocks + starred sessions, and walk-time conflicts ---------- */
const walkBetween=(a,b)=>walkBetweenIn(data,a,b);
const agendaIssues=items=>agendaIssuesIn(data,items);
function myAgenda(){
  return S.blocks.map(b=>({kind:'block',id:b.id,title:b.title,start:b.start,end:b.end,venue:b.venue,place:b.place}))
    .concat(data.sessions.filter(s=>S.stars.has(s.id)).map(s=>({kind:'session',id:s.id,title:s.title,start:s.start,end:s.end,venue:s.venue})))
    .sort((a,b)=>a.start-b.start||a.end-b.end);
}
function placeLabel(it){const v=venueById(it.venue);return (it.place?it.place+(v?' · near '+v.name:''):(v?v.name:'No fixed place'));}
function issueText(c){
  return c.type==='overlap'
    ? `“${c.a.title}” overlaps “${c.b.title}” by ${Math.round((c.until-c.at)/MIN)} min`
    : `${c.gap} min between “${c.a.title}” and “${c.b.title}”, but it's a ${c.walk} min walk. You'll be ${c.late} min late.`;
}
const now = ()=> S.anchorVirt + (Date.now()-S.anchorReal)*S.speed;
function setClock(virt,speed){S.anchorReal=Date.now();S.anchorVirt=virt;S.speed=speed;if(S.dayAuto!==false&&data&&multiDay())pickDay(true);renderAll();}

/* ---------- helpers ---------- */
const $=id=>document.getElementById(id);
const fmt=t=>fmtTime(t,Z.display);
// show which zone times are in when it isn't the device's
const zoneNote=t=>sameZone(Z.display,deviceZone())?'':zoneLabel(Z.display,t);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const venueById=id=>data.venues.find(v=>v.id===id);
function walkMin(venueId){
  if(!S.here) return null;
  const from=venueById(S.here), to=venueById(venueId); if(!from||!to) return null;
  const w=(data.buildings[from.building]||{}).walk||{};
  return w[to.building] ?? (from.building===to.building?1:8);
}
function inRange(venueId){
  if(S.radius==='all'||!S.here) return true;
  if(S.radius==='same') return venueById(venueId).building===venueById(S.here).building;
  return walkMin(venueId) <= Number(S.radius);
}
function allDays(){ return [...new Set(data.sessions.map(s=>dayKey(s.start)))].sort(); }
function multiDay(){ return allDays().length>1; }
function daySessions(){
  if(!multiDay()||!S.day) return data.sessions;
  const a=dayStart(S.day,Z.display), b=dayStart(nextDayKey(S.day),Z.display);   // 23 or 25 h on DST days
  return data.sessions.filter(s=>s.start<b&&s.end>a);
}
function visibleVenues(){
  const ds=daySessions(), used=multiDay()?new Set(ds.map(s=>s.venue)):null;
  return data.venues.filter(v=>!S.hidden.has(v.id) && (!used||used.has(v.id)) && (!S.starOnly || ds.some(s=>s.venue===v.id&&S.stars.has(s.id))));
}
function pickDay(auto){
  const days=allDays(), today=dayKey(now());
  if(auto||!S.day||!days.includes(S.day)) S.day=days.includes(today)?today:(days.find(d=>d>today)||days[days.length-1]);
}
function span(){
  const ds=daySessions().length?daySessions():data.sessions;
  const st=Math.min(...ds.map(s=>s.start)), en=Math.max(...ds.map(s=>s.end));
  return {start:floorHour(st,Z.display), end:floorHour(en,Z.display)+HOUR};
}
function relLabel(ms){const m=Math.round(ms/MIN); if(m<60) return m+' min'; return Math.floor(m/60)+'h '+(m%60? (m%60)+'m':'')}
// a time on another day than "now" gets its weekday ("Sat 9:00 AM"), so multi-day schedules read unambiguously
const fmtW=t=>(dayKey(t)!==dayKey(now())?new Intl.DateTimeFormat([],{weekday:'short',timeZone:Z.display}).format(new Date(t))+' ':'')+fmt(t);
const RB='role="button" tabindex="0"';   // keyboard-activatable (Enter/Space, see the keydown handler)
// re-rendering a container drops keyboard focus: put it back on the same item, found by its data key
function keepFocus(el,render){
  const a=document.activeElement, k=a&&a!==el&&el.contains(a)&&['data-id','data-block','data-room','data-maproom','data-venue'].find(x=>a.hasAttribute(x)), v=k&&a.getAttribute(k);
  render();
  if(k&&!el.contains(document.activeElement)){const n=el.querySelector(`[${k}="${CSS.escape(v)}"]`);if(n)n.focus({preventScroll:true});}
}
// an aria-live region: only re-render (and so re-announce) when its text changes. Ticking bits are marked .tk
// (aria-hidden) and updated in place, so a counter going from 12 to 11 min isn't read out every few seconds.
function patchLive(el,h){
  const tp=document.createElement('div'); tp.innerHTML=h;
  const said=n=>{const c=n.cloneNode(true);c.querySelectorAll('.tk').forEach(x=>x.remove());return c.innerHTML;};
  if(said(tp)!==said(el)){keepFocus(el,()=>el.innerHTML=h);return;}
  const a=el.querySelectorAll('.tk'); tp.querySelectorAll('.tk').forEach((n,i)=>{if(a[i]&&!a[i].isEqualNode(n)) a[i].replaceWith(n);});
}
// a block that starts off-screen under the sticky room label keeps its title readable at the visible left edge
function pinTitles(){
  const sl=$('tl').scrollLeft;
  document.querySelectorAll('#inner .s,#inner .b').forEach(el=>{
    const l=parseFloat(el.style.left), w=el.offsetWidth, pin=sl>l&&sl<l+w?Math.min(sl-l,Math.max(0,w-40)):0;
    if(pin) el.style.setProperty('--pin',pin+'px'); else if(el.style.getPropertyValue('--pin')) el.style.removeProperty('--pin');
  });
}

/* ---------- render timeline (structure) ---------- */
let SP, X;  // span + x() mapper
function renderTimeline(){
  SP=span(); const lw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--label'));
  const W=(SP.end-SP.start)/MIN*S.ppm;
  X=t=>(t-SP.start)/MIN*S.ppm;
  const inner=$('inner'); inner.style.width=(lw+W)+'px';
  let h=`<div class="ruler"><div class="corner">${fmtDay(SP.start,Z.display)}</div><div class="ticks" style="width:${W}px">`;
  for(let t=SP.start;t<=SP.end;t+=30*MIN){
    const half=wallParts(t,Z.display).mi!==0;
    h+=`<div class="tick${half?' half':''}" style="left:${X(t)}px"><span>${fmt(t)}</span></div>`;
  }
  h+=`</div></div>`;
  h+=renderMeLane(W);
  const vs=visibleVenues();
  for(const v of vs){
    const far=!inRange(v.id); const w=walkMin(v.id);
    const b=data.buildings[v.building]||{};
    h+=`<div class="lane${far?' far':''}" style="--c:${v.color}"><div class="lab" data-venue="${esc(v.id)}"><b>${esc(v.where&&v.name.includes('('+v.where+')')?v.name.replace('('+v.where+')','').trim():v.name)}</b><small>${esc(b.name||'')}${w!=null&&S.here!==v.id?' · '+w+' min':''}${S.here===v.id?' · you':''}</small></div>`;
    h+=`<div class="track" data-venue="${esc(v.id)}" style="width:${W}px;background-size:${30*S.ppm}px 100%">`;
    for(const s of daySessions().filter(s=>s.venue===v.id && (!S.starOnly||S.stars.has(s.id)))){
      const l=X(s.start), wd=Math.max(X(s.end)-l-3,8);
      h+=`<div class="s${S.stars.has(s.id)?' star':''}" ${RB} data-id="${esc(s.id)}" data-st="${s.start}" data-en="${s.end}" style="left:${l}px;width:${wd}px;--c:${v.color}"><div class="prog"></div><div class="t">${esc(s.title)}</div><div class="m">${fmt(s.start)}–${fmt(s.end)}${s.speakers.length?' · '+esc(s.speakers.join(', ')):''}</div></div>`;
    }
    // your own blocks anchored in/next to this room show as a striped band along the bottom
    for(const b of S.blocks.filter(b=>b.venue===v.id)){
      const l=X(b.start), wd=Math.max(X(b.end)-l-3,8);
      h+=`<div class="pb" ${RB} data-block="${esc(b.id)}" style="left:${l}px;width:${wd}px">👤 ${esc(b.title)}${b.place?' · '+esc(b.place):''}</div>`;
    }
    h+=`</div></div>`;
  }
  if(!vs.length) h+=`<div class="empty" style="padding:20px">No rooms to show. ${S.starOnly?'Star some sessions first, or turn off “★ Mine”.':'Check “Rooms…”.'}</div>`;
  h+=`<div class="pastshade" id="shade" style="left:${lw}px"></div><div class="nowline" id="nowline"><div class="tag" id="nowtag"></div><div class="dot"></div></div>`;
  keepFocus(inner,()=>inner.innerHTML=h);
  tick(true); pinTitles();
}

function renderMeLane(W){
  const items=myAgenda();
  const rows=[]; items.forEach(it=>{let r=rows.findIndex(end=>end<=it.start); if(r<0){r=rows.length;rows.push(0);} rows[r]=it.end; it.row=Math.min(r,2);});
  const n=Math.max(1,Math.min(rows.length,3)), rowH=n===1?50:(n===2?34:28), laneH=n*rowH+14;
  const issues=agendaIssues(items), bad=issues.filter(c=>c.type==='overlap'||c.bad).length;
  let h=`<div class="lane me" style="height:${laneH}px"><div class="lab" id="meLab" ${RB} aria-label="My agenda"><b>★ Me</b><small>${items.length?items.length+' item'+(items.length>1?'s':''):'tap a slot →'}${bad?' · ⚠ '+bad:''}</small></div>`;
  h+=`<div class="track" data-venue="${esc(S.here||'')}" data-me="1" style="width:${W}px;background-size:${30*S.ppm}px 100%">`;
  for(const it of items){
    const l=X(it.start), wd=Math.max(X(it.end)-l-3,8), top=5+it.row*rowH, ht=rowH-4;
    if(it.kind==='block'){
      h+=`<div class="b" ${RB} data-block="${esc(it.id)}" data-st="${it.start}" data-en="${it.end}" style="left:${l}px;width:${wd}px;top:${top}px;height:${ht}px"><div class="prog"></div><div class="t">👤 ${esc(it.title)}</div>${n<3?`<div class="m">${fmt(it.start)}–${fmt(it.end)} · ${esc(placeLabel(it))}</div>`:''}</div>`;
    } else {
      const v=venueById(it.venue);
      h+=`<div class="s" ${RB} data-id="${esc(it.id)}" data-st="${it.start}" data-en="${it.end}" style="left:${l}px;width:${wd}px;top:${top}px;height:${ht}px;bottom:auto;--c:${v.color}"><div class="prog"></div><div class="t" style="-webkit-line-clamp:1">${esc(it.title)}</div>${n<3?`<div class="m">${esc(v.name)}</div>`:''}</div>`;
    }
  }
  for(const c of issues){
    if(c.type==='walk'){
      const l=X(c.a.end), wd=Math.max(X(c.a.end+c.walk*MIN)-l,4);
      h+=`<div class="walk${c.bad?' bad':''}" style="left:${l}px;width:${wd}px" title="${c.walk} min walk"></div>`;
      if(c.bad) h+=`<div class="cf" style="left:${X(c.b.start)}px">⚠ ${c.late}m late</div>`;
    } else {
      h+=`<div class="ovl" style="left:${X(c.at)}px;width:${Math.max(X(c.until)-X(c.at),3)}px"></div><div class="cf" style="left:${X(c.at)}px">⚠ overlap</div>`;
    }
  }
  return h+`</div></div>`;
}

/* ---------- per-second updates (cheap: no re-layout of the grid) ---------- */
let lastStrip=0;
function tick(force){
  const t=now(), lw=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--label'));
  if(S.dayAuto!==false && multiDay() && S.day!==dayKey(t) && allDays().includes(dayKey(t))){ S.day=dayKey(t); renderAll(); return; }
  const x=lw+X(t);
  const nl=$('nowline'); if(!nl) return;
  const inSpan = t>=SP.start && t<=SP.end;
  nl.style.display=inSpan?'block':'none';
  nl.style.left=(x-1)+'px';
  $('nowtag').textContent=fmt(t);
  $('shade').style.width=Math.max(0,Math.min(X(t),X(SP.end)))+'px';
  // session states
  document.querySelectorAll('.s,.b').forEach(el=>{
    const s={start:+el.dataset.st,end:+el.dataset.en};
    const past=t>=s.end, live=t>=s.start&&t<s.end;
    el.classList.toggle('past',past); el.classList.toggle('live',live);
    el.firstElementChild.style.width= live? ((t-s.start)/(s.end-s.start)*100)+'%' : '0';
  });
  // clock
  const c=$('clock'); c.textContent=fmt(t); c.classList.toggle('sim',S.speed!==1||Math.abs(t-Date.now())>MIN);
  const zl=zoneNote(t); $('tzLab').textContent=zl; $('tzLab').title=zl?'Times in '+Z.display:''; $('tzLab').style.display=zl?'':'none';
  // follow: keep now-line ~30% from the left edge of the visible track
  if(S.follow && inSpan){
    const tl=$('tl'); const target=x - lw - (tl.clientWidth-lw)*0.3;
    programmatic=true; tl.scrollLeft=Math.max(0,target); requestAnimationFrame(()=>programmatic=false);
  }
  $('followBtn').classList.toggle('show',!S.follow && inSpan);
  if(force || Date.now()-lastStrip>5000 || (S.speed>1 && Date.now()-lastStrip>400)){renderStrip(); if(VIEW==='map') renderMap(); lastStrip=Date.now();}
}

/* ---------- NOW / NEXT strip ---------- */
function renderStrip(){
  const t=now();
  const vis=new Set(visibleVenues().filter(v=>inRange(v.id)).map(v=>v.id));
  const pool=data.sessions.filter(s=>vis.has(s.venue) && (!S.starOnly||S.stars.has(s.id)));
  const live=pool.filter(s=>s.start<=t&&s.end>t).sort((a,b)=>(walkMin(a.venue)??0)-(walkMin(b.venue)??0));
  // your next starred session, at any distance in time: pinned first, with the walk and a leave-by time
  const yn=myAgenda().find(it=>it.kind==='session'&&it.start>t);
  const next=pool.filter(s=>s.start>t&&s.start-t<=45*MIN&&!(yn&&s.id===yn.id)).sort((a,b)=>a.start-b.start);
  const card=(s,kind)=>{
    const v=venueById(s.venue), w=walkMin(s.venue);
    let k, extra='';
    if(kind==='now'){ k=`<span><b>● Now</b><span class="sr"> until ${fmt(s.end)}</span></span><span class="tk" aria-hidden="true">${relLabel(s.end-t)} left</span>`;
      extra=`<div class="bar tk" aria-hidden="true"><i style="width:${(t-s.start)/(s.end-s.start)*100}%"></i></div>`; }
    else { const inMin=Math.round((s.start-t)/MIN); k=`<span>Next<span class="tk" aria-hidden="true"> · in ${inMin} min</span></span><span>${fmtW(s.start)}</span>`;
      if(w!=null && S.here!==s.venue){ const leave=inMin-w; extra=`<div class="go">${leave<=0?'🏃 Leave now ('+w+' min walk)':w+' min walk · leave by '+fmtW(s.start-w*MIN)}</div>`; } }
    return `<div class="card" ${RB} data-id="${esc(s.id)}" style="--c:${v.color}"><div class="k">${k}</div><div class="t">${S.stars.has(s.id)?'★ ':''}${esc(s.title)}</div><div class="m">${esc(v.name)}${w!=null&&S.here!==s.venue?' · '+w+' min away':''}</div>${extra}</div>`;
  };
  const ycard=s=>{
    const v=venueById(s.venue), w=S.here&&S.here!==s.venue?walkMin(s.venue):null, leaveBy=w!=null?s.start-w*MIN:null, late=leaveBy!=null?Math.ceil((t-leaveBy)/MIN):0;
    const go=w==null?(S.here?'':'Set “I\'m at” for a leave-by time'):late>0?`🏃 You'll be late: ${w} min walk<span class="tk" aria-hidden="true"> (${late} min late)</span>`:
      leaveBy-t<MIN?`🏃 Leave now · ${w} min walk`:`${w} min walk · leave by ${fmtW(leaveBy)}`;
    return `<div class="card yours" ${RB} data-id="${esc(s.id)}"><div class="k"><span>★ Your next${s.start-t<=2*HOUR?`<span class="tk" aria-hidden="true"> · in ${relLabel(s.start-t)}</span>`:''}</span><span>${fmtW(s.start)}</span></div><div class="t">${esc(s.title)}</div><div class="m">${esc(v.name)}${S.here===s.venue?' · you\'re here':''}</div>${go?`<div class="go">${go}</div>`:''}</div>`;
  };
  // your own blocks: now + next 90 min
  const bcard=b=>{
    const isNow=b.start<=t&&b.end>t, w=walkMin(b.venue), inMin=Math.round((b.start-t)/MIN);
    let k=isNow?`<span><b>● Now</b> · yours<span class="sr"> until ${fmt(b.end)}</span></span><span class="tk" aria-hidden="true">${relLabel(b.end-t)} left</span>`:`<span>Yours<span class="tk" aria-hidden="true"> · in ${inMin} min</span></span><span>${fmtW(b.start)}</span>`;
    let extra=isNow?`<div class="bar tk" aria-hidden="true"><i style="width:${(t-b.start)/(b.end-b.start)*100}%"></i></div>`:
      (w!=null&&w>0?`<div class="go">${inMin-w<=0?'🏃 Leave now ('+w+' min walk)':w+' min walk · leave by '+fmtW(b.start-w*MIN)}</div>`:'');
    return `<div class="card mine" ${RB} data-block="${esc(b.id)}"><div class="k">${k}</div><div class="t">👤 ${esc(b.title)}</div><div class="m">${esc(placeLabel(b))}</div>${extra}</div>`;
  };
  const myNow=S.blocks.filter(b=>b.end>t&&b.start-t<=90*MIN).sort((a,b)=>a.start-b.start);
  // upcoming conflicts in the next 4 hours go first: they're the actionable thing
  const warn=agendaIssues(myAgenda()).filter(c=>(c.type==='overlap'||c.bad)&&c.b.start>t-5*MIN&&c.at-t<4*HOUR).map(c=>{
    const ref=c.b.kind==='block'?`data-block="${esc(c.b.id)}"`:`data-id="${esc(c.b.id)}"`;
    return `<div class="card warn" ${RB} ${ref}><div class="k"><span>⚠ ${c.type==='overlap'?'Overlap':'Tight connection'}</span><span>${fmt(c.type==='overlap'?c.at:c.b.start)}</span></div><div class="m" style="color:#ffc7cc">${esc(issueText(c))}</div></div>`;
  });
  let h=warn.join('')+myNow.filter(b=>b.start<=t).map(bcard).join('')+live.map(s=>card(s,'now')).join('')+myNow.filter(b=>b.start>t).map(bcard).join('')+next.map(s=>card(s,'next')).join('');
  // nothing left today but the event goes on: say when the next day starts rather than "ended"
  const nd=!data.sessions.some(s=>s.start<=t&&s.end>t)&&data.sessions.filter(s=>s.start>t).sort((a,b)=>a.start-b.start)[0], days=allDays();
  if(!h) h=`<div class="empty">${nd&&days.length>1&&dayKey(nd.start)!==dayKey(t)?`Day ${days.indexOf(dayKey(nd.start))+1} starts ${fmtW(nd.start)}.`:
    t>SP.end?'Schedule has ended. Use −30m or “Load schedule…” under ⋯ More to try another.':
    t<SP.start?'Starts '+fmtW(SP.start)+'.':'Nothing on right now'+(S.radius!=='all'&&S.here?' within your range':'')+'.'}</div>`;
  if(yn) h=ycard(yn)+h;
  patchLive($('strip'),h);
}

/* ---------- controls ---------- */
function renderControls(){
  $('confName').textContent=data.name;
  const hs=$('hereSel');
  hs.innerHTML=`<option value="">— anywhere —</option>`+data.venues.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
  hs.value=S.here||''; $('radiusSel').value=S.radius;
  $('starBtn').classList.toggle('on',S.starOnly); $('starBtn').setAttribute('aria-pressed',S.starOnly);
  $('liveBtn').classList.toggle('on',S.speed===1 && Math.abs(now()-Date.now())<MIN);
  $('demoBtn').classList.toggle('on',S.speed>1);
  $('backLive').hidden=$('liveBtn').classList.contains('on');   // "Live" lives under More; this pill shows only while time is shifted
  const days=allDays(); $('daySelWrap').style.display=days.length>1?'':'none';
  if(days.length>1){ $('daySel').innerHTML=days.map(d=>`<option value="${d}" ${d===S.day?'selected':''}>${new Date(d+'T12:00').toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'})}${d===dayKey(Date.now())?' · today':''}</option>`).join(''); }
}
$('daySel').onchange=e=>{S.day=e.target.value;S.dayAuto=false;S.follow=true;renderAll();};
function renderAll(){renderControls();renderTimeline();if(VIEW==='map') renderMap();}

let programmatic=false;
const tlEl=$('tl');
tlEl.addEventListener('scroll',pinTitles,{passive:true});
['touchstart','wheel','mousedown','focusin'].forEach(ev=>tlEl.addEventListener(ev,()=>{ if(S.follow){S.follow=false;tick();} },{passive:true}));
$('followBtn').onclick=()=>{S.follow=true;tick();};
$('liveBtn').onclick=()=>{S.follow=true;S.dayAuto=true;pickDay(true);setClock(Date.now(),1);};
$('backLive').onclick=()=>$('liveBtn').click();
$('demoBtn').onclick=()=>{S.follow=true; S.speed>1?setClock(now(),1):setClock(now(),60);};
$('backBtn').onclick=()=>{S.follow=true;setClock(now()-30*MIN,S.speed);};
$('fwdBtn').onclick=()=>{S.follow=true;setClock(now()+30*MIN,S.speed);};
$('hereSel').onchange=e=>{S.here=e.target.value||null;store.set('here:'+data.name,S.here);renderAll();};
$('radiusSel').onchange=e=>{S.radius=e.target.value;store.set('radius',S.radius);if(S.radius!=='all'&&!S.here){openHerePrompt();}renderAll();};
$('starBtn').onclick=()=>{S.starOnly=!S.starOnly;renderAll();};
$('zoomIn').onclick=()=>{S.ppm=Math.min(8,S.ppm+1);store.set('ppm',S.ppm);S.follow=true;renderTimeline();};
$('zoomOut').onclick=()=>{S.ppm=Math.max(1,S.ppm-1);store.set('ppm',S.ppm);S.follow=true;renderTimeline();};
$('lanesBtn').onclick=openLanes;
$('importBtn').onclick=openImport;
$('tzBtn').onclick=openZones; $('tzLab').onclick=openZones;

$('moreBtn').onclick=()=>showDlg($('moreSheet')); $('moreClose').onclick=()=>closeSheet();
$('addBlockBtn').onclick=()=>{const t=Math.ceil(now()/(15*MIN))*15*MIN;openBlock(null,{start:t,venue:S.here});};
document.addEventListener('click',e=>{
  if(e.target.closest('.sheet')) return;
  const bk=e.target.closest('[data-block]'); if(bk){openBlock(bk.dataset.block);return;}
  const s=e.target.closest('[data-id]'); if(s){openSession(s.dataset.id);return;}
  const add=e.target.closest('.addslot'); if(add){openBlock(null,{start:+add.dataset.at,venue:add.dataset.venue||S.here});return;}
  document.querySelectorAll('.addslot').forEach(x=>x.remove());
  // tap on an empty slot in a lane → a "+" for a new block in (or next to) that room at that time; a stray tap only shows the "+"
  if(e.target.classList.contains('track')){
    const r=e.target.getBoundingClientRect(), x=e.clientX-r.left;
    const t=Math.floor((SP.start+x/S.ppm*MIN)/(15*MIN))*15*MIN;
    e.target.insertAdjacentHTML('beforeend',`<button class="addslot" data-at="${t}" data-venue="${esc(e.target.dataset.venue||'')}" style="left:${Math.max(x,$('tl').scrollLeft+50)}px" aria-label="Block time at ${fmt(t)}">+ ${fmt(t)}</button>`);
    setTimeout(()=>document.querySelectorAll(`.addslot[data-at="${t}"]`).forEach(x=>x.remove()),5000);return;
  }
  if(e.target.closest('#meLab')){openAgenda();return;}
  const lab=e.target.closest('.lab[data-venue]'); if(lab){S.here=lab.dataset.venue;store.set('here:'+data.name,S.here);renderAll();}
});

/* ---------- sheets ---------- */
// Sheets are modal dialogs: focus moves in, Tab stays inside, Escape closes, focus returns to the opener.
let opener=null;
const FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
const shownSheet=()=>document.querySelector('.sheet.show');
const KEYS=['id','data-id','data-block','data-room','data-maproom'];
function showDlg(el,keep){
  const cur=shownSheet();
  if(!cur){ const a=document.activeElement, k=a&&KEYS.find(x=>a.hasAttribute(x)), box=a&&a.closest&&a.closest('#strip,#inner,#mapSvg,#mapList');
    opener={el:a,k,v:k&&a.getAttribute(k),box:box&&box.id}; }
  else if(cur!==el){ cur.classList.remove('show'); if(cur.id==='moreSheet') opener={el:$('moreBtn')}; }
  el.classList.add('show'); $('scrim').classList.add('show');
  if(el.id==='sheet'){ const h=el.querySelector('h2'); if(h){h.id='sheetTtl';el.setAttribute('aria-labelledby','sheetTtl');} else el.removeAttribute('aria-labelledby'); }
  const k=keep&&el.querySelector('#'+CSS.escape(keep)); (k||el).focus({preventScroll:true});
}
function openSheet(html){const a=document.activeElement, keep=$('sheet').contains(a)&&a.id;$('sheet').innerHTML='<div class="grab"></div>'+html;showDlg($('sheet'),keep);}
function closeSheet(){
  const was=shownSheet(); document.querySelectorAll('.sheet.show').forEach(x=>x.classList.remove('show')); $('scrim').classList.remove('show');
  const o=opener; opener=null; if(!was||!o) return;
  let el=o.el&&$('moreSheet').contains(o.el)?$('moreBtn'):o.el;
  if(el&&(!el.isConnected||!el.getClientRects().length)&&o.k){   // re-rendered while the sheet was open: find the same item
    const root=(o.box&&$(o.box))||document; el=[...root.querySelectorAll(`[${o.k}="${CSS.escape(o.v)}"]`)].find(n=>n.getClientRects().length);
  }
  if(el&&el.focus&&el!==document.body&&el.isConnected) el.focus({preventScroll:true});
}
$('scrim').onclick=closeSheet;
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ document.querySelectorAll('.addslot').forEach(x=>x.remove()); if(T.on){endTour();return;} if(shownSheet()){e.preventDefault();closeSheet();} return; }
  const d=shownSheet();
  if(e.key==='Tab'&&d&&!T.on){
    const f=[...d.querySelectorAll(FOCUSABLE)].filter(n=>n.getClientRects().length), a=document.activeElement;
    if(!f.length){e.preventDefault();d.focus();return;}
    if(!d.contains(a)){e.preventDefault();f[0].focus();}
    else if(e.shiftKey&&(a===f[0]||a===d)){e.preventDefault();f[f.length-1].focus();}
    else if(!e.shiftKey&&a===f[f.length-1]){e.preventDefault();f[0].focus();}
    return;
  }
  // role=button elements (cards, session blocks, chips, map rooms) activate with Enter and Space like real buttons
  const t=e.target;
  if((e.key==='Enter'||e.key===' ')&&t.getAttribute&&t.getAttribute('role')==='button'&&!/^(BUTTON|A)$/.test(t.tagName)){
    e.preventDefault(); if(t.dataset.room) openRoom(t.dataset.room); else t.click();
  }
});

function openSession(id){
  const s=data.sessions.find(z=>z.id===id); if(!s) return;
  const v=venueById(s.venue), b=data.buildings[v.building]||{}, t=now(), w=walkMin(s.venue);
  const status = t>=s.end?'Ended':(t>=s.start?`Live · ${relLabel(s.end-t)} left`:s.start-t>2*HOUR?'':`Starts in ${relLabel(s.start-t)}`);
  // what else overlaps (the "what am I missing" view)
  const clash=data.sessions.filter(o=>o.id!==s.id&&o.start<s.end&&o.end>s.start).slice(0,8);
  openSheet(`
    <div><span class="pill c" style="--c:${v.color}">${esc(v.name)}</span><span class="pill">${esc(b.name||'')}</span>${s.track?`<span class="pill">${esc(s.track)}</span>`:''}</div>
    <h2>${esc(s.title)}</h2>
    <div class="note">${fmtW(s.start)}–${fmt(s.end)}${status?' · '+status:''}${w!=null&&S.here!==s.venue?` · ${w} min walk from you`:''}</div>
    ${S.stars.has(s.id)?agendaIssues(myAgenda()).filter(c=>(c.type==='overlap'||c.bad)&&(c.a.id===s.id||c.b.id===s.id)).map(c=>`<div class="warnbox">⚠ ${esc(issueText(c))}</div>`).join(''):''}
    ${s.speakers.length?`<p><b>${esc(s.speakers.join(', '))}</b></p>`:''}
    ${s.desc?`<p style="white-space:pre-line">${esc(s.desc.length>900?s.desc.slice(0,900)+'…':s.desc)}</p>`:''}
    ${s.url&&/^https?:\/\//.test(s.url)?`<p><a href="${esc(s.url)}" target="_blank" rel="noopener" style="color:var(--accent)">Open the official session page ↗</a></p>`:''}
    <div class="row">
      <button class="btn ${S.stars.has(s.id)?'on':''}" id="starOne">${S.stars.has(s.id)?'★ In my schedule':'☆ Add to my schedule'}</button>
      <button class="btn" id="goHere">I'm in this room</button>
      <button class="btn" id="closeS">Close</button>
    </div>
    ${clash.length?`<h3>Happening at the same time</h3>`+clash.map(o=>{const ov=venueById(o.venue);return `<div class="card" ${RB} data-jump="${esc(o.id)}" style="--c:${ov.color};width:auto;margin-bottom:6px"><div class="k"><span>${esc(ov.name)}</span><span>${fmtW(o.start)}–${fmt(o.end)}</span></div><div class="t">${esc(o.title)}</div></div>`}).join(''):''}
  `);
  $('starOne').onclick=()=>{S.stars.has(s.id)?S.stars.delete(s.id):S.stars.add(s.id);saveStars();renderAll();openSession(id);};
  $('goHere').onclick=()=>{S.here=s.venue;store.set('here:'+data.name,S.here);closeSheet();renderAll();};
  $('closeS').onclick=closeSheet;
  $('sheet').querySelectorAll('[data-jump]').forEach(el=>el.onclick=()=>openSession(el.dataset.jump));
}

function openLanes(){
  const groups={}; data.venues.forEach(v=>(groups[v.building]=groups[v.building]||[]).push(v));
  openSheet(`<h2>Rooms & venues</h2><div class="note">Tap to hide lanes you don’t care about. Tap a room name in the timeline to set “I'm here”.</div>`+
    Object.entries(groups).map(([b,vs])=>`<h3>${esc((data.buildings[b]||{}).name||b)}</h3><div class="chips">`+
      vs.map(v=>`<div class="chip ${S.hidden.has(v.id)?'off':''}" ${RB} aria-pressed="${!S.hidden.has(v.id)}" data-lane="${esc(v.id)}" style="--c:${v.color}"><i></i>${esc(v.name)}</div>`).join('')+`</div>`).join('')+
    `<div class="row"><button class="btn" id="allOn">Show all</button><button class="btn" id="closeS">Done</button></div>`);
  $('sheet').querySelectorAll('[data-lane]').forEach(el=>el.onclick=()=>{const id=el.dataset.lane;S.hidden.has(id)?S.hidden.delete(id):S.hidden.add(id);el.classList.toggle('off');el.setAttribute('aria-pressed',!S.hidden.has(id));store.set('hidden',[...S.hidden]);renderTimeline();renderStrip();});
  $('allOn').onclick=()=>{S.hidden.clear();store.set('hidden',[]);renderAll();openLanes();};
  $('closeS').onclick=closeSheet;
}
function openHerePrompt(){
  openSheet(`<h2>Where are you?</h2><div class="note">Distance filters need a starting point.</div><div class="chips" style="margin-top:10px">`+
    data.venues.map(v=>`<div class="chip" ${RB} data-here="${esc(v.id)}" style="--c:${v.color}"><i></i>${esc(v.name)}</div>`).join('')+`</div>`);
  $('sheet').querySelectorAll('[data-here]').forEach(el=>el.onclick=()=>{S.here=el.dataset.here;store.set('here:'+data.name,S.here);closeSheet();renderAll();});
}

/* ---------- personal blocks: create / edit ---------- */
const dayKey=t=>dayKeyIn(t,Z.display);
const hhmm=t=>hhmmIn(t,Z.display);
function scheduleDays(extra){
  const set=new Set(); for(let t=SP.start;t<SP.end;t+=HOUR) set.add(dayKey(t));
  [Date.now(),now(),extra].forEach(t=>t&&set.add(dayKey(t)));
  return [...set].sort();
}
function openBlock(id,prefill){
  const existing=id?S.blocks.find(b=>b.id===id):null;
  const b=existing||{title:'',start:prefill.start,end:prefill.start+30*MIN,venue:prefill.venue||'',place:'',notes:''};
  const dur=Math.round((b.end-b.start)/MIN), durs=[15,30,45,60,90,120,180];
  if(!durs.includes(dur)) durs.push(dur), durs.sort((a,b)=>a-b);
  openSheet(`<h2>${existing?'Edit block':'Block time'}</h2>
    <div class="note">A meeting, call or break that's yours. Attach it to a room (or the spot next to it) and NowLine will check your walk to whatever's next.</div>
    <div class="form">
      <label>What<input id="bTitle" placeholder="e.g. Coffee with Acme" value="${esc(b.title)}"></label>
      <div class="two">
        <label>Day<select id="bDay">${scheduleDays(b.start).map(d=>`<option ${d===dayKey(b.start)?'selected':''} value="${d}">${new Date(d+'T12:00').toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'})}</option>`).join('')}</select></label>
        <label>Start<input id="bStart" type="time" step="300" value="${hhmm(b.start)}"></label>
      </div>
      <label>Length<select id="bDur">${durs.map(d=>`<option value="${d}" ${d===dur?'selected':''}>${d<60?d+' min':(d/60)+' h'}</option>`).join('')}</select></label>
      <label>In / near room<select id="bVenue"><option value="">No fixed place</option>${data.venues.map(v=>`<option value="${esc(v.id)}" ${v.id===b.venue?'selected':''}>${esc(v.name)}</option>`).join('')}</select></label>
      <label>Exact spot (optional)<input id="bPlace" placeholder="e.g. coffee bar outside, table 4, lobby" value="${esc(b.place||'')}"></label>
      <label>Notes<textarea id="bNotes" style="min-height:60px">${esc(b.notes||'')}</textarea></label>
    </div>
    <div id="bCheck"></div>
    <div class="row"><button class="btn on" id="bSave">${existing?'Save':'Add block'}</button>${existing?'<button class="btn" id="bDel">Delete</button>':''}<button class="btn" id="closeS">Cancel</button></div>
    <div class="row"><button class="btn" id="bIcs">Import from calendar (.ics)…</button></div>`);
  const read=()=>{
    const [y,mo,d]=$('bDay').value.split('-').map(Number), [hh,mi]=($('bStart').value||'09:00').split(':').map(Number);
    const st=zonedToUtc([y,mo-1,d,hh,mi,0],Z.display);
    return {id:existing?existing.id:'b'+Date.now().toString(36),title:$('bTitle').value.trim()||'Blocked',start:st,end:st+(+$('bDur').value)*MIN,
      venue:$('bVenue').value||null,place:$('bPlace').value.trim(),notes:$('bNotes').value.trim()};
  };
  // live preview of conflicts while editing
  const check=()=>{
    const nb=read(), saved=S.blocks; S.blocks=saved.filter(x=>x.id!==nb.id).concat([nb]);
    const iss=agendaIssues(myAgenda()).filter(c=>(c.type==='overlap'||c.bad)&&(c.a.id===nb.id||c.b.id===nb.id));
    const ok=agendaIssues(myAgenda()).filter(c=>c.type==='walk'&&!c.bad&&(c.a.id===nb.id||c.b.id===nb.id));
    S.blocks=saved;
    $('bCheck').innerHTML=iss.map(c=>`<div class="warnbox">⚠ ${esc(issueText(c))}</div>`).join('')+
      ok.map(c=>`<div class="okbox">✓ ${c.walk} min walk to “${esc(c.b.title)}”, ${c.gap} min to spare.</div>`).join('');
  };
  $('sheet').querySelectorAll('input,select').forEach(el=>el.addEventListener('input',check)); check();
  $('bSave').onclick=()=>{const nb=read();S.blocks=S.blocks.filter(x=>x.id!==nb.id).concat([nb]);saveBlocks();closeSheet();renderAll();};
  if(existing) $('bDel').onclick=()=>{S.blocks=S.blocks.filter(x=>x.id!==existing.id);saveBlocks();closeSheet();renderAll();};
  $('closeS').onclick=closeSheet;
  $('bIcs').onclick=openIcs;
}

function openAgenda(){
  const items=myAgenda(), iss=agendaIssues(items);
  openSheet(`<h2>My agenda</h2><div class="note">Your blocks plus starred sessions, with the walk between each.</div>`+
    (items.length?items.map((it,i)=>{
      const nx=iss.filter(c=>c.a===it);
      return `<div class="card ${it.kind==='block'?'mine':''}" ${RB} ${it.kind==='block'?`data-ag-block="${esc(it.id)}"`:`data-ag-id="${esc(it.id)}"`} style="width:auto;margin-top:8px;${it.kind==='session'?'--c:'+venueById(it.venue).color:''}">
        <div class="k"><span>${fmtW(it.start)}–${fmt(it.end)}</span><span>${it.kind==='block'?'yours':'session'}</span></div>
        <div class="t">${it.kind==='block'?'👤 ':'★ '}${esc(it.title)}</div><div class="m">${esc(placeLabel(it))}</div></div>`+
        nx.map(c=>c.type==='overlap'||c.bad?`<div class="warnbox">⚠ ${esc(issueText(c))}</div>`:`<div class="note" style="padding:4px 10px">↓ ${c.walk} min walk · ${c.gap} min gap</div>`).join('');
    }).join(''):`<div class="empty">Nothing yet. Tap an empty slot in any room, or ☆ a session.</div>`)+
    `<div class="row"><button class="btn on" id="agAdd">+ Block</button><button class="btn" id="bIcs">Import .ics…</button><button class="btn" id="closeS">Close</button></div>`);
  $('sheet').querySelectorAll('[data-ag-block]').forEach(el=>el.onclick=()=>openBlock(el.dataset.agBlock));
  $('sheet').querySelectorAll('[data-ag-id]').forEach(el=>el.onclick=()=>openSession(el.dataset.agId));
  $('agAdd').onclick=()=>openBlock(null,{start:Math.ceil(now()/(15*MIN))*15*MIN,venue:S.here});
  $('bIcs').onclick=openIcs; $('closeS').onclick=closeSheet;
}

/* ---------- calendar import (.ics) into your own blocks ---------- */
function matchVenue(loc){
  if(!loc) return null; const L=loc.toLowerCase();
  const v=data.venues.find(v=>L.includes(v.name.toLowerCase()))||data.venues.find(v=>v.name.toLowerCase().includes(L));
  return v?v.id:null;
}
function openIcs(){
  openSheet(`<h2>Import from your calendar</h2>
    <div class="note">Choose an .ics file (export from Google Calendar, Outlook or Apple Calendar), or paste its text. Only timed events during this schedule's days are imported. If an event's location mentions a room name, it's attached to that room.</div>
    <div class="form"><input type="file" id="icsFile" accept=".ics,text/calendar"><textarea id="icsText" placeholder="BEGIN:VCALENDAR…"></textarea></div>
    <div id="icsPrev" class="note" style="margin-top:6px"></div><div class="err" id="icsErr"></div>
    <div class="row"><button class="btn on" id="icsGo">Import</button><button class="btn" id="closeS">Cancel</button></div>`);
  const days=new Set(scheduleDays());
  const pick=()=>parseICS($('icsText').value).filter(e=>days.has(dayKey(e.start)));
  const prev=()=>{const n=pick();$('icsPrev').textContent=$('icsText').value.trim()?`${n.length} event${n.length===1?'':'s'} on schedule days found.`:'';};
  $('icsFile').onchange=e=>{const f=e.target.files[0]; if(!f) return; f.text().then(t=>{$('icsText').value=t;prev();});};
  $('icsText').oninput=prev;
  $('icsGo').onclick=()=>{
    const evs=pick(); if(!evs.length){$('icsErr').textContent='No timed events on this schedule\'s days.';return;}
    const have=new Set(S.blocks.map(b=>b.uid).filter(Boolean));
    evs.filter(e=>!e.uid||!have.has(e.uid)).forEach((e,i)=>S.blocks.push({id:'i'+Date.now().toString(36)+i,uid:e.uid,title:e.title||'Busy',start:e.start,end:e.end,
      venue:matchVenue(e.loc),place:e.loc&&(!matchVenue(e.loc)||e.loc.toLowerCase()!==venueById(matchVenue(e.loc)).name.toLowerCase())?e.loc:'',notes:e.notes||''}));
    saveBlocks(); closeSheet(); renderAll();
  };
  $('closeS').onclick=closeSheet;
}

/* ---------- time zones: the event's, and which one times are shown in ---------- */
function zonePicker(id,sel,first){
  const all=zoneList();
  const opts=list=>(first?`<option value="">${esc(first)}</option>`:'')+list.map(z=>`<option value="${esc(z)}" ${z===sel?'selected':''}>${esc(z.replace(/_/g,' '))}</option>`).join('');
  return {html:`<input id="${id}Q" placeholder="Search, e.g. Tokyo, New York, Europe/" autocomplete="off"><select id="${id}" size="6">${opts(all)}</select>`,
    wire:()=>{$(id+'Q').oninput=e=>{const v=$(id).value;$(id).innerHTML=opts(searchZones(all,e.target.value));if(v)$(id).value=v;};}};
}
function openZones(){
  const dev=deviceZone(), t=now(), lab=z=>`${esc(zoneCity(z))} · ${esc(zoneLabel(z,t))}`;
  const pick=ZS.display!=='event'&&ZS.display!=='device'?ZS.display:'';
  const ev=zonePicker('tzEv',ZS.event||'',`This device's zone (${zoneCity(dev)})`), dp=zonePicker('tzPick',pick||Z.display);
  openSheet(`<h2>Time zone</h2>
    <h3>Event time zone</h3>
    ${Z.fromFeed?`<div class="note" id="tzEvInfo">From the schedule: <b>${esc(Z.event)}</b> (${esc(zoneLabel(Z.event,t))}).</div>`
      :`<div class="note" id="tzEvInfo">The schedule doesn't say. Using <b>${esc(Z.event)}</b>${ZS.event?'':', this device\'s zone'}. Times in the schedule without an offset are read in this zone.</div><div class="form">${ev.html}</div>`}
    <h3>Show times in</h3>
    <label class="ck"><input type="radio" name="tzd" value="event" ${ZS.display==='event'?'checked':''}> The event's time zone (${lab(Z.event)})</label>
    <label class="ck"><input type="radio" name="tzd" value="device" ${ZS.display==='device'?'checked':''}> My device's time zone (${lab(dev)})</label>
    <label class="ck"><input type="radio" name="tzd" value="pick" ${pick?'checked':''}> A specific time zone</label>
    <div class="form" id="tzPickWrap" style="${pick?'':'display:none'}">${dp.html}</div>
    <div class="note" style="margin-top:8px">“Now”, conflicts and walk times don't depend on this. It only changes how times are shown.</div>
    <div class="err" id="tzErr"></div>
    <div class="row"><button class="btn on" id="tzSave">Save</button><button class="btn" id="closeS">Cancel</button></div>`);
  if(!Z.fromFeed) ev.wire(); dp.wire();
  const mode=()=>($('sheet').querySelector('input[name=tzd]:checked')||{}).value||'event';
  $('sheet').querySelectorAll('input[name=tzd]').forEach(r=>r.onchange=()=>{$('tzPickWrap').style.display=mode()==='pick'?'':'none';});
  $('tzSave').onclick=()=>{
    const m=mode(), z=$('tzPick').value;
    if(m==='pick'&&!validZone(z)){ $('tzErr').textContent='Choose a time zone from the list.'; return; }
    ZS=saveZoneSettings(store,data.name,{event:Z.fromFeed?ZS.event:($('tzEv').value||null),display:m==='pick'?z:m});
    loadZones(); S.dayAuto=true; pickDay(true); S.follow=true; closeSheet(); renderAll();
  };
  $('closeS').onclick=closeSheet;
}

/* ---------- QR room signs + “You're here” guidance ---------- */
const signBase=()=>signBaseFrom(store.get('signBase',null),location.href);
// the feed a sign carries, plus tz= only if the feed has no zone and one was set here: without it a scan
// would read the feed's floating times in the scanning phone's zone
const signSource=()=>data.source&&data.source.feed?{...data.source,tz:!Z.fromFeed&&ZS.event?ZS.event:null}:null;

function directions(fromId,toId,startAt){
  const A=venueById(fromId), B=venueById(toId); if(!B) return '';
  if(A && A.id===B.id) return `<div class="okbox">You're already here.</div>`;
  const w=walkBetween(fromId,toId), steps=[];
  if(A && A.building!==B.building){
    const r=(data.routes||{})[A.building+'>'+B.building];
    steps.push(r?esc(r):`Head to ${esc((data.buildings[B.building]||{}).name||B.building)}.`);
  } else if(A){ steps.push(`Stay in ${esc((data.buildings[A.building]||{}).name||'this building')}.`); }
  steps.push(`<b>${esc(B.name)}</b>: ${esc(B.where||'follow the room signs')}.`);
  let timing='';
  if(startAt && w!=null){
    const t=now(), leaveIn=Math.round((startAt-t)/MIN)-w;
    timing = startAt<=t ? `<div class="warnbox">Already started. Go now (${w} min walk).</div>`
      : leaveIn<=0 ? `<div class="warnbox">🏃 Leave now: ${w} min walk, starts ${fmtW(startAt)}.</div>`
      : `<div class="okbox">${w} min walk · leave by ${fmtW(startAt-w*MIN)}${leaveIn<=120?` (${leaveIn} min from now)`:''}.</div>`;
  } else if(w!=null) timing=`<div class="note">${w} min walk</div>`;
  return timing+`<ol style="margin:8px 0 0;padding-left:20px;color:#c9d0dc">${steps.map(x=>`<li style="margin:4px 0">${x}</li>`).join('')}</ol>`;
}

function openHere(id){
  const v=venueById(id); if(!v) return;
  const b=data.buildings[v.building]||{}, t=now();
  const here=data.sessions.filter(s=>s.venue===id&&s.end>t).sort((a,b)=>a.start-b.start).slice(0,2);
  const mine=myAgenda().filter(x=>x.end>t).sort((a,b)=>a.start-b.start)[0];
  const nextAnywhere=data.sessions.filter(s=>s.start>t).sort((a,b)=>a.start-b.start)[0];
  openSheet(`<div><span class="pill c" style="--c:${v.color}">📍 You're here</span></div>
    <h2>${esc(v.name)}</h2><div class="note">${esc(b.name||'')}${v.where?' · '+esc(v.where):''}</div>
    ${here.length?`<h3>In this room</h3>`+here.map(s=>`<div class="card" ${RB} data-jump="${esc(s.id)}" style="--c:${v.color};width:auto;margin-bottom:6px"><div class="k"><span>${s.start<=t?'<b>● Now</b>':'Next'}</span><span>${fmtW(s.start)}–${fmt(s.end)}</span></div><div class="t">${esc(s.title)}</div></div>`).join(''):''}
    ${mine?`<h3>Your next stop</h3><div class="card ${mine.kind==='block'?'mine':''}" style="width:auto;${mine.kind==='session'?'--c:'+venueById(mine.venue).color:''}"><div class="k"><span>${mine.start<=t?'Now':'At '+fmtW(mine.start)}</span><span>${mine.kind==='block'?'yours':'session'}</span></div><div class="t">${mine.kind==='block'?'👤 ':'★ '}${esc(mine.title)}</div><div class="m">${esc(placeLabel(mine))}</div></div>${mine.venue?directions(id,mine.venue,mine.start):''}`
      :`<div class="note" style="margin-top:10px">Star sessions or add blocks and this screen will route you to the next one.</div>`}
    <h3>Where do you want to go?</h3>
    <div class="chips">${data.venues.filter(x=>x.id!==id).map(x=>`<div class="chip" ${RB} data-to="${esc(x.id)}" style="--c:${x.color}"><i></i>${esc(x.name)}</div>`).join('')}</div>
    <div id="dirOut"></div>
    <div class="row"><button class="btn on" id="nearBtn">What's on near me</button><button class="btn" id="closeS">Close</button></div>`);
  $('sheet').querySelectorAll('[data-to]').forEach(el=>el.onclick=()=>{
    const to=el.dataset.to, nx=data.sessions.filter(s=>s.venue===to&&s.end>now()).sort((a,b)=>a.start-b.start)[0];
    $('dirOut').innerHTML=`<h3>To ${esc(venueById(to).name)}${nx?` · next: ${esc(nx.title)}`:''}</h3>`+directions(id,to,nx&&nx.start>now()?nx.start:null);
    $('dirOut').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  });
  $('sheet').querySelectorAll('[data-jump]').forEach(el=>el.onclick=()=>openSession(el.dataset.jump));
  $('nearBtn').onclick=()=>{S.radius='5';store.set('radius','5');S.follow=true;closeSheet();renderAll();};
  $('closeS').onclick=closeSheet;
}
function handleHash(){
  const h=decodeURIComponent(location.hash.slice(1)); if(!h.startsWith('here-')) return;
  const v=data.venues.find(v=>roomSlug(v)===h); if(!v) return;
  S.here=v.id; store.set('here:'+data.name,S.here); S.follow=true; renderAll(); openHere(v.id);
}
window.addEventListener('hashchange',handleHash);

// a printable sign, drawn to a canvas and shown as an image so a phone can long-press → Save
function wrap(ctx,text,maxW){const out=[];let line='';for(const w of text.split(' ')){const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxW&&line){out.push(line);line=w;}else line=t;}if(line)out.push(line);return out;}
function signImage(v,base,copy){
  const url=roomLink(base,v,signSource()), W=900,H=1200, c=document.createElement('canvas'); c.width=W;c.height=H;
  const x=c.getContext('2d'), b=data.buildings[v.building]||{};
  x.fillStyle='#ffffff';x.fillRect(0,0,W,H);
  x.fillStyle=v.color||'#7cc4ff';x.fillRect(0,0,W,28);
  x.fillStyle='#0e1116';x.font='800 72px -apple-system,Segoe UI,Roboto,sans-serif';
  let y=130; wrap(x,v.name,W-120).slice(0,2).forEach(l=>{x.fillText(l,60,y);y+=82;});
  x.fillStyle='#566074';x.font='500 32px -apple-system,Segoe UI,Roboto,sans-serif';
  x.fillText([b.name,v.where].filter(Boolean).join(' · ').slice(0,60),60,y); y+=40;
  if(typeof qrcode==='function'){
    const q=qrcode(0,'M'); q.addData(url); q.make();
    const n=q.getModuleCount(), size=560, cell=Math.floor(size/n), qx=(W-cell*n)/2, qy=y+30;
    x.fillStyle='#0e1116';
    for(let r=0;r<n;r++)for(let k=0;k<n;k++) if(q.isDark(r,k)) x.fillRect(qx+k*cell,qy+r*cell,cell,cell);
    y=qy+cell*n+70;
  }
  // short copy ("Lost? Scan here") is set large so it reads from across a hallway; longer copy stays small
  x.fillStyle='#0e1116';x.font='800 68px -apple-system,Segoe UI,Roboto,sans-serif';
  let lines=wrap(x,copy,W-140), lh=78;
  if(lines.length>2){ x.font='600 38px -apple-system,Segoe UI,Roboto,sans-serif'; lines=wrap(x,copy,W-140).slice(0,4); lh=50; }
  else y+=32;
  lines.forEach(l=>{x.fillText(l,(W-x.measureText(l).width)/2,y);y+=lh;});
  x.fillStyle='#8a93a6';x.font='500 22px -apple-system,Segoe UI,Roboto,sans-serif';
  const foot='NowLine · '+roomSlug(v); x.fillText(foot,(W-x.measureText(foot).width)/2,H-36);
  return c.toDataURL('image/png');
}
function openSigns(){
  const base=signBase(), copy=store.get('signText',DEFAULT_SIGN_TEXT), src=signSource();
  openSheet(`<h2>Room signs</h2>
    <div class="note">One QR sign per room. Scanning it opens NowLine, sets “I'm here” to that room and shows directions to the person's next stop. Long-press (or right-click) a sign to save it, then print. Set the page link to the public address where attendees can open NowLine.</div>
    ${src?`<div class="okbox" id="sgFeed">The QR links include this schedule's feed (${esc(src.feed)}), so a phone that has never opened NowLine loads it on the first scan.</div>`
      :data.name.startsWith('Demo')?'':`<div class="warnbox" id="sgWarn">⚠ This schedule was loaded from a file or pasted text, so the QR links can't carry it. A phone that hasn't already loaded this schedule will see the demo instead. To make signs work on any phone, load the schedule from its feed link (Load schedule… → From a link), then generate the signs again.</div>`}
    <div class="form">
      <label>Sign text<textarea id="sgText" style="min-height:60px">${esc(copy)}</textarea></label>
      <label>Page link (where the QR points)<input id="sgBase" value="${esc(base)}"></label>
    </div>
    <div class="row"><button class="btn on" id="sgGo">Update signs</button><button class="btn" id="closeS">Close</button></div>
    <div id="sgOut"></div>`);
  const draw=()=>{
    const b=$('sgBase').value.trim()||defaultSignBase(location.href), t=$('sgText').value.trim()||DEFAULT_SIGN_TEXT;
    // only an organizer override is saved, so the default keeps following wherever this copy is hosted
    b===defaultSignBase(location.href)?store.del('signBase'):store.set('signBase',b); store.set('signText',t);
    $('sgOut').innerHTML=data.venues.map(v=>`<h3>${esc(v.name)}</h3><img alt="QR sign for ${esc(v.name)}" src="${signImage(v,b,t)}" style="width:100%;max-width:420px;border-radius:10px;display:block">
      <div class="row" style="margin-top:6px"><button class="btn" data-copy="${esc(roomLink(b,v,src))}">Copy link</button><button class="btn" data-try="${esc(v.id)}">Preview scan</button></div>`).join('');
    $('sgOut').querySelectorAll('[data-copy]').forEach(el=>el.onclick=()=>{
      const done=()=>{el.textContent='Copied';setTimeout(()=>el.textContent='Copy link',1500);};
      try{navigator.clipboard.writeText(el.dataset.copy).then(done,()=>{el.textContent=el.dataset.copy;});}catch(e){el.textContent=el.dataset.copy;}
    });
    $('sgOut').querySelectorAll('[data-try]').forEach(el=>el.onclick=()=>{S.here=el.dataset.try;store.set('here:'+data.name,S.here);renderAll();openHere(el.dataset.try);});
  };
  $('sgGo').onclick=draw; $('closeS').onclick=closeSheet; draw();
}
$('signsBtn').onclick=openSigns;
// A link that opens this schedule on any phone: the same feed/relay/tz a room sign carries, without the room.
function openShare(){
  const src=signSource(), link=src&&shareLink(signBase(),src);
  openSheet(`<h2>Share this schedule</h2>
    ${link?`<div class="note">Anyone who opens this link gets “${esc(data.name)}” loaded from its feed, even on a phone that has never opened NowLine. Post it in the event's chat or put it on a slide.</div>
      <div class="form"><input id="shLink" readonly value="${esc(link)}"></div>
      <div class="row">${navigator.share?'<button class="btn on" id="shGo">Share…</button>':''}<button class="btn${navigator.share?'':' on'}" id="shCopy">Copy link</button><button class="btn" id="closeS">Close</button></div>`
    :`<div class="warnbox" id="shWarn">⚠ ${data.name.startsWith('Demo')?'The demo has no link to share.':'This schedule was loaded from a file or pasted text, so there is no link to share.'} Load a schedule from its feed link (Load schedule… → From a link) to get a link anyone can open.</div>
      <div class="row"><button class="btn" id="closeS">Close</button></div>`}`);
  $('closeS').onclick=closeSheet;
  if(!link) return;
  if($('shGo')) $('shGo').onclick=()=>navigator.share({title:data.name,url:link}).catch(()=>{});
  $('shCopy').onclick=()=>{
    const el=$('shCopy'), done=()=>{el.textContent='Copied';setTimeout(()=>el.textContent='Copy link',1500);};
    try{navigator.clipboard.writeText(link).then(done,()=>$('shLink').select());}catch(e){$('shLink').select();}
  };
}
$('shareBtn').onclick=openShare;

/* ---------- map view ---------- */
let VIEW='timeline';
function setView(v){
  VIEW=v; document.body.classList.toggle('mapmode',v==='map');
  $('vTl').classList.toggle('on',v!=='map'); $('vMap').classList.toggle('on',v==='map'); $('vTl').setAttribute('aria-pressed',v!=='map'); $('vMap').setAttribute('aria-pressed',v==='map');
  if(v==='map'){ renderMap(true); } else { S.follow=true; tick(true); }
}
$('vTl').onclick=()=>setView('timeline'); $('vMap').onclick=()=>setView('map');

// imported schedules have no geometry: lay buildings out in a row, rooms in a grid inside each
function ensureLayout(){
  if(data.site && data.venues.every(v=>v.map)) return;
  const bids=Object.keys(data.buildings); let x=60; const W=Math.max(1,bids.length);
  bids.forEach(b=>{
    const rooms=data.venues.filter(v=>v.building===b), cols=Math.ceil(Math.sqrt(rooms.length||1)), rowsN=Math.ceil((rooms.length||1)/cols);
    const w=Math.max(220,cols*120), h=Math.max(170,rowsN*95+50);
    data.buildings[b].map={x,y:380,w,h,door:{x:x+w/2,y:380}};
    rooms.forEach((v,i)=>v.map={x:x+60+(i%cols)*120,y:440+Math.floor(i/cols)*95});
    x+=w+70;
  });
  data.site={w:x+20,h:420+Object.values(data.buildings).reduce((m,b)=>Math.max(m,b.map.h),0),streets:[{x:0,y:310,w:x+20,h:44,label:'(layout is schematic: add real positions in the event config)'}],links:[]};
  void W;
}
let MV=null; // map viewBox
function fitView(){
  const st=data.site, me=S.here&&venueById(S.here);
  if(me){ const w=Math.min(st.w,620), h=w*boxAspect(); MV={x:me.map.x-w/2,y:me.map.y-h/2,w,h}; }
  else { const h=st.w*boxAspect(); MV={x:0,y:(st.h-h)/2,w:st.w,h}; }
}
function boxAspect(){const b=$('mapBox');return (b.clientHeight||400)/(b.clientWidth||390);}
function sessStatus(v,t){
  const ss=data.sessions.filter(s=>s.venue===v.id&&s.end>t).sort((a,b)=>a.start-b.start);
  const live=ss.find(s=>s.start<=t), next=ss.find(s=>s.start>t);
  return {live,next,soon:!live&&next&&next.start-t<=45*MIN};
}
let mapRoute=null;
function renderMap(refit){
  if(VIEW!=='map') return;
  ensureLayout(); renderMapList(); if(refit||!MV) fitView();
  const st=data.site, t=now(), me=S.here&&venueById(S.here);
  const svg=$('mapSvg'); svg.setAttribute('viewBox',`${MV.x} ${MV.y} ${MV.w} ${MV.h}`);
  const k=MV.w/($('mapBox').clientWidth||390); // keep labels a constant on-screen size at any zoom
  let h=`<rect x="-2000" y="-2000" width="${st.w+4000}" height="${st.h+4000}" fill="#0b0e13"/>`;
  for(const r of st.streets){
    h+=`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#1a1f29"/>`;
    h+=r.v?`<text x="${r.x+r.w/2}" y="${40}" fill="#566074" font-size="${12*k}" text-anchor="middle" transform="rotate(90 ${r.x+r.w/2} 40)">${esc(r.label)}</text>`
          :`<text x="${r.x+14}" y="${r.y+r.h/2+4*k}" fill="#566074" font-size="${12*k}">${esc(r.label)}</text>`;
  }
  for(const l of st.links) h+=`<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#3a4252" stroke-width="${18}"/>`;
  for(const [bid,b] of Object.entries(data.buildings)){
    const m=b.map; if(!m) continue;
    const anyVenue=data.venues.find(v=>v.building===bid), w=anyVenue?walkMin(anyVenue.id):null;
    const far=anyVenue&&!inRange(anyVenue.id);
    h+=`<g opacity="${far?0.7:1}"><rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="14" fill="${b.color}" fill-opacity=".10" stroke="${b.color}" stroke-opacity=".6" stroke-width="${2*k}"/>`;
    h+=`<text x="${m.x+12}" y="${m.y+20*k}" fill="${b.color}" font-size="${13*k}" font-weight="700">${esc(b.name)}</text>`;
    if(w!=null && me && me.building!==bid){
      const bx=m.x+m.w-10, by=m.y+10;
      h+=`<g><rect x="${bx-54*k}" y="${by}" width="${54*k}" height="${20*k}" rx="${10*k}" fill="#0e1116" stroke="${b.color}" stroke-width="${1*k}"/><text x="${bx-27*k}" y="${by+14*k}" fill="#e8ecf3" font-size="${11.5*k}" font-weight="700" text-anchor="middle">🚶 ${w} min</text></g>`;
    }
    if(m.door) h+=`<rect x="${m.door.x-9}" y="${m.door.y-4}" width="18" height="8" rx="3" fill="#8a93a6"/>`;
    h+=`</g>`;
  }
  // route to a chosen room
  if(mapRoute && me && venueById(mapRoute) && mapRoute!==me.id){
    const to=venueById(mapRoute), A=data.buildings[me.building].map, B=data.buildings[to.building].map;
    const pts=[[me.map.x,me.map.y]];
    if(me.building!==to.building){
      const inR=(p,m)=>p.x>=m.x-2&&p.x<=m.x+m.w+2&&p.y>=m.y-2&&p.y<=m.y+m.h+2;
      const link=(st.links||[]).map(l=>({a:{x:l.x1,y:l.y1},b:{x:l.x2,y:l.y2}})).map(l=>inR(l.a,A)&&inR(l.b,B)?l:(inR(l.b,A)&&inR(l.a,B)?{a:l.b,b:l.a}:null)).find(Boolean);
      if(link){ pts.push([link.a.x,link.a.y],[link.b.x,link.b.y]); }
      else { pts.push([A.door.x,A.door.y]); const sr=st.streets[0]; if(sr){const my=sr.y+sr.h/2; pts.push([A.door.x,my],[B.door.x,my]);} pts.push([B.door.x,B.door.y]); }
    }
    pts.push([to.map.x,to.map.y]);
    h+=`<polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#ff4d5e" stroke-width="${4*k}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${10*k} ${8*k}" class="route" opacity=".95"/>`;
  }
  // rooms
  for(const v of data.venues){
    if(!v.map||S.hidden.has(v.id)) continue;
    const sst=sessStatus(v,t), far=!inRange(v.id), isMe=me&&me.id===v.id;
    const col=sst.live?'#ff4d5e':(sst.soon?'#ffc94d':'#566074');
    const x=v.map.x, y=v.map.y;
    const label=v.name, sub=sst.live?('● '+sst.live.title):(sst.next?(fmtW(sst.next.start)+' '+sst.next.title):'Nothing scheduled');
    h+=`<g data-room="${esc(v.id)}" tabindex="0" role="button" aria-label="${esc(label+': '+sub)}" style="cursor:pointer" opacity="${far?0.7:1}">`;
    h+=`<circle class="hit" cx="${x}" cy="${y}" r="${30*k}" fill="transparent"/>`;
    if(sst.live) h+=`<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${col}" stroke-width="${2*k}" class="pulse"/>`;
    h+=`<circle cx="${x}" cy="${y}" r="${8*k}" fill="${col}" stroke="#0e1116" stroke-width="${2*k}"/>`;
    h+=`<text x="${x}" y="${y-14*k}" fill="#e8ecf3" font-size="${12*k}" font-weight="700" text-anchor="middle" paint-order="stroke" stroke="#0b0e13" stroke-width="${4*k}">${esc(label)}</text>`;
    h+=`<text x="${x}" y="${y+22*k}" fill="${sst.live?'#ff9aa4':'#8a93a6'}" font-size="${10*k}" text-anchor="middle" paint-order="stroke" stroke="#0b0e13" stroke-width="${3*k}">${esc(sub.length>24?sub.slice(0,23)+'…':sub)}</text>`;
    h+=`</g>`;
  }
  if(me){
    h+=`<circle cx="${me.map.x}" cy="${me.map.y}" r="9" fill="none" stroke="#7cc4ff" stroke-width="${3*k}" class="pulse"/>`;
    h+=`<circle cx="${me.map.x}" cy="${me.map.y}" r="${11*k}" fill="#7cc4ff" stroke="#fff" stroke-width="${3*k}"/>`;
    h+=`<text x="${me.map.x}" y="${me.map.y+38*k}" fill="#7cc4ff" font-size="${11*k}" font-weight="800" text-anchor="middle" paint-order="stroke" stroke="#0b0e13" stroke-width="${4*k}">YOU</text>`;
  }
  keepFocus(svg,()=>svg.innerHTML=h);
  $('mapHint').innerHTML=me?`📍 You're at <b>${esc(me.name)}</b>. Tap a room for directions.`:`Tap a room and choose “I'm here”, or scan a room sign.`;
}
function renderMapList(){
  const t=now(), me=S.here&&venueById(S.here);
  const rows=data.venues.filter(v=>!S.hidden.has(v.id)&&inRange(v.id)).map(v=>({v,w:walkMin(v.id),...sessStatus(v,t)}))
    .filter(r=>r.live||r.next).sort((a,b)=>(a.w??99)-(b.w??99)||((a.live?0:1)-(b.live?0:1)));
  const row=r=>{
    const s=r.live||r.next, isMe=me&&r.v.id===me.id;
    const stx=r.live?`<span class="st live">● LIVE · ${relLabel(r.live.end-t)} left</span>`:`<span class="st ${r.soon?'soon':''}">${r.soon?'in '+relLabel(r.next.start-t):fmtW(r.next.start)}</span>`;
    return `<div class="mrow" ${RB} data-maproom="${esc(r.v.id)}"><div class="wk" style="color:${r.v.color}">${isMe?'📍':(r.w!=null?r.w:'·')}<small>${isMe?'here':(r.w!=null?'min':'')}</small></div><div class="bd"><b>${esc(s.title)}</b><span>${esc(r.v.name)}</span></div>${stx}</div>`;
  };
  keepFocus($('mapList'),()=>$('mapList').innerHTML=`<h3>${me?(S.radius==='all'?'By walking time from you':'Within your range'):'Live and up next'}</h3>`+(rows.length?rows.map(row).join(''):`<div class="empty">Nothing on${S.radius!=='all'?' within your range':''} right now.</div>`));
  $('mapList').querySelectorAll('[data-maproom]').forEach(el=>el.onclick=()=>openRoom(el.dataset.maproom));
}
function openRoom(id){
  const v=venueById(id), b=data.buildings[v.building]||{}, t=now(), me=S.here&&venueById(S.here);
  const ss=data.sessions.filter(s=>s.venue===id&&s.end>t).sort((a,b)=>a.start-b.start).slice(0,3);
  openSheet(`<div><span class="pill c" style="--c:${v.color}">${esc(b.name||'')}</span></div><h2>${esc(v.name)}</h2>${v.where?`<div class="note">${esc(v.where)}</div>`:''}
    ${ss.length?`<h3>On here</h3>`+ss.map(s=>`<div class="card" ${RB} data-jump="${esc(s.id)}" style="--c:${v.color};width:auto;margin-bottom:6px"><div class="k"><span>${s.start<=t?'<b>● Now</b>':'Next'}</span><span>${fmtW(s.start)}–${fmt(s.end)}</span></div><div class="t">${esc(s.title)}</div></div>`).join(''):`<div class="empty">Nothing else scheduled here.</div>`}
    ${me&&me.id!==id?`<h3>Getting there</h3>`+directions(me.id,id,ss[0]&&ss[0].start>t?ss[0].start:null):''}
    <div class="row">${me&&me.id!==id?'<button class="btn on" id="rRoute">Show route on map</button>':''}${!me||me.id!==id?`<button class="btn ${me?'':'on'}" id="rHere">I'm here</button>`:''}<button class="btn" id="closeS">Close</button></div>`);
  $('sheet').querySelectorAll('[data-jump]').forEach(el=>el.onclick=()=>openSession(el.dataset.jump));
  if($('rRoute')) $('rRoute').onclick=()=>{mapRoute=id;closeSheet();setView('map');fitRoute(me,v);};
  if($('rHere')) $('rHere').onclick=()=>{S.here=id;store.set('here:'+data.name,id);mapRoute=null;closeSheet();renderAll();renderMap(true);};
  $('closeS').onclick=closeSheet;
}
function fitRoute(a,b){
  const x0=Math.min(a.map.x,b.map.x)-160,x1=Math.max(a.map.x,b.map.x)+160,y0=Math.min(a.map.y,b.map.y)-160,y1=Math.max(a.map.y,b.map.y)+160;
  let w=x1-x0,h=y1-y0,ar=boxAspect(); if(h/w>ar) w=h/ar; else h=w*ar;
  MV={x:(x0+x1)/2-w/2,y:(y0+y1)/2-h/2,w,h}; renderMap();
}
// pan / pinch / wheel on the map
(function(){
  const box=$('mapBox'), pts=new Map(); let last=null, moved=0;
  const toUnits=dx=>dx*MV.w/box.clientWidth;
  box.addEventListener('pointerdown',e=>{if(e.target.closest('.mapctl,.maphint'))return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});box.setPointerCapture(e.pointerId);moved=0;last=null;});
  box.addEventListener('pointermove',e=>{
    if(!pts.has(e.pointerId)||!MV) return; const prev=pts.get(e.pointerId); pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===1){const dx=e.clientX-prev.x,dy=e.clientY-prev.y;moved+=Math.abs(dx)+Math.abs(dy);MV.x-=toUnits(dx);MV.y-=toUnits(dy);renderMap();}
    else if(pts.size===2){const [a,b]=[...pts.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(last){zoomAt(last/d,(a.x+b.x)/2,(a.y+b.y)/2);}last=d;moved+=10;}
  });
  const up=e=>{pts.delete(e.pointerId);last=null;};
  box.addEventListener('pointerup',e=>{
    const wasTap=moved<8&&pts.size===1; up(e);
    if(wasTap){const g=document.elementFromPoint(e.clientX,e.clientY);const r=g&&g.closest&&g.closest('[data-room]');if(r) openRoom(r.dataset.room);}
  });
  box.addEventListener('pointercancel',up);
  box.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.deltaY>0?1.15:0.87,e.clientX,e.clientY);},{passive:false});
  function zoomAt(f,cx,cy){
    const r=box.getBoundingClientRect(), px=MV.x+(cx-r.left)/r.width*MV.w, py=MV.y+(cy-r.top)/r.height*MV.h;
    const nw=Math.min(Math.max(MV.w*f,180),data.site.w*1.6), nh=nw*boxAspect();
    MV={x:px-(px-MV.x)*nw/MV.w,y:py-(py-MV.y)*nh/MV.h,w:nw,h:nh}; renderMap();
  }
  $('mzIn').onclick=()=>{const r=box.getBoundingClientRect();zoomAt(0.75,r.left+r.width/2,r.top+r.height/2);};
  $('mzOut').onclick=()=>{const r=box.getBoundingClientRect();zoomAt(1.33,r.left+r.width/2,r.top+r.height/2);};
  $('mzMe').onclick=()=>{mapRoute=null;renderMap(true);};
})();
window.addEventListener('resize',()=>{if(VIEW==='map') renderMap(true);});

/* ---------- guided tour with voiceover ---------- */
const TOUR=[
  {ttl:'The problem', say:"Ever stood in a conference hallway with no idea what's on right now, or where it is?", scene:'mess'},
  {ttl:'The problem', say:"Ever wondered: where am I? Do I have time to get to my session?", scene:'mess2'},
  {ttl:'Meet NowLine', say:"Meet NowLine. Every room is a swim lane, and the red line is right now. It moves with the clock, so the schedule always starts from where you are in time.",
    before:async()=>{closeSheet();S.radius='all';S.here=null;S.follow=true;setClock(Date.now(),1);}, target:()=>$('tl')},
  {ttl:'Time moves', say:"Watch an hour go by. Sessions fill in as they run, and fade once they're over.",
    before:async()=>{S.follow=true;setClock(now(),600);}, after:async()=>{setClock(Date.now(),1);}, target:()=>$('nowline'), pad:30},
  {ttl:'Now & next', say:"Up top: what's live this minute, and what starts in the next forty-five, with a heads-up when you need to leave.", target:()=>$('strip')},
  {ttl:'Where am I?', say:"Lost? Every room has a sign. Scan it with your phone's camera.", scene:'scan'},
  {ttl:"You're here", say:"NowLine now knows you're in Workshop B. It shows what's on in this room, and routes you to your next stop, with a leave-by time.",
    before:async()=>{S.here='wb';store.set('here:'+data.name,'wb');renderAll();openHere('wb');await sleep(450);},
    target:()=>{const el=$('sheet').querySelector('.okbox,.warnbox');if(el)el.scrollIntoView({block:'center'});return el;}, pad:8},
  {ttl:'Step by step', say:"Turn by turn: cross the street, follow the Expo signs, the coffee bar is on your right.",
    target:()=>$('sheet').querySelector('ol'), pad:8},
  {ttl:'Only what\'s close', say:"Only care about what you can actually reach? Filter to rooms within a five minute walk. Everything else fades back.",
    before:async()=>{closeSheet();S.radius='5';S.follow=true;renderAll();await sleep(350);}, target:()=>$('tl')},
  {ttl:'On the map', say:"Prefer a map? See where you are, which talks are live around you, how many minutes' walk each one is, and the route there.", view:'map',
    before:async()=>{S.radius='all';S.here='wb';mapRoute='hall';setView('map');const a=venueById('wb'),b=venueById('hall');if(a&&b)fitRoute(a,b);await sleep(300);},
    target:()=>$('mapBox'), pad:0},
  {ttl:'Will I make it?', say:"Add your own meetings to the Me lane. NowLine checks the walk between everything, and warns you before you're late.",
    before:async()=>{S.radius='all';S.follow=true;renderAll();const w=document.querySelector('.cf');if(w){S.follow=false;const tl=$('tl');tl.scrollLeft=Math.max(0,104+w.offsetLeft-tl.clientWidth*0.6);}await sleep(400);},
    target:()=>document.querySelector('.lane.me'), pad:4},
  {ttl:'The warning', say:"Three minutes between your client coffee and the workshop, but it's a six minute walk. Now you know, before it happens.",
    before:async()=>{$('strip').scrollLeft=0;}, target:()=>document.querySelector('.card.warn')||$('strip')},
  {ttl:'NowLine', say:"NowLine. Know what's on, where you are, and whether you'll make it. Open source, and coming to a conference near you.", scene:'end'},
];
const T={on:false,i:0,token:0,muted:store.get('tourMuted',false),voice:null,timer:null,raf:null};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function pickVoice(){
  try{const vs=speechSynthesis.getVoices().filter(v=>/^en(-|_|$)/i.test(v.lang));
    const pref=['Samantha','Ava','Google US English','Microsoft Aria','Microsoft Jenny','Karen','Daniel','Google UK English Female'];
    T.voice=pref.map(n=>vs.find(v=>v.name.includes(n))).find(Boolean)||vs.find(v=>/en-US/i.test(v.lang))||vs[0]||null;}catch(e){}
}
try{pickVoice();speechSynthesis.onvoiceschanged=pickVoice;}catch(e){}
function playClip(i){
  return new Promise(res=>{
    const est=Math.max(2600,TOUR[i].say.split(/\s+/).length*390+600);
    let done=false; const fin=()=>{if(done)return;done=true;clearTimeout(T.timer);res(true);};
    try{
      if(!T.audio) T.audio=new Audio();
      const a=T.audio; a.onended=fin; a.onerror=()=>{done=true;clearTimeout(T.timer);res(false);};
      a.src=TOUR_AUDIO[i]; T.fin=fin;
      T.timer=setTimeout(fin,est*2+3000);
      const pr=a.play(); if(pr&&pr.catch) pr.catch(()=>{if(!done){done=true;clearTimeout(T.timer);res(false);}});
    }catch(e){res(false);}
  });
}
async function speakStep(i){
  if(!T.muted && TOUR_AUDIO[i]){ if(await playClip(i)) return; }
  return speak(TOUR[i].say);
}
function speak(text){
  return new Promise(res=>{
    const est=Math.max(2600,text.split(/\s+/).length*390+600);
    let done=false; const fin=()=>{if(done)return;done=true;clearTimeout(T.timer);res();};
    if(T.muted||!('speechSynthesis' in window)){T.timer=setTimeout(fin,est);T.fin=fin;return;}
    try{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text); u.rate=1.02; if(T.voice){u.voice=T.voice;u.lang=T.voice.lang;}
      u.onend=fin; u.onerror=fin; T.fin=fin;
      T.timer=setTimeout(fin,est*2+2000);      // safety net if the browser never fires onend
      speechSynthesis.speak(u);
    }catch(e){T.timer=setTimeout(fin,est);T.fin=fin;}
  });
}
function tourLayer(){
  let spot=$('tSpot'); if(!spot){spot=document.createElement('div');spot.id='tSpot';spot.className='spot none';document.body.appendChild(spot);}
  let cap=$('tCap'); if(!cap){cap=document.createElement('div');cap.id='tCap';cap.className='cap';document.body.appendChild(cap);}
  return {spot,cap};
}
function placeSpot(el,pad){
  const {spot,cap}=tourLayer();
  if(!el){spot.className='spot none';cap.style.top='';cap.style.bottom='calc(18px + env(safe-area-inset-bottom))';return;}
  const r=el.getBoundingClientRect(), p=pad??6, vh=innerHeight;
  const top=Math.max(4,r.top-p), bot=Math.min(vh-4,r.bottom+p);
  spot.className='spot';
  Object.assign(spot.style,{left:Math.max(4,r.left-p)+'px',top:top+'px',width:(Math.min(innerWidth-4,r.right+p)-Math.max(4,r.left-p))+'px',height:(bot-top)+'px'});
  // caption goes wherever there's more room
  if(top>vh-bot){cap.style.bottom='';cap.style.top='calc(12px + env(safe-area-inset-top))';}
  else{cap.style.top='';cap.style.bottom='calc(18px + env(safe-area-inset-bottom))';}
  // if the target fills the screen, keep the caption at the bottom over it
  if(bot-top>vh*0.7){cap.style.top='';cap.style.bottom='calc(18px + env(safe-area-inset-bottom))';}
}
function setScene(kind){
  document.querySelectorAll('.mess,.scan,.tcard').forEach(x=>x.remove());
  if(kind==='mess'||kind==='mess2'){
    const m=document.createElement('div');m.className='mess';
    const titles=data.sessions.map(s=>s.title); let cells='';
    for(let i=0;i<54;i++){const s=titles[(i*7)%titles.length];cells+=`<div><b>${['9:00','9:15','9:30','10:05','10:40','11:10'][i%6]}</b> ${esc(s)} · Rm ${['B2','C104','Annex 3','Hall D','201','Mezz.'][i%6]}</div>`;}
    m.innerHTML=`<div class="pdf">${cells}</div>`+(kind==='mess2'?
      `<div class="q" style="left:6%;top:18%;font-size:52px">Where am I?</div><div class="q" style="right:6%;top:46%;font-size:38px;animation-delay:.5s">⏱ Will I make it?</div><div class="q" style="left:30%;top:66%;font-size:90px;animation-delay:.9s">?</div>`:
      `<div class="q" style="left:8%;top:12%;font-size:84px">?</div><div class="q" style="right:10%;top:34%;font-size:110px;animation-delay:.6s">?</div><div class="q" style="left:40%;top:58%;font-size:70px;animation-delay:1s">?</div>`);
    document.body.appendChild(m);
  } else if(kind==='scan'){
    const v=venueById('wb')||data.venues[0];
    const m=document.createElement('div');m.className='scan';
    m.innerHTML=`<div class="ph"><img alt="" src="${signImage(v,signBase(),store.get('signText',DEFAULT_SIGN_TEXT))}"><div class="ln"></div><div class="ok" id="scanOk">📍 Open NowLine: ${esc(v.name)}</div></div>`;
    document.body.appendChild(m);
    setTimeout(()=>{const ok=$('scanOk');if(ok)ok.style.opacity=1;},2200);
  } else if(kind==='end'){
    const m=document.createElement('div');m.className='tcard';
    m.innerHTML=`<div class="box"><div class="brand" style="font-size:15px">📍</div><h1>Now<span>Line</span></h1><p>Know what's on, where you are, and whether you'll make it.</p><button class="btn on" id="tryIt">Try it yourself</button></div>`;
    document.body.appendChild(m); $('tryIt').onclick=endTour;
  }
}
function renderCap(step){
  const {cap}=tourLayer();
  cap.innerHTML=`<div class="ttl">${esc(step.ttl)}</div><div class="txt">${esc(step.say)}</div>
    <div class="ctl"><div class="dots">${TOUR.map((_,k)=>`<i class="${k<=T.i?'on':''}"></i>`).join('')}</div>
    <div style="display:flex;gap:6px"><button class="btn" id="tMute" aria-label="${T.muted?'Turn voiceover on':'Mute voiceover'}">${T.muted?'🔇':'🔈'}</button><button class="btn" id="tBack" aria-label="Previous step">‹</button><button class="btn" id="tNext">Next ›</button><button class="btn" id="tExit" aria-label="End tour">✕</button></div></div>`;
  $('tMute').onclick=()=>{T.muted=!T.muted;store.set('tourMuted',T.muted);try{speechSynthesis.cancel();if(T.audio)T.audio.pause();}catch(e){}renderCap(step);};
  $('tNext').onclick=()=>jump(T.i+1);
  $('tBack').onclick=()=>jump(Math.max(0,T.i-1));
  $('tExit').onclick=endTour;
}
function jump(i){T.token++;try{speechSynthesis.cancel();}catch(e){}try{if(T.audio)T.audio.pause();}catch(e){}clearTimeout(T.timer);if(T.fin)T.fin();runFrom(i);}
async function runFrom(i){
  const my=++T.token;
  for(T.i=i;T.i<TOUR.length;T.i++){
    const st=TOUR[T.i];
    if(S.speed!==1||Math.abs(now()-Date.now())>MIN) setClock(Date.now(),1);   // every step starts at real time
    if(st.view!=='map' && VIEW==='map'){ mapRoute=null; setView('timeline'); }
    if(st.before) await st.before();
    if(my!==T.token) return;
    setScene(st.scene);
    renderCap(st);
    const follow=()=>{placeSpot(st.target?st.target():null,st.pad);T.raf=setTimeout(follow,300);};
    clearTimeout(T.raf); follow();
    await speakStep(T.i);
    if(my!==T.token) return;
    await sleep(st.scene==='end'?0:500);
    if(st.after) await st.after();
    if(my!==T.token) return;
    if(st.scene==='end') return;   // stay on the end card
  }
}
let tourSaved=null;
function startTour(){
  if(T.on) return;
  T.on=true;
  tourSaved={data,here:S.here,radius:S.radius,hidden:[...S.hidden],starOnly:S.starOnly};
  if(!data.name.startsWith('Demo')) data=demoData();
  S.hidden.clear(); S.starOnly=false;
  boot();                             // reloads the day's demo blocks (incl. the seeded conflict)
  if(!myAgenda().length) seedDemoAgenda();
  pickVoice();
  try{speechSynthesis.cancel();speechSynthesis.resume();}catch(e){}
  runFrom(0);
}
function endTour(){
  T.token++; T.on=false; clearTimeout(T.raf); clearTimeout(T.timer); try{if(T.audio)T.audio.pause();}catch(e){}
  if(VIEW==='map'){mapRoute=null;setView('timeline');}
  try{speechSynthesis.cancel();}catch(e){}
  ['tSpot','tCap'].forEach(id=>{const el=$(id);if(el)el.remove();});
  document.querySelectorAll('.mess,.scan,.tcard').forEach(x=>x.remove());
  closeSheet();
  if(tourSaved){data=tourSaved.data;S.hidden=new Set(tourSaved.hidden);S.starOnly=tourSaved.starOnly;boot();S.here=tourSaved.here;S.radius=tourSaved.radius;renderAll();tourSaved=null;}
}
// first visit: a dismissible banner, not a modal. The tour starts muted (captions carry it); 🔈 turns the voice on.
function tourIntro(){
  const b=$('tourBanner'); b.hidden=false;
  $('tGo').onclick=()=>{b.hidden=true;T.muted=true;startTour();};
  $('tNo').onclick=()=>{b.hidden=true;};
}
$('tourBtn').onclick=()=>{ if(T.on) endTour(); else {closeSheet();startTour();} };
window.addEventListener('hashchange',()=>{ if(location.hash==='#tour'&&!T.on) tourIntro(); });

const parseAny=txt=>{ const t=txt.replace(/^\uFEFF/,'').trim(); return /^BEGIN:VCALENDAR/i.test(t)?scheduleFromICS(t):normalize(JSON.parse(t)); };
async function fetchFeed(u,r){ const res=await fetch(r? r+encodeURIComponent(u) : u); if(!res.ok) throw new Error('HTTP '+res.status); return res.text(); }
function openImport(){
  openSheet(`<h2>Load a schedule</h2>
    <h3>From Sched (used by KubeCon, Open Source Summit and others)</h3>
    <div class="note">On the event's Sched site, <b>log out</b>, tap <b>Mobile App + iCal</b>, and download or copy the calendar for the <i>whole event</i>. Choose that file below, or paste its text. Any whole-event .ics works (Swapcard, Cvent and others export them too).</div>
    <div class="form" style="margin-top:8px"><input type="file" id="impFile" accept=".ics,.json,text/calendar,application/json"></div>
    <h3>From a link</h3>
    <div class="form"><input id="impUrl" placeholder="https://yourevent.sched.com/all.ics" value="${esc(store.get('impUrl',''))}"><input id="impRelay" placeholder="${DEFAULT_RELAY?'Relay URL (optional; empty uses the public NowLine relay)':'Relay URL, e.g. https://relay.example.workers.dev/?url='}" value="${esc(store.get('impRelay',''))}"></div>
    <div class="row" style="margin-top:6px"><button class="btn" id="impFetch">Fetch</button></div>
    <div class="note" style="margin-top:4px">Most schedule sites don't let browsers fetch their feeds directly, so fetching by link goes through a small relay${DEFAULT_RELAY?'':' (a Cloudflare Worker; see docs/relay.md). Without one, download the file and choose it above'}.</div>
    <h3>Or paste</h3>
    <div class="note">A calendar (.ics text), <b>pretalx / frab</b> <code>schedule.json</code>, <b>Sessionize</b> “All data” or “Schedule grid”, or the simple format. Times show in the event’s time zone when the schedule gives one (change it under “Time zone…”).</div>
    <textarea id="imp" placeholder='BEGIN:VCALENDAR… or {…}'></textarea>
    <div class="note" id="impInfo"></div>
    <label class="ck"><input type="checkbox" id="rebase"> Replay it today (moves a past event's dates to today)</label>
    <div class="err" id="impErr"></div>
    <div class="row"><button class="btn on" id="doImp">Load</button><button class="btn" id="fill">Paste an example</button><button class="btn" id="resetDemo">Back to demo</button><button class="btn" id="closeS">Cancel</button></div>`);
  $('fill').onclick=()=>{$('imp').value=SAMPLE_SIMPLE;$('rebase').checked=true;};
  $('closeS').onclick=closeSheet;
  $('resetDemo').onclick=()=>{store.set('data',null);data=demoData();boot();closeSheet();};
  let fetched=null;   // {text, feed, relay} from the last successful Fetch, so the loaded schedule remembers its link
  const preview=()=>{ try{ const d=parseAny($('imp').value); const days=new Set(d.sessions.map(s=>dayKey(s.start))).size;
      $('impInfo').textContent=`Looks good: ${d.sessions.length} sessions in ${d.venues.length} rooms over ${days} day${days>1?'s':''}${d.name?' · '+d.name:''}.`; $('impErr').textContent=''; }
    catch(e){ $('impInfo').textContent=''; if($('imp').value.trim()) $('impErr').textContent="That doesn't look like .ics or schedule JSON ("+e.message+")"; } };
  $('imp').oninput=preview;
  $('impFile').onchange=e=>{const f=e.target.files[0]; if(!f) return; f.text().then(t=>{$('imp').value=t;preview();});};
  $('impFetch').onclick=async()=>{
    const u=$('impUrl').value.trim(), typed=$('impRelay').value.trim(), r=typed||DEFAULT_RELAY; store.set('impUrl',u); store.set('impRelay',typed);
    if(!/^https:\/\//.test(u)){ $('impErr').textContent='Enter an https:// link.'; return; }
    $('impErr').textContent=''; $('impInfo').textContent='Fetching…';
    try{ const text=await fetchFeed(u,r); $('imp').value=text; fetched={text,feed:u,relay:r||null}; preview(); }
    catch(e){ $('impInfo').textContent=''; $('impErr').textContent='Could not fetch it ('+e.message+'). Download the file and choose it above, or set a relay URL.'; }
  };
  $('doImp').onclick=()=>{
    try{
      let d=parseAny($('imp').value);
      if($('rebase').checked){ const ev=resolveZones(d,loadZoneSettings(store,d.name),deviceZone()).event; d=rebaseToToday(rezone(d,ev),ev); }
      if(fetched&&fetched.text===$('imp').value) d.source={feed:fetched.feed,relay:fetched.relay};
      data=d; store.set('data',d); S.hidden.clear(); store.set('hidden',[]); boot(); closeSheet();
    }catch(e){$('impErr').textContent='Could not read that: '+e.message;}
  };
}

/* ---------- boot ---------- */
function boot(){
  loadZones();
  S.here=store.get('here:'+data.name,null); if(S.here&&!venueById(S.here)) S.here=null;
  S.follow=true; S.anchorReal=Date.now(); S.anchorVirt=Date.now(); S.speed=1;
  S.dayAuto=true; pickDay(true);
  S.stars=loadStars(store,data.name);
  S.blocks=store.get(blockKey(),null);
  if(!S.blocks){ S.blocks=[]; if(data.name.startsWith('Demo')) seedDemoAgenda(); }
  renderAll();
}
// first run on the demo: a client meeting on the expo floor that runs too close to a workshop across the street
function seedDemoAgenda(){
  const t=Date.now();
  const ws=data.sessions.filter(s=>(s.venue==='wa'||s.venue==='wb')&&s.start>=t+60*MIN).sort((a,b)=>a.start-b.start)[0];
  const st=ws?ws.start-48*MIN:Math.ceil(t/(15*MIN))*15*MIN+30*MIN;
  S.blocks=[{id:'demo1',title:'Coffee with Acme (client)',start:st,end:st+45*MIN,venue:'hall',place:'Coffee bar',notes:'Demo block. Edit or delete me.'}];
  if(ws){S.stars.add(ws.id);saveStars();}
  saveBlocks();
}
// A room sign for a schedule loaded from a link carries ?feed= (and &relay=). If that schedule isn't the
// one stored here, fetch it, then jump to the room. Replacing a different imported schedule asks first.
async function loadFromSign(sign){
  openSheet(`<h2>Loading the schedule…</h2><div class="note">Fetching the schedule ${sign.room?'for the room sign you scanned':'from the link you opened'}.</div>`);
  try{
    const d=parseAny(await fetchFeed(sign.feed,sign.relay)); d.source={feed:sign.feed,relay:sign.relay};
    if(sign.tz&&validZone(sign.tz)&&!validZone(d.tz)) saveZoneSettings(store,d.name,{...loadZoneSettings(store,d.name),event:sign.tz});
    data=d; store.set('data',d); S.hidden.clear(); store.set('hidden',[]); boot(); closeSheet();
    history.replaceState(null,'',withoutFeed(location.href)); handleHash();
  }catch(e){
    openSheet(`<h2>Couldn't load the schedule</h2><div class="note">This ${sign.room?'room sign':'link'} points to a schedule at ${esc(sign.feed)}, but it couldn't be loaded (${esc(e.message)}). Check your connection and reload the page, or use “Load schedule…”.</div><div class="row"><button class="btn" id="closeS">Close</button></div>`);
    $('closeS').onclick=closeSheet;
  }
}
function signFeed(sign){
  if(data.source&&data.source.feed===sign.feed){ history.replaceState(null,'',withoutFeed(location.href)); handleHash(); return; }
  if(data.name.startsWith('Demo')){ loadFromSign(sign); return; }
  let host=sign.feed; try{host=new URL(sign.feed).hostname;}catch(e){}
  openSheet(`<h2>Load this ${sign.room?"sign's":'shared'} schedule?</h2><div class="note">This ${sign.room?'room sign':'link'} uses a schedule from <b>${esc(host)}</b>. Loading it replaces “${esc(data.name)}” on this device. Your stars and blocks are kept per schedule.</div>
    <div class="row"><button class="btn on" id="sfGo">Load it</button><button class="btn" id="closeS">Keep “${esc(data.name)}”</button></div>`);
  $('sfGo').onclick=()=>loadFromSign(sign);
  $('closeS').onclick=()=>{closeSheet(); history.replaceState(null,'',withoutFeed(location.href)); handleHash();};
}
data = store.get('data',null) || demoData();
if(data.name.startsWith('Demo')) data=demoData();  // always regenerate demo around today
boot();
const sign=parseSignLink(location.href);
if(sign.feed) signFeed(sign); else handleHash();
// a first scan should land on the room, not the tour; it's still offered on the next visit
if(location.hash==='#tour' || (!sign.feed && !location.hash.startsWith('#here-') && !store.get('seenTour',false))){ store.set('seenTour',true); tourIntro(); }
setInterval(()=>tick(), 250);
window.addEventListener('resize',()=>tick());
