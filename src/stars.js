/* ---------- starred sessions, stored per event ---------- */
// Session ids are only unique within one schedule, so stars live under 'stars:<event name>'.
// Older versions kept one global 'stars' list that may mix ids from several events. Each boot moves
// only the legacy ids that exist in the loaded event; the rest wait for a later event that has them.
// The global key is dropped once it's empty. Running it again changes nothing.
export const starsKey=name=>'stars:'+name;
export function loadStars(store,name,sessionIds){
  const legacy=store.get('stars',null);
  if(legacy!=null){
    if(!Array.isArray(legacy)) store.del('stars');
    else{
      const ids=new Set(sessionIds||[]), move=legacy.filter(id=>ids.has(id)), keep=legacy.filter(id=>!ids.has(id));
      if(move.length) store.set(starsKey(name),[...new Set(store.get(starsKey(name),[]).concat(move))]);
      keep.length?store.set('stars',keep):store.del('stars');
    }
  }
  return new Set(store.get(starsKey(name),[]));
}
