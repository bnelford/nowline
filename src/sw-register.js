// Registers the offline service worker (../sw.js). Service workers need a secure context, so this
// only runs on https or on localhost during development; plain http on a LAN address is skipped.
const LOCAL = ['localhost', '127.0.0.1', '[::1]'];
if ('serviceWorker' in navigator && (location.protocol === 'https:' || LOCAL.includes(location.hostname))) {
  // relative to this file, so the scope is the app's folder whether it's served at / or /nowline/
  const sw = new URL('../sw.js', import.meta.url);
  const register = () => navigator.serviceWorker.register(sw).catch((e) => console.warn('NowLine: offline mode unavailable:', e));
  if (document.readyState === 'complete') register(); else addEventListener('load', register, { once: true });
}
