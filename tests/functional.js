'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const makeBackend=require('./backend-harness');
const makeClient=require('./client-harness');
const copy=x=>JSON.parse(JSON.stringify(x));
const cat={id:'general',name:'General',color:'#4F46E5',order:-100000,collapsed:true,collapsedPinned:true};
const note=(id,text='original')=>({id,text,createdAt:1700000000000,updatedAt:1700000000000,pinned:false,order:0,categoryId:'general'});
const state=()=>({categories:[copy(cat)],notes:[note('a'),note('b')],revision:'r1'});
function seed(b,s=state()){const r=b.get();assert.equal(b.post({...s,baseRevision:r.revision}).ok,true);return b.get();}

test('backend: revision rejects stale/legacy writes without losing committed notes',()=>{
  const b=makeBackend(),base=seed(b),a=copy(base),other=copy(base);
  a.notes[0].text='tab A';assert.equal(b.post({...a,baseRevision:base.revision}).ok,true);
  other.notes[1].text='tab B';assert.equal(b.post({...other,baseRevision:base.revision}).ok,false);
  assert.equal(b.post(other).ok,false);assert.equal(b.get().notes[0].text,'tab A');
});
test('backend: write failure restores BOTH tables, and interrupted writes recover before reads',()=>{
  const b=makeBackend(),base=seed(b),change=copy(base);change.categories[0].name='Changed';change.notes[0].text='Changed';
  b.failOnce((name,r)=>name==='Notes'&&r===2);
  assert.equal(b.post({...change,baseRevision:base.revision}).ok,false);
  assert.equal(b.get().revision,base.revision);
  b.context.prepareRecovery_(base);b.context.saveAll_(change); // simulate terminated execution before commit marker
  assert.equal(b.get().revision,base.revision);
});
test('backend: literal formulas/apostrophes, multiline dates, growth and deletion round-trip',()=>{
  const b=makeBackend(),base=seed(b),s=copy(base);
  s.notes=Array.from({length:25},(_,i)=>note('n'+i,i===0?'=SUM(1,2)':i===1?"'literal":'párrafo\n\nsegundo'));
  assert.equal(b.post({...s,baseRevision:base.revision}).ok,true);
  const got=b.get();assert.equal(got.notes.length,25);assert.equal(got.notes[0].text,'=SUM(1,2)');assert.equal(got.notes[1].text,"'literal");
  assert.equal(got.notes[2].createdAt,1700000000000);
  assert.equal(b.post({...got,notes:[],baseRevision:got.revision}).ok,true);assert.equal(b.get().notes.length,0);
});
test('backend: malformed, duplicate IDs, invalid category and oversized text rejected BEFORE writes',()=>{
  const b=makeBackend(),base=seed(b);
  for(const mutate of [s=>delete s.notes,s=>s.notes.push(copy(s.notes[0])),s=>s.notes[0].categoryId='missing',s=>s.notes[0].text='x'.repeat(50000)]){
    const s=copy(base);mutate(s);assert.equal(b.post({...s,baseRevision:base.revision}).ok,false);assert.equal(b.get().revision,base.revision);
  }
});
test('backend: HTML response escapes script terminators and targets Pages origin',()=>{
  const b=makeBackend();const html=b.context.postMessageHtml_({error:'</script><script>bad()</script>'}).data;
  assert.equal((html.match(/<script>/g)||[]).length,1);assert.ok(html.includes('window.top.postMessage'));assert.ok(html.includes('\\u003c/script>'));
});
test('client: merges independent edits/additions and detects edit/delete conflicts',()=>{
  const {api}=makeClient();const base=state(),a=copy(base),b=copy(base);a.notes[0].text='A';b.notes[1].text='B';
  assert.deepEqual(copy(api.mergeStates_(base,a,b).notes).map(n=>n.text),['A','B']);
  b.notes[0].text='B conflict';assert.throws(()=>api.mergeStates_(base,a,b),/Conflicto/);
  b.notes=base.notes.slice(1);assert.throws(()=>api.mergeStates_(base,a,b),/Conflicto/);
  b.notes=copy(base.notes);a.notes.push(note('c'));b.notes.push(note('d'));assert.equal(api.mergeStates_(base,a,b).notes.length,4);
});
test('client: concurrent fields merge, category deletion and ordering survive normalization',()=>{
  const {api}=makeClient();const base=state();base.categories.push({...cat,id:'work',name:'Work'});
  api.validateRemote_(base);const a=copy(base),b=copy(base);a.notes[0].text='A';b.notes[0].pinned=true;
  const merged=api.mergeStates_(base,a,b);assert.equal(merged.notes[0].text,'A');assert.equal(merged.notes[0].pinned,true);
  a.categories.pop();b.categories=b.categories.map(({collapsedNormal,...c})=>c);api.validateRemote_(b);
  assert.equal(api.mergeStates_(base,a,b).categories.length,1);
});
test('client: successful tab A save never removes tab B pending backup',async()=>{
  const store=new Map(),a=makeClient(store),b=makeClient(store);a.api.setState(state());b.api.setState(state());
  a.api.edit('a','A');b.api.edit('b','B');const backup=store.get(b.api.keys.tab);
  a.api.api(async()=>state(),async s=>{s.savedRevision='r2';});await a.api.flushPendingSave_();
  assert.equal(store.get(b.api.keys.tab),backup);assert.equal(store.has(a.api.keys.tab),false);
});
test('client: typing during a slow cloud save is durably saved locally before the cloud responds',async()=>{
  const c=makeClient();c.api.setState(state());let finish,started;const gate=new Promise(r=>finish=r),ready=new Promise(r=>started=r);
  c.api.api(async()=>state(),async s=>{started();await gate;s.savedRevision='r2';});c.api.edit('a','first');
  const saving=c.api.flushPendingSave_();await ready;c.api.edit('a','second');await c.api.flushLocal();
  assert.equal(c.record().state.notes[0].text,'second');finish();await saving;
  assert.equal(c.api.getState().notes[0].text,'second');assert.equal(c.record().state.notes[0].text,'second');
});

test('client: connection failure does not prevent durable local save or full reload',async()=>{
  const c=makeClient();c.api.setState(state());c.api.api(async()=>{throw Error('offline');},()=>assert.fail());c.api.edit('a','offline edit');await c.api.flushPendingSave_();
  assert.equal(c.record().state.notes[0].text,'offline edit');const reloaded=makeClient(c.storage);reloaded.api.api(async()=>{throw Error('offline');},()=>assert.fail());await reloaded.api.init();
  assert.equal(reloaded.api.getState().notes[0].text,'offline edit');assert.equal(c.api.getState().confirmedRevision,0);
});

test('client: stale cloud read cannot replace edits saved locally while GET was pending',async()=>{
  const c=makeClient();c.api.setState(state());let resolve;
  c.api.api(()=>new Promise(r=>resolve=r),async s=>s.savedRevision='r2');const sync=c.api.flushCloudSave_();
  c.api.edit('a','new');await c.api.flushLocal();resolve(state());await sync;
  assert.equal(c.api.getState().notes[0].text,'new');assert.equal(c.record().state.notes[0].text,'new');
});

test('client: malformed remote response cannot erase data',()=>{
  const {api}=makeClient();for(const bad of [null,{}, {notes:[],categories:null},{notes:[null],categories:[]},{notes:[note('a'),note('a')],categories:[]}]) assert.throws(()=>api.validateRemote_(bad));
});
test('client: JSON import is idempotent and normalizes false and invalid dates',async()=>{
  const c=makeClient();c.api.setState(state());const incoming={categories:[cat],notes:[note('c','new')]};incoming.notes[0].pinned='false';incoming.notes[0].createdAt='bad';
  const file={name:'notas.json',text:async()=>JSON.stringify(incoming)};await c.api.importFile(file);await c.api.importFile(file);
  const n=c.api.getState().notes.find(n=>n.id==='c');assert.equal(n.pinned,false);assert.ok(Number.isFinite(n.createdAt));assert.equal(c.api.getState().notes.length,3);
});
test('client: exported TXT preserves category, pin and paragraphs on import',async()=>{
  const c=makeClient();const s=state();s.notes[0].text='uno\n\ndos';s.notes[0].pinned=true;c.api.setState(s);let txt;
  c.api.onDownload((name,text)=>txt=text);c.api.exportTXT();c.api.setState({...state(),notes:[]});await c.api.importFile({name:'notas.txt',text:async()=>txt});
  const got=c.api.getState().notes;assert.equal(got.length,2);assert.equal(got.find(n=>n.pinned).text,'uno\n\ndos');
});
test('client: search ignores accents, case and term order; highlighting escapes markup',()=>{
  const c=makeClient();c.elements.get('search').value='bue te EL';assert.ok(c.api.currentTerms().every(t=>c.api.norm('el retén bueno').includes(t)));
  assert.ok(!c.api.makeHighlightedHTML('<script>alert(1)</script>',[],true).includes('<script>'));
});
test('client: delete and undo restore each note exactly once',()=>{
  const c=makeClient();c.api.setState(state());c.api.onToast(()=>{});c.api.deleteNote('a');assert.equal(c.api.getState().notes.length,1);c.window.undo();c.window.undo();assert.equal(c.api.getState().notes.length,2);
});
test('client: coarse pointer uses the same data/save logic',async()=>{
  const c=makeClient(new Map(),true);c.api.setState(state());c.api.api(async()=>state(),async s=>s.savedRevision='r2');c.api.edit('a','móvil');await c.api.flushPendingSave_();assert.equal(c.api.getState().confirmedRevision,1);
});
test('client: TXT losslessly restores empty notes, whitespace, separator lines and heading-like content',async()=>{
  const c=makeClient(),s=state();s.notes=[note('empty',''),note('spaces','  conservar \n\n---\n\n=== NOTAS ===\nfin  ')];c.api.setState(s);let txt;
  c.api.onDownload((n,t)=>txt=t);c.api.exportTXT();c.api.setState({...state(),notes:[]});await c.api.importFile({name:'notas.txt',text:async()=>txt});
  assert.deepEqual(copy(c.api.getState().notes).map(n=>n.text),s.notes.map(n=>n.text));
});
test('client: acknowledgement removes adopted backup only if its exact contents still match',async()=>{
  const c=makeClient();c.api.setState(state());c.api.adopt('notas_web_pending_state_v1:other','old');c.storage.set('notas_web_pending_state_v1:other','new edit');
  c.api.api(async()=>state(),async s=>s.savedRevision='r2');c.api.edit('a','A');await c.api.flushPendingSave_();assert.equal(c.storage.get('notas_web_pending_state_v1:other'),'new edit');
});
test('client: concurrent conflicting edit preserves both versions with one deterministic recovered ID',async()=>{
  const c=makeClient();c.api.setState(state());const remote=state();remote.notes[0].text='remote';let sent;
  c.api.api(async()=>copy(remote),async s=>{sent=copy(s);s.savedRevision='r2';});c.api.edit('a','local');await c.api.flushPendingSave_();
  assert.ok(sent.notes.some(n=>n.text==='remote'));assert.ok(sent.notes.some(n=>n.text==='local'));assert.equal(c.api.getState().notes.length,3);
  const merged=c.api.mergeLocalStates_(state(),{...state(),notes:[note('a','local'),note('b')]},remote);assert.equal(merged.notes.filter(n=>n.text==='local').length,1);
});

test('client: backend without v5 revision receives no blind write while local edits remain durable',async()=>{
  const c=makeClient();c.api.setState(state());const remote=state();delete remote.revision;let posts=0;
  c.api.api(async()=>copy(remote),async()=>posts++);c.api.edit('a','local');await c.api.flushPendingSave_();assert.equal(posts,0);assert.ok(c.record().state.notes.some(n=>n.text==='local'));
});

test('bridge: only a correlated acknowledgement from a Google origin confirms a save',async()=>{
  const c=makeClient(),s=state();c.context.document.createElement=(tag)=>({name:'',style:{},setAttribute(){},appendChild(){},submit(){},contentWindow:{}});
  const pending=c.api.apiSaveAll_(s);let listener=c.listeners.get('message');assert.ok(listener);
  const payload=JSON.stringify(s); // request ID is private to the submitted form; capture inputs for next test instead.
  listener({origin:'https://evil.example',data:{type:'notas_saveAll',ok:true,requestId:'wrong',revision:'bad'}});
  assert.equal(s.savedRevision,undefined);assert.equal(c.listeners.has('message'),true);
  const timeout=[...c.timers.values()].find(t=>t.ms===12000);timeout.f();await assert.rejects(pending,/sin confirmación/);
});
test('client: conflict created while a cloud write is pending preserves both texts locally',async()=>{
  const c=makeClient();const base=state(),remote=state();remote.notes[1].text='other tab';c.api.setState(base);let finish,started;const ready=new Promise(r=>started=r);
  c.api.api(async()=>copy(remote),async s=>{started();await new Promise(r=>finish=r);s.savedRevision='r2';});c.api.edit('a','A');
  const pending=c.api.flushPendingSave_();await ready;c.api.edit('b','our conflicting edit');await c.api.flushLocal();finish();await pending;
  assert.ok(c.record().state.notes.some(n=>n.text==='other tab'));assert.ok(c.record().state.notes.some(n=>n.text==='our conflicting edit'));
});

test('bridge: Google nested frame acknowledgement confirms the exact submitted request',async()=>{
  const c=makeClient(),s=state(),inputs=[];
  c.context.document.createElement=tag=>{const el={style:{},setAttribute(){},appendChild(){},submit(){},contentWindow:{}};if(tag==='input')inputs.push(el);return el;};
  const pending=c.api.apiSaveAll_(s);const requestId=inputs.find(x=>x.name==='requestId').value;
  const listener=c.listeners.get('message');listener({origin:'https://script.googleusercontent.com',source:{},data:{type:'notas_saveAll',ok:true,requestId,revision:'r2'}});
  await pending;assert.equal(s.savedRevision,'r2');assert.equal(c.listeners.has('message'),false);
});
test('backend: reordered headers are rejected without relabelling existing data',()=>{
  const b=makeBackend();seed(b);const sh=b.sheets.get('Notes');
  const headers=sh.getRange(1,1,1,7).getValues()[0];[headers[0],headers[1]]=[headers[1],headers[0]];sh.getRange(1,1,1,7).setValues([headers]);
  const before=JSON.stringify(sh.data),got=b.get();assert.equal(got.ok,false);assert.equal(JSON.stringify(sh.data),before);
});
test('client: successive local snapshots use immutable keys so acknowledgements cannot erase a newer version',()=>{
  const c=makeClient();c.api.setState(state());c.api.edit('a','first');const old=c.api.keys.tab;
  c.api.edit('a','second');assert.notEqual(c.api.keys.tab,old);assert.equal(c.storage.has(old),false);assert.equal(JSON.parse(c.storage.get(c.api.keys.tab)).state.notes[0].text,'second');
});
test('client: old mutable journals use version receipts and a newer value remains recoverable',async()=>{
  const c=makeClient(),key='notas_web_pending_state_v1:legacy';const old=JSON.stringify({state:state(),base:state()});
  const newer=state();newer.notes[1].text='new pending edit';const latest=JSON.stringify({state:newer,base:state()});
  c.storage.set(key,old);c.api.adopt(key,old);c.api.setState(state());c.api.edit('a','A');
  const write=c.localStorage.setItem;c.localStorage.setItem=(k,v)=>{if(k.startsWith('notas_web_pending_ack_v1:'))c.storage.set(key,latest);write(k,v);};
  c.api.api(async()=>state(),async s=>s.savedRevision='r2');await c.api.flushPendingSave_();
  assert.equal(c.storage.get(key),latest);assert.equal(c.api.readPending_().find(x=>x.key===key).value.state.notes[1].text,'new pending edit');
});
test('client: failed snapshot allocation keeps previous backup and newest edit in memory',()=>{
  const c=makeClient();c.api.setState(state());c.api.edit('a','backed up');const key=c.api.keys.tab,raw=c.storage.get(key);
  c.localStorage.setItem=()=>{throw Error('Quota exceeded');};c.api.edit('a','new edit');assert.equal(c.storage.get(key),raw);assert.equal(c.api.getState().notes[0].text,'new edit');
});
test('client: full initialization restores journals immediately and subsequently merges remote additions',async()=>{
  const a=makeClient(),b=makeClient(a.storage);a.api.setState(state());b.api.setState(state());a.api.edit('a','A');b.api.edit('b','B');
  const c=makeClient(a.storage);const remote=state();remote.notes.push(note('c','remote addition'));c.api.api(async()=>copy(remote),async s=>s.savedRevision='r2');
  await c.api.init();await c.api.flushPendingSave_();assert.equal(c.api.getState().notes.length,3);assert.equal(c.api.getState().notes.find(n=>n.id==='a').text,'A');assert.equal(c.api.getState().notes.find(n=>n.id==='b').text,'B');
  assert.equal(c.api.readPending_().length,0);
});

test('client: conflicting journals recover both variants without requiring configuration',async()=>{
  const a=makeClient(),b=makeClient(a.storage);a.api.setState(state());b.api.setState(state());a.api.edit('a','variant A');b.api.edit('a','variant B');
  const c=makeClient(a.storage);c.api.api(async()=>{throw Error('offline');},()=>assert.fail());await c.api.init();
  assert.ok(c.record().state.notes.some(n=>n.text==='variant A'));assert.ok(c.record().state.notes.some(n=>n.text==='variant B'));
  let exported;c.api.onDownload((n,t)=>exported=JSON.parse(t));c.api.exportJSON();assert.ok(exported.notes.some(n=>n.text==='variant A'));assert.ok(exported.notes.some(n=>n.text==='variant B'));
});

test('backend: known English headers and the legacy missing pinned column migrate without data loss',()=>{
  const b=makeBackend(),base=seed(b),cats=b.sheets.get('Categories');
  cats.getRange(1,1,1,6).setValues([['id','name','color','order','collapsed','']]);cats.getRange(2,6,1,1).clearContent();
  const got=b.get();assert.equal(got.ok,true);assert.equal(got.notes[0].text,base.notes[0].text);assert.equal(cats.getRange(1,6).getValue(),'Fijadas contraídas');
});
test('client: first launch and local saving do not wait for an unresponsive API',async()=>{
  const c=makeClient();c.api.api(()=>new Promise(()=>{}),()=>assert.fail());await c.api.init();
  assert.equal(c.api.getState().categories[0].id,'general');assert.ok(c.record());
  await c.api.importFile({name:'draft.json',text:async()=>JSON.stringify({notes:[note('fresh','first offline note')],categories:[cat]})});await c.api.flushLocal();
  assert.equal(c.record().state.notes[0].text,'first offline note');
});
test('client: concurrent local commits merge independent edits without a network',async()=>{
  const storage=new Map(),a=makeClient(storage),b=makeClient(storage);a.api.setState(state());b.api.setState(state());
  for(const c of[a,b])c.api.api(async()=>{throw Error('offline');},()=>assert.fail());
  a.api.edit('a','A offline');b.api.edit('b','B offline');await Promise.all([a.api.flushLocal(),b.api.flushLocal()]);
  assert.ok(a.record().state.notes.some(n=>n.text==='A offline'));assert.ok(a.record().state.notes.some(n=>n.text==='B offline'));assert.equal(a.record().state.notes.length,2);
});
test('client: local delete versus simultaneous edit preserves the edited text',()=>{
  const {api}=makeClient(),base=state(),a=state(),b=state();a.notes=a.notes.filter(n=>n.id!=='a');b.notes[0].text='newest text';
  assert.ok(api.mergeLocalStates_(base,a,b).notes.some(n=>n.text==='newest text'));
  assert.ok(api.mergeLocalStates_(base,b,a).notes.some(n=>n.text==='newest text'));
});
test('private backend: missing, incorrect or unconfigured credentials cannot read or write data',()=>{
  const b=makeBackend(),base=seed(b);
  for(const auth of['','b'.repeat(64),'bad']){
    const out=JSON.parse(b.context.doGet({parameter:{action:'getState',auth}}).data);assert.equal(out.ok,false);
    assert.equal(b.post({...base,baseRevision:base.revision},'unauthorized',auth).ok,false);assert.equal(b.get().revision,base.revision);
  }
  b.properties.delete('NOTAS_API_TOKEN');assert.equal(b.get().ok,false);
});
test('private backend: setup and connection helpers require the effective owner identity',()=>{
  const b=makeBackend();b.context.Session={getActiveUser:()=>({getEmail:()=>''}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.test'})};
  assert.throws(()=>b.context.prepararNotas(),/propietario/);assert.throws(()=>b.context.verConexionPrivada(),/propietario/);assert.equal(b.properties.has('NOTAS_SPREADSHEET_ID'),false);
});
test('private client: a connection key is consumed from the fragment, scrubbed, and pinned to the reviewed endpoint',()=>{
  const c=makeClient(),endpoint='https://script.google.com/macros/s/test/exec',key='c'.repeat(64);let clean;
  c.window.location={hash:'#notas_key='+key,pathname:'/notas/notas.html',search:''};c.window.history={replaceState:(a,b,url)=>clean=url};
  assert.equal(c.api.readPrivateConnection_(endpoint),key);assert.equal(clean,'/notas/notas.html');
  c.window.location.hash='';assert.equal(c.api.readPrivateConnection_('https://script.google.com/macros/s/other/exec'),'');
  c.window.location.hash='#notas_key=invalid';assert.equal(c.api.readPrivateConnection_(endpoint),key);
});
test('private backend: initialization reuses the same private sheet and key on every retry',()=>{
  const b=makeBackend();b.properties.delete('NOTAS_API_TOKEN');b.context.prepararNotas();const id=b.properties.get('NOTAS_SPREADSHEET_ID'),token=b.properties.get('NOTAS_API_TOKEN');
  assert.equal(b.created(),1);assert.match(token,/^[a-f0-9]{64}$/);assert.equal(JSON.parse(b.context.doGet({parameter:{action:'getState',auth:token}}).data).ok,true);
  b.context.prepararNotas();assert.equal(b.created(),1);assert.equal(b.properties.get('NOTAS_SPREADSHEET_ID'),id);assert.equal(b.properties.get('NOTAS_API_TOKEN'),token);
});
test('private connection: switching to a new empty backend never treats its empty state as deletion of local notes',async()=>{
  const c=makeClient();c.api.setState(state());c.api.api(async()=>{throw Error('offline');},()=>assert.fail());c.api.edit('a','preserve on migration');await c.api.flushLocal();
  c.record().cloudEndpoint='https://script.google.com/macros/s/older/exec';c.record().cloudBase=state();
  const reopened=makeClient(c.storage);let sent;reopened.api.api(async()=>({ok:true,categories:[cat],notes:[],revision:'new-empty'}),async s=>{sent=copy(s);s.savedRevision='new-saved';});
  await reopened.api.init();await reopened.api.flushPendingSave_();assert.ok(sent.notes.some(n=>n.text==='preserve on migration'));assert.equal(reopened.record().state.notes.length,2);
});
test('private connection: old local records on the unchanged original endpoint retain their known cloud baseline',async()=>{
  const c=makeClient();const local=state();local.notes=local.notes.filter(n=>n.id!=='a');c.api.setState(local);c.api.api(async()=>{throw Error('offline');},()=>assert.fail());
  await c.api.importFile({name:'notes.json',text:async()=>JSON.stringify({categories:[cat],notes:[note('b')]})});await c.api.flushLocal();delete c.record().cloudEndpoint;c.record().cloudBase=state();
  const reopened=makeClient(c.storage);let sent;reopened.api.api(async()=>state(),async s=>{sent=copy(s);s.savedRevision='r2';});await reopened.api.init();await reopened.api.flushPendingSave_();
  assert.equal(sent.notes.some(n=>n.id==='a'),false);
});
