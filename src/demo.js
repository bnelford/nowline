import { MIN, HOUR } from './schedule.js';

/* ---------- demo data, generated around the current time so the line is always on content ---------- */
export function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function demoData(){
  const r = rng(42);
  const now = Date.now();
  const d0 = new Date(now); d0.setMinutes(0,0,0);
  const start = d0.getTime() - 3*HOUR;     // 3h of history
  const end   = start + 11*HOUR;           // ~8h ahead
  const buildings = {
    main:  {name:'Main Hall',   color:'#7cc4ff', walk:{main:1, annex:7, expo:3, hotel:12}},
    annex: {name:'Annex (across st.)', color:'#b48cff', walk:{main:7, annex:1, expo:6, hotel:9}},
    expo:  {name:'Expo Floor',  color:'#5fd39b', walk:{main:3, annex:6, expo:1, hotel:13}},
    hotel: {name:'Partner Hotel', color:'#ffb066', walk:{main:12, annex:9, expo:13, hotel:1}},
  };
  const venues = [
    {id:'key', name:'Keynote Stage', building:'main', where:'Ground floor, through the center doors'},
    {id:'r201',name:'Room 201',      building:'main', where:'2nd floor east wing: up the escalator, turn left'},
    {id:'r202',name:'Room 202',      building:'main', where:'2nd floor west wing: up the escalator, turn right'},
    {id:'wa',  name:'Workshop A',    building:'annex', where:'1st floor, first door on the left'},
    {id:'wb',  name:'Workshop B',    building:'annex', where:'1st floor, end of the hall'},
    {id:'spon',name:'Sponsor Stage', building:'expo', where:'Back wall of the expo hall'},
    {id:'hall',name:'Hallway Track / Meetups', building:'expo', where:'Expo hall, next to the coffee bar'},
    {id:'ball',name:'Ballroom (evening)', building:'hotel', where:'Lobby level, past the front desk'},
  ];
  // schematic site plan (arbitrary units): 2nd St runs east–west between the Annex and Main Hall
  const site = {w:1320,h:720, streets:[
      {x:0,y:292,w:1320,h:52,label:'2nd St'},
      {x:842,y:0,w:44,h:720,label:'Elm Ave',v:true},
      {x:1002,y:0,w:44,h:720,label:'Oak Ave',v:true}],
    links:[{x1:440,y1:520,x2:478,y2:520,label:'connector'}]};
  buildings.main.map ={x:110,y:380,w:330,h:250,door:{x:290,y:380}};
  buildings.annex.map={x:170,y:100,w:250,h:170,door:{x:290,y:270}};
  buildings.expo.map ={x:478,y:400,w:320,h:230,door:{x:478,y:520}};
  buildings.hotel.map={x:1080,y:370,w:200,h:200,door:{x:1110,y:370}};
  const pos={key:[200,560],r201:[380,445],r202:[180,445],wa:[230,190],wb:[370,190],spon:[730,580],hall:[560,470],ball:[1180,480]};
  venues.forEach(v=>v.map={x:pos[v.id][0],y:pos[v.id][1]});
  const routes = {
    'main>annex':'Leave Main Hall by the north doors and cross 2nd St at the light. The Annex entrance is straight ahead.',
    'annex>main':'Cross 2nd St at the light and enter Main Hall by the north doors.',
    'main>expo':'Take the ground-floor connector at the back of the lobby (or the level-2 skybridge).',
    'expo>main':'Take the connector by the coffee bar into the Main Hall lobby.',
    'annex>expo':'Cross 2nd St at the light, enter Main Hall, and follow the “Expo” signs through the connector.',
    'expo>annex':'Go through the connector into Main Hall, leave by the north doors and cross 2nd St at the light.',
    'main>hotel':'Leave by the north doors and walk 3 blocks east on 2nd St. The hotel is on the right.',
    'annex>hotel':'Walk 2 blocks east on 2nd St. The hotel is on the right.',
    'expo>hotel':'Go through the connector to Main Hall, leave by the north doors, then 3 blocks east on 2nd St.',
    'hotel>main':'Walk 3 blocks west on 2nd St. Main Hall’s north doors are on the left.',
    'hotel>annex':'Walk 2 blocks west on 2nd St. The Annex is on the right.',
    'hotel>expo':'Walk 3 blocks west on 2nd St, enter Main Hall and follow the “Expo” signs.',
  };
  const T = {
    key:['Opening keynote: The agentic decade','Fireside: Shipping agents to production','Keynote: Protocols, not platforms','Closing keynote: What breaks at scale','State of open models'],
    r201:['MCP servers in anger: lessons from 40 integrations','Auth for tools: OAuth flows that agents can survive','Evals that catch regressions before users do','Durable execution for long-running agents','Prompt caching economics','Tool-call latency budgets','Sandboxing code-executing agents'],
    r202:['Workers + Durable Objects as an agent runtime','Vector search at the edge','RAG is dead, long live retrieval','Observability for LLM apps','Rate limits, retries and idempotency','Multi-agent orchestration patterns','Cost controls that finance will sign off on'],
    wa:['Hands-on: build an MCP server in 45 minutes','Hands-on: agent evals with real traces','Hands-on: browser agents without flakiness'],
    wb:['Hands-on: deploy an agent on the edge','Hands-on: structured outputs & schemas','Hands-on: guardrails and policy engines'],
    spon:['Partner demo: AI gateway','Partner demo: secrets for agents','Partner demo: synthetic data','Partner demo: on-device inference','Lightning talks','Partner demo: workflow engines'],
    hall:['Coffee + unconference board','Meetup: indie hackers','Meetup: platform engineers','Office hours: protocol maintainers','Meetup: women in AI infra','Birds of a feather: evals'],
    ball:['Welcome reception','Community awards','After-party'],
  };
  const SPK = ['A. Rivera','J. Okafor','M. Chen','S. Patel','L. Novak','R. Haddad','K. Tanaka','E. Morales','D. Kim','P. Singh','T. Becker','N. Adeyemi'];
  const sessions = []; let id=0;
  for (const v of venues){
    let t = start + (v.building==='hotel' ? 7*HOUR : (r()<.5?0:30*MIN));
    const titles = T[v.id]; let i = Math.floor(r()*titles.length);
    while (t < end){
      let dur = v.id==='key' ? 60*MIN : (v.building==='annex' ? 90*MIN : (v.id==='hall'? 60*MIN : (r()<.5?30:45)*MIN));
      if (v.id==='ball') dur = 90*MIN;
      const s = {id:'d'+(id++), title:titles[i%titles.length], start:t, end:t+dur, venue:v.id,
        track: v.building==='annex'?'Workshop':(v.id==='hall'?'Community':(v.id==='spon'?'Partner':'Talk')),
        speakers: v.id==='hall'?[]:[SPK[Math.floor(r()*SPK.length)]].concat(r()<.3?[SPK[Math.floor(r()*SPK.length)]]:[]),
        desc:'Sample session for the RoomHop demo. Load a real schedule with “Load schedule…”.'};
      sessions.push(s); i++;
      t += dur + (v.id==='key' ? 90*MIN : (r()<.6?15:30)*MIN);
    }
  }
  // a shared lunch break across the main building
  sessions.push({id:'lunch',title:'Lunch',start:start+4*HOUR,end:start+5*HOUR,venue:'hall',track:'Break',speakers:[],desc:'Expo floor.'});
  venues.forEach(v=>v.color=buildings[v.building].color);
  return {name:'Demo: AgentWeek (sample data, generated around right now)', buildings, venues, routes, site, sessions:dedupe(sessions)};
}
export function dedupe(ss){ // drop overlaps inside a lane (demo generator can collide with lunch)
  const by={}; ss.sort((a,b)=>a.start-b.start);
  return ss.filter(s=>{const last=by[s.venue]; if(last && s.start<last.end) return false; by[s.venue]=s; return true});
}
