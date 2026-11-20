/* ---------- starred sessions, stored per event ---------- */
// Session ids are only unique within one schedule, so stars live under 'stars:<event key>' (the feed link,
// else the name). old: the key used before (the event name), read when nothing is saved under the new one.
export const starsKey=name=>'stars:'+name;
export const loadStars=(store,name,old)=>new Set(store.get(starsKey(name),null)||(old&&old!==name&&store.get(starsKey(old),null))||[]);
