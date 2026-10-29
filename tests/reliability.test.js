'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const backend=require('./backend-harness');
const client=require('./client-harness');
const clone=x=>JSON.parse(JSON.stringify(x));
const cat={id:'general',name:'General',color:'#4F46E5',order:0,collapsed:false,collapsedPinned:true};
const note=(id,text)=>({id,text,createdAt:1700000000000,updatedAt:1700000000000,pinned:false,order:0,categoryId:'general'});
const initial=()=>({ok:true,v:6,categories:[clone(cat)],notes:[note('one','original')],settings:{}});
function save(b,state){const response=b.post({...state,baseRevision:b.get().revision});assert.equal(response.ok,true,response.error);return b.get();}
function archive(b,kind,extra={}){return JSON.parse(b.context.doGet({parameter:{action:'getArchive',kind,auth:'a'.repeat(64),...extra}}).data);}

test('v6: Google connection never hands a key to anonymous or other-account visitors',()=>{
  const b=backend();b.properties.set('NOTAS_OWNER_EMAIL','owner@example.test');
  for(const email of['','other@example.test']){
    b.context.Session.getActiveUser=()=>({getEmail:()=>email});
    const out=b.context.doGet({parameter:{action:'connect'}}).data;
    assert.ok(!out.includes('a'.repeat(64)));assert.equal(JSON.parse(out).ok,false);
  }
  b.context.Session.getActiveUser=()=>({getEmail:()=> 'owner@example.test'});
  const page=b.context.doGet({parameter:{action:'connect',redirect:'https://evil.test'}}).data;
  assert.ok(page.includes('target="_top"'));assert.ok(page.includes('https://gruemp.github.io/notas/notas.html#notas_key='));assert.ok(!page.includes('evil.test'));
});
test('v6: edits and deletions are archived without changing active state revision or original text',()=>{
  const b=backend();let s=save(b,initial());s.notes[0].text='edited';s=save(b,s);
  const h=archive(b,'history');assert.equal(h.ok,true);assert.equal(h.entries[0].preview,'original');
  const revision=s.revision;s=save(b,{...s,notes:[]});
  const trash=archive(b,'trash');assert.equal(trash.entries[0].preview,'edited');assert.equal(archive(b,'trash',{id:trash.entries[0].id}).entry.note.text,'edited');
  assert.notEqual(s.revision,revision);assert.equal(b.get().notes.length,0);assert.equal(archive(b,'history').entries.length,1);
});
test('v6: backups use a separate spreadsheet once per changed day and retain the earlier state',()=>{
  const b=backend();let day='2026-10-28';b.context.Utilities.formatDate=()=>day;
  let s=save(b,initial());const firstCount=b.created();s.notes[0].text='today';s=save(b,s);
  assert.equal(b.created(),firstCount);day='2026-10-29';s.notes[0].text='tomorrow';save(b,s);
  const copies=archive(b,'backup').entries;assert.equal(copies.length,2);assert.equal(b.created(),firstCount+1);
  const copy=copies.find(x=>x.id==='daily_2026-10-29');
  assert.equal(b.documents.get(copy.spreadsheetId).getSheetByName('Notes').getRange(2,2).getValue(),'today');
  assert.equal(b.get().notes[0].text,'tomorrow');assert.ok(b.get().backupAt>0);
});
test('v6: a long literal note survives chunked recovery and wrong keys cannot read archives',()=>{
  const b=backend();const s=initial();s.notes[0].text='=literal\n'+ 'x'.repeat(48000);let before=save(b,s);save(b,{...before,notes:[]});
  const meta=archive(b,'trash').entries[0];const entry=archive(b,'trash',{id:meta.id}).entry;assert.equal(entry.note.text,s.notes[0].text);
  const bad=JSON.parse(b.context.doGet({parameter:{action:'getArchive',kind:'trash',auth:'b'.repeat(64)}}).data);assert.equal(bad.ok,false);
});
test('v6: an archive failure aborts a deletion and preserves the active tables',()=>{
  const b=backend(),s=save(b,initial());b.failOnce((name,row)=>name==='_notas_archive_v6'&&row>1);
  const out=b.post({...s,notes:[],baseRevision:s.revision});assert.equal(out.ok,false);assert.equal(b.get().notes[0].text,'original');
});
test('v6: uploaded offline history is validated, deduplicated and visible from another device',()=>{
  const b=backend();let s=save(b,initial());const entry={id:'offline-version',kind:'history',at:1700000000000,note:note('one','offline intermediate'),categories:[cat]};
  s=save(b,{...s,recoveryEntries:[entry]});save(b,{...s,recoveryEntries:[entry]});assert.equal(archive(b,'history').entries.length,1);
  const before=b.get();const out=b.post({...before,baseRevision:before.revision,recoveryEntries:[{...entry,id:'bad',note:null}]});assert.equal(out.ok,false);assert.equal(b.get().revision,before.revision);
});
test('v6: a blocked localStorage keeps a valid incoming key usable for the current session',()=>{
  const c=client();c.window.location={hash:'#notas_key='+'c'.repeat(64),pathname:'/notas/notas.html',search:''};c.window.history={replaceState(){}};
  c.localStorage.setItem=()=>{throw Error('storage blocked');};
  assert.equal(c.api.readPrivateConnection_(c.api.endpoint),'c'.repeat(64));
});
test('v6: trash survives a device reload and cannot delete a note if both storage methods fail',async()=>{
  const c=client();c.api.setState(initial());await c.api.deleteNote('one');assert.equal(c.api.getState().notes.length,0);
  const second=client(c.storage);await second.api.loadLocalRecovery_();assert.equal([...second.api.recovery().values()].find(e=>e.kind==='trash').note.text,'original');
  const failing=client();failing.api.setState(initial());failing.localStorage.setItem=()=>{throw Error('quota');};await failing.api.deleteNote('one');assert.equal(failing.api.getState().notes.length,1);
});
test('v6: restoring a previous version saves the replaced text and recovering a backup preserves new notes',async()=>{
  const c=client();c.api.setState(initial());c.api.api(async()=>{throw Error('offline');},()=>assert.fail());
  c.api.selectRecovery({id:'old',kind:'history',note:note('one','older')});await c.api.restoreSelected_();
  assert.equal(c.api.getState().notes[0].text,'older');assert.ok([...c.api.recovery().values()].some(e=>e.kind==='history'&&e.note.text==='original'));
  c.api.selectRecovery({id:'backup',kind:'backup',state:{categories:[cat],notes:[note('two','recover me')]}});await c.api.restoreSelected_();
  assert.ok(c.api.getState().notes.some(n=>n.text==='older'));assert.ok(c.api.getState().notes.some(n=>n.text==='recover me'));
});
test('v6: visible status distinguishes authorization, slow service, and unconfirmed local changes',async()=>{
  const c=client();c.api.setState(initial());
  assert.equal(c.api.syncError_(Error('No autorizado.')).code,'AUTH_INVALID');assert.equal(c.api.syncError_(Error('Guardado sin confirmación')).code,'TIMEOUT');
  c.api.syncState().at=Date.now();c.api.renderSyncStatus_();assert.equal(c.elements.get('syncSummary').textContent,'Sincronizado con Google');
  c.api.edit('one','new draft');c.api.renderSyncStatus_();assert.ok(!c.elements.get('syncSummary').textContent.startsWith('Sincronizado'));
  let attempts=0;c.api.api(async()=>{attempts++;throw Error('No autorizado.');},()=>assert.fail());await c.api.flushCloudSave_();await c.api.flushCloudSave_();assert.equal(attempts,1);
  await c.api.retrySync_();assert.equal(attempts,2);assert.equal(c.api.syncState().error.code,'AUTH_INVALID');
});

test('v6: an edit while the trash copy is being written cancels deletion',async()=>{
  const c=client();c.api.setState(initial());const write=c.localStorage.setItem;let changed=false;
  c.localStorage.setItem=(key,value)=>{
    write(key,value);
    if(!changed&&key.startsWith('notas_archive_v6:trash:')) { changed=true;c.api.edit('one','newest edit'); }
  };
  await c.api.deleteNote('one');assert.equal(changed,true);assert.equal(c.api.getState().notes[0].text,'newest edit');
});
