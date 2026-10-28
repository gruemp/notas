'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const records=new WeakMap();
const html=fs.readFileSync(path.join(__dirname,'../notas.html'),'utf8');
module.exports=function client(storage=new Map(), coarse=false){
  const timers=new Map(),intervals=[];let seq=0;
  const localStorage={get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  const elements=new Map();
  const element=()=>({value:'',open:false,dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},getAttribute(){},addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null,appendChild(){},remove(){},focus(){}});
  const document={getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},addEventListener(){},createElement:element,querySelectorAll:()=>[],querySelector:()=>null,body:element(),head:element(),documentElement:element()};
  const listeners=new Map();
  const window={crypto,matchMedia:()=>({matches:coarse}),addEventListener:(type,f)=>listeners.set(type,f),removeEventListener:type=>listeners.delete(type)};
  const context=vm.createContext({console:{error(){},warn(){}},document,window,crypto,localStorage,navigator:{},URL,URLSearchParams,
    setTimeout:(f,ms)=>{timers.set(++seq,{f,ms});return seq;},clearTimeout:id=>timers.delete(id),setInterval:f=>intervals.push(f),clearInterval(){},prompt:()=>null});
  let js=html.match(/<script>([\s\S]*?)<\/script>/i)[1];
  js=js.replace(/\}\)\(\);\s*$/,`window.test = {
    readPrivateConnection_, mergeStates_, mergeLocalStates_, validateRemote_, readPending_, stagePending_, flushPendingSave_, saveDebounced, saveNow, startAutoSync, importFile, exportJSON, exportTXT,
    norm, currentTerms, makeHighlightedHTML, deleteNote, createNote, ensureGeneralCategory, saveCategoryCollapse_, serializeState, apiSaveAll_,
    sameCloudEndpoint_, endpoint: API_URL, init, flushCloudSave_, flushLocal: flushPendingSave_, refreshLocalState_,
    async flushPendingSave_(){await flushPendingSave_();await flushCloudSave_();},
    readWith(get){readLocalRecord_=get;},
    storage(get,put){readLocalRecord_=get;persistLocalRecord_=put;},
    keys: {pending: PENDING_KEY, get tab(){return stagedPendingKey || TAB_PENDING_KEY;}, cache: CACHE_KEY},
    setState(s){notes=cloneState_(s.notes);categories=cloneState_(s.categories);baseState=cloneState_(s);localBaseState=cloneState_(s);},
    edit(id,text){notes.find(n=>n.id===id).text=text;saveDebounced();},
    getState(){return {notes,categories,baseState,localRevision,confirmedRevision,localSavedRevision,localBaseState};},
    api(get,save){apiGetState_=get;apiSaveAll_=save;},
    ui(){renderAll=()=>{};renderCategoryFilter=()=>{};renderCatManager=()=>{};toast=()=>{};},
    onToast(f){toast=f;toastWithAction=(m,a,f)=>window.undo=f;},
    onDownload(f){downloadFile=f;},
    adopt(key,raw){adoptedPending.set(key,raw);}
  }; })();`);
  vm.runInContext(js,context);
  const api=window.test;api.ui();
  if(!records.has(storage))records.set(storage,{record:null,queue:Promise.resolve()});
  const shared=records.get(storage),copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
  api.storage(async()=>copy(shared.record),(before,local,initialCloudBase,acknowledged)=>{
    const operation=shared.queue.then(()=>{
      const record={state:copy(api.mergeLocalStates_(before,local,shared.record?.state||before)),cloudBase:copy(acknowledged||(api.sameCloudEndpoint_(shared.record)?shared.record?.cloudBase:null)||initialCloudBase),cloudEndpoint:api.endpoint,version:(shared.record?.version||0)+1};
      shared.record=record;return copy(record);
    });
    shared.queue=operation.catch(()=>{});return operation;
  });
  return {api,storage,localStorage,timers,intervals,elements,context,window,listeners,record:()=>shared.record};
};
