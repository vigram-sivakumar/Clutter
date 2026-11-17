// Host mechanism only. There is no document/save decision in this bridge.
export function bootstrap(config) {
  const url = new URL(config.url);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    typeof config.bootNonce !== 'string' ||
    !config.bootNonce ||
    typeof config.token !== 'string' ||
    !config.token
  )
    throw Error('INVALID_BOOTSTRAP');
  return `(() => {
 if(location.origin!==${JSON.stringify(url.origin)}||location.pathname!=='/')return;
 Object.defineProperty(globalThis,'__clutterHost',{value:${JSON.stringify({ url: url.origin, token: config.token, spaceId: config.spaceId, windowId: config.windowId })}});
 const emit=m=>{location.href='clutter-structured53://event/?m='+encodeURIComponent(JSON.stringify({...m,bootNonce:${JSON.stringify(config.bootNonce)}}));};
 Object.defineProperty(globalThis,'__clutterHostEvent',{value:m=>{if(['ready','error'].includes(m?.event))emit({event:m.event});}});
 Object.defineProperty(globalThis,'__clutterClose',{value:async guardNonce=>{let safe=false;try{safe=(await globalThis.clutterWindow?.prepareClose())?.safe===true;}catch{}emit({event:'close',guardNonce,safe});}});
 })();`;
}
