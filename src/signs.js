/* ---------- QR room signs: links (pure) ---------- */
export const DEFAULT_SIGN_TEXT='Scan me to tell your phone where you are in the conference and for guidance on how to get to your destination';
export const roomSlug=v=>'here-'+String(v.id).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// src = the event's feed ({feed, relay, tz}), if it was loaded from a link. The feed (and the relay needed
// to read it) go in the query so a phone that has never loaded this schedule can fetch it. tz is only
// passed when the feed has no zone of its own and the organizer set one, so the scan reads times the same way.
// shareLink is the page link carrying the feed (the "Share" link); roomLink adds the room for a sign.
export function shareLink(base,src){
  base=base.replace(/#.*$/,'');
  if(src&&isHttps(src.feed)){
    try{
      const u=new URL(base); PARAMS.forEach(k=>u.searchParams.delete(k));
      u.searchParams.set('feed',src.feed); if(isHttps(src.relay)) u.searchParams.set('relay',src.relay);
      if(isZone(src.tz)) u.searchParams.set('tz',src.tz);
      if(isHttps(src.venue)) u.searchParams.set('venue',src.venue);
      base=u.toString();
    }catch(e){}
  }
  return base;
}
export const roomLink=(base,v,src)=>shareLink(base,src)+'#'+roomSlug(v);
// What a sign link asks for: {room:'here-…'|null, feed, relay, tz, venue}. Non-https feed/relay/venue values
// are ignored, and relay/tz/venue only count alongside a feed (venue = a venue.json overlay, see docs/importing.md).
export function parseSignLink(href){
  let u; try{u=new URL(href);}catch(e){return {room:null,feed:null,relay:null,tz:null,venue:null};}
  let h=u.hash.slice(1); try{h=decodeURIComponent(h);}catch(e){}
  const feed=u.searchParams.get('feed'), relay=u.searchParams.get('relay'), tz=u.searchParams.get('tz'), venue=u.searchParams.get('venue');
  return {room:h.startsWith('here-')?h:null, feed:isHttps(feed)?feed:null, relay:isHttps(feed)&&isHttps(relay)?relay:null, tz:isHttps(feed)&&isZone(tz)?tz:null,
    venue:isHttps(feed)&&isHttps(venue)?venue:null};
}
// the same link without feed/relay/tz/venue, so a reload doesn't re-import after the attendee loads something else
export function withoutFeed(href){
  try{
    const u=new URL(href); if(!PARAMS.some(k=>u.searchParams.has(k))) return href;
    PARAMS.forEach(k=>u.searchParams.delete(k)); return u.toString();
  }catch(e){return href;}
}
const PARAMS=['feed','relay','tz','venue'];
const isHttps=s=>typeof s==='string'&&/^https:\/\/[^\s]+$/i.test(s);
// IANA-shaped names only ("Europe/Brussels", "UTC", "America/Argentina/Buenos_Aires"); the app also checks Intl knows it
const isZone=s=>typeof s==='string'&&s.length<=64&&/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(s);
// default QR target: the page the organizer has open, minus any #fragment and any feed it was opened with
export const defaultSignBase=href=>withoutFeed(String(href).replace(/#.*$/,''));
export const signBaseFrom=(saved,href)=>saved||defaultSignBase(href);
