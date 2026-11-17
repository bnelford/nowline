/* ---------- starred sessions, stored per event ---------- */
// Session ids are only unique within one schedule, so stars live under 'stars:<event name>'.
// Older versions kept one global 'stars' list; the first boot after upgrading moves it to the
// event that's loaded then (the one those ids came from), and drops the global key.
export const starsKey=name=>'stars:'+name;
export function loadStars(store,name){
  const legacy=store.get('stars',null);
  if(legacy!=null){
    if(store.get(starsKey(name),null)==null && Array.isArray(legacy)) store.set(starsKey(name),legacy);
    store.del('stars');
  }
  return new Set(store.get(starsKey(name),[]));
}
