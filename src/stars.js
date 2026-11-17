/* ---------- starred sessions, stored per event ---------- */
// Session ids are only unique within one schedule, so stars live under 'stars:<event name>'.
export const starsKey=name=>'stars:'+name;
export const loadStars=(store,name)=>new Set(store.get(starsKey(name),[]));
