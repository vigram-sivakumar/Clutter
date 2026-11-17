// Native/window mechanism only; semantic policy stays in the shared UI/Core.
export function bootstrap(config) {
  const url = new URL(config.url);
  const id = (value) =>
    typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !id(config.bootNonce) ||
    !id(config.windowId) ||
    !id(config.spaceId) ||
    typeof config.token !== 'string' ||
    !config.token ||
    (config.initialPageId != null && !id(config.initialPageId))
  )
    throw Error('INVALID_BOOTSTRAP');
  const publicConfig = {
    url: url.origin,
    token: config.token,
    spaceId: config.spaceId,
    windowId: config.windowId,
    bootNonce: config.bootNonce,
    initialPageId: config.initialPageId ?? null,
    allowDuplicateNoteInTab: config.allowDuplicateNoteInTab ?? false,
  };
  return `(() => {
 const config=globalThis.__clutterNativeWindowConfig??${JSON.stringify(publicConfig)};
 if(location.origin!==${JSON.stringify(url.origin)}||location.pathname!=='/')return;
 Object.defineProperty(globalThis,'__clutterHost',{value:Object.freeze({url:config.url,token:config.token,spaceId:config.spaceId,windowId:config.windowId,initialPageId:config.initialPageId??null,allowDuplicateNoteInTab:config.allowDuplicateNoteInTab??false})});
 const emit=m=>{location.href='clutter-structured53://event/?m='+encodeURIComponent(JSON.stringify({...m,windowId:config.windowId,bootNonce:config.bootNonce}));};
 const pending=new Map();
 Object.defineProperty(globalThis,'__clutterHostReply',{value:m=>{const p=pending.get(m?.requestId);if(!p)return;clearTimeout(p.timer);pending.delete(m.requestId);m.ok?p.resolve(m.value):p.reject(Error('NATIVE_WINDOW_UNAVAILABLE'));}});
 Object.defineProperty(globalThis,'__clutterOpenWindow',{value:request=>{
   if(!request||!['pageId','requestId'].every(k=>typeof request[k]==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(request[k])))return Promise.reject(Error('INVALID_WINDOW_REQUEST'));
   if(pending.has(request.requestId))return pending.get(request.requestId).promise;
   let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});
   const timer=setTimeout(()=>{pending.delete(request.requestId);reject(Error('WINDOW_OUTCOME_UNKNOWN'));},30000);
   pending.set(request.requestId,{promise,resolve,reject,timer});emit({event:'open-window',pageId:request.pageId,requestId:request.requestId});return promise;
 }});
 Object.defineProperty(globalThis,'__clutterHostEvent',{value:m=>{if(['ready','error'].includes(m?.event))emit({event:m.event});}});
 Object.defineProperty(globalThis,'__clutterClose',{value:async guardNonce=>{let safe=false;try{safe=(await globalThis.clutterWindow?.prepareClose())?.safe===true;}catch{}emit({event:'close',guardNonce,safe});}});
 Object.defineProperty(globalThis,'__clutterResume',{value:()=>globalThis.clutterWindow?.resume()});
 })();`;
}
