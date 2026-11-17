/* ---------- QR room signs: links (pure) ---------- */
export const DEFAULT_SIGN_TEXT='Scan me to tell your phone where you are in the conference and for guidance on how to get to your destination';
// The prototype's hardcoded default, which older copies may have saved to localStorage.
// Treated as "not set" so signs point at wherever this copy is actually hosted.
export const LEGACY_SIGN_BASE='https://claude.ai/artifact/H1XXjjEUvK6B4b1W959m6u';
export const roomSlug=v=>'here-'+String(v.id).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const roomLink=(base,v)=>base.replace(/#.*$/,'')+'#'+roomSlug(v);
// default QR target: the page the organizer has open, minus any #fragment
export const defaultSignBase=href=>String(href).replace(/#.*$/,'');
export const signBaseFrom=(saved,href)=>(saved&&saved!==LEGACY_SIGN_BASE)?saved:defaultSignBase(href);
