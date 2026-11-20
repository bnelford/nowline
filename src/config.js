/* roomhop.config.json for self-hosters (pure: no DOM). Optional; see docs/self-host.md.
   { name, logo, colors:{accent,now,bg}, feed, venue, relay, tour, organizerTools }
   Everything is untrusted and checked here: unknown or bad fields are dropped, so {} means the defaults. */
const HEX=/^#[0-9a-f]{3,8}$/i;
const COLORS=['accent','now','bg'];
// absolute https, or same-origin as the page (so a relative "schedule.json" next to index.html works on http://localhost too)
export function safeUrl(s,pageHref){
  if(typeof s!=='string'||!s.trim()||s.length>2048) return null;
  try{
    const page=new URL(pageHref), u=new URL(s.trim(),page);
    if(u.username||u.password) return null;
    return u.protocol==='https:'||u.origin===page.origin&&/^https?:$/.test(u.protocol) ? u.toString() : null;
  }catch(e){return null;}
}
export function sanitizeConfig(raw,pageHref){
  const c={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return c;
  if(typeof raw.name==='string'){ const n=raw.name.replace(/[\u0000-\u001f\u007f]+/g,' ').trim().slice(0,80); if(n) c.name=n; }
  ['logo','feed','venue'].forEach(k=>{ const u=safeUrl(raw[k],pageHref); if(u) c[k]=u; });
  // the relay is a prefix the feed URL is appended to: https only, and it must end in "=" or "/"
  const r=safeUrl(raw.relay,pageHref); if(r&&/^https:/.test(r)&&/[=/]$/.test(r)) c.relay=r;
  if(raw.colors&&typeof raw.colors==='object'){ const col={}; COLORS.forEach(k=>{ if(typeof raw.colors[k]==='string'&&HEX.test(raw.colors[k])) col[k]=raw.colors[k]; }); if(Object.keys(col).length) c.colors=col; }
  if(typeof raw.tour==='boolean') c.tour=raw.tour;
  if(typeof raw.organizerTools==='boolean') c.organizerTools=raw.organizerTools;
  return c;
}
