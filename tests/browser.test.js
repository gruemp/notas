'use strict';
// These tests use an isolated Chromium profile and a loopback HTTP server.
// All requests outside that server are intercepted. No production data is read or written.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,devices}=require('playwright');
const backend=require('./backend-harness');
const root=path.join(__dirname,'..');
const apiEndpoint=fs.readFileSync(path.join(root,'notas.html'),'utf8').match(/const API_URL = "([^"]+)"/)[1];
const fixture={ok:true,v:4,categories:[{id:'general',name:'General',color:'#4F46E5',order:-100000,collapsed:false,collapsedPinned:false}],notes:[{id:'fixture',text:'el retén bueno\n\nsegundo párrafo',createdAt:1700000000000,updatedAt:1700000000000,pinned:false,order:0,categoryId:'general'}],settings:{}};
let server,browser,origin,baseline;
before(async()=>{
  baseline=process.env.NOTAS_BASELINE_FILE?fs.readFileSync(process.env.NOTAS_BASELINE_FILE,'utf8'):execFileSync('git',['show','5e6ad21bbb66675312414e06f91812874b2d09dc:notas.html'],{cwd:root,encoding:'utf8'});
  server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=pathname==='/'?'index.html':pathname.slice(1);
    if(!['index.html','notas.html','sw.js','baseline.html'].includes(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-cache');
    res.end(file==='baseline.html'?baseline:fs.readFileSync(path.join(root,file)));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function contextFor({mobile=false,api='offline',seed=false,seedAuth=true,serviceWorkers='block'}={}){
  const context=await browser.newContext({...mobile?devices['iPhone 13']:{viewport:{width:1280,height:900}},timezoneId:'America/Bogota',serviceWorkers});
  await context.addInitScript(({seed,fixture,api,apiEndpoint,seedAuth})=>{
    if(api!=='offline'&&seedAuth)localStorage.setItem('notas_web_cloud_connection_v1',JSON.stringify({endpoint:apiEndpoint,token:"a".repeat(64)}));
    localStorage.setItem('notas_web_category_collapse_v1',JSON.stringify({general:{normal:false,pinned:false}}));
    if(seed&&!localStorage.getItem('notas_web_last_state_v1'))localStorage.setItem('notas_web_last_state_v1',JSON.stringify(fixture));
  },{seed,fixture,api,apiEndpoint,seedAuth});
  let posts=0;
  const b=api==='v5'?backend():null;
  if(b){const s=b.get();b.post({...fixture,baseRevision:s.revision});}
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin){await route.continue();return;}
    if(url.hostname==='script.google.com'){
      if(api==='offline'){await route.abort('failed');return;}
      if(req.method()==='GET'){
        const cb=url.searchParams.get('callback');
        await route.fulfill({contentType:'text/javascript',body:b?b.context.doGet({parameter:Object.fromEntries(url.searchParams)}).data:cb+'('+JSON.stringify(fixture)+');'});return;
      }
      posts++;
      if(!b)throw Error('Blind write to legacy backend');
      const form=new URLSearchParams(req.postData());const out=b.post(JSON.parse(form.get('payload')),form.get('requestId'),form.get('auth')||'');
      await route.fulfill({contentType:'text/html',body:'<script>window.top.postMessage('+JSON.stringify(out)+','+JSON.stringify(origin)+')</script>'});return;
    }
    await route.abort('blockedbyclient');
  });
  return {context,posts:()=>posts,backend:b};
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#notesList')?.children.length>0);}
async function record(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('notas_durable_v1',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readonly'),get=tx.objectStore('state').get('current');tx.oncomplete=()=>{resolve(get.result);db.close();};};
}));}
async function waitRecord(page,predicate){
  const deadline=Date.now()+15000;
  do {const value=await record(page);if(predicate(value))return value;await new Promise(r=>setTimeout(r,40));}while(Date.now()<deadline);
  assert.fail('Persisted record did not reach the expected state: '+JSON.stringify(await record(page)));
}
async function savedText(page,text){await waitRecord(page,r=>r?.state?.notes.some(n=>n.text===text));}
async function create(page,text){await page.locator('#newNote').click();await page.locator('#noteEditor').fill(text);await page.locator('#noteClose').click();await savedText(page,text);}
async function openNote(page,id){await page.locator('.note[data-id="'+id+'"] .note-view').click();}
async function rowAction(page,id,action){const row=page.locator('.note[data-id="'+id+'"]');await row.locator('.ui-note-more').click();await row.locator('[data-action="'+action+'"]').click();}
async function firstRowAction(page,action){await rowAction(page,await page.locator('.note').first().getAttribute('data-id'),action);}
async function openSettings(page){if(await page.locator('#uiSettings').getAttribute('aria-expanded')!=='true')await page.locator('#uiSettings').click();}

for(const mobile of [false,true]){
  test((mobile?'mobile':'desktop')+': unavailable API, typing, reload, search, clipboard, delete/undo, categories and JSON export',async()=>{
    const {context,posts}=await contextFor({mobile});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(origin+'/notas.html');await ready(page);
      const text='el retén bueno\n\npárrafo conservado';await create(page,text);
      await page.reload();await ready(page);let r=await record(page);assert.equal(r.state.notes[0].text,text);const id=r.state.notes[0].id;
      await page.locator('#search').fill('BUE te el');await page.waitForFunction(()=>document.querySelectorAll('.note:not([hidden])').length===1);
      await page.locator('#search').fill('inexistente');await page.waitForFunction(()=>document.querySelectorAll('.note:not([hidden])').length===0);await page.locator('#clearSearch').click();
      const row=page.locator('.note[data-id="'+id+'"]');
      await rowAction(page,id,'pin');await page.waitForFunction(()=>document.querySelector('#pinnedList .note'));await rowAction(page,id,'pin');
      await rowAction(page,id,'delete');await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.equal(await page.locator('.note').count(),1);
      await context.grantPermissions(['clipboard-read','clipboard-write']);await rowAction(page,id,'copyPaste');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),text);
      await rowAction(page,id,'clear');await rowAction(page,id,'copyPaste');await savedText(page,text);
      await openSettings(page);await page.locator('#newCatTop').click();await page.locator('#catNewName').fill('Trabajo');await page.locator('#catAddBtn').click();await page.locator('#catClose').click();
      const work=await row.locator('select option').allTextContents();assert.ok(work.includes('Trabajo'));
      await row.locator('select').selectOption({label:'Trabajo'});await page.waitForFunction(()=>document.querySelector('#catFilter option')?.parentElement.options.length===3);
      const download=page.waitForEvent('download');await openSettings(page);await page.locator('#exportJson').click();const file=await download;const data=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert.ok(data.notes.some(n=>n.text===text));assert.ok(data.categories.some(c=>c.name==='Trabajo'));
      await page.goto(origin+'/');await ready(page);assert.equal((await record(page)).state.notes.length,1);assert.equal(posts(),0);assert.deepEqual(errors,[]);
    }catch(error){await page.screenshot({path:path.join(root,'test-results',mobile?'mobile.png':'desktop.png'),fullPage:true});throw error;}finally{await context.close();}
  });
}
test('actual IndexedDB transactions combine simultaneous edits in two tabs and restore them on reload',async()=>{
  const {context}=await contextFor();const a=await context.newPage();await a.goto(origin+'/notas.html');await ready(a);await create(a,'first');await create(a,'second');
  const r=await record(a),[first,second]=r.state.notes;const b=await context.newPage();await b.goto(origin+'/notas.html');await ready(b);
  await openNote(a,first.id);await openNote(b,second.id);await Promise.all([a.locator('#noteEditor').fill('A changed'),b.locator('#noteEditor').fill('B changed')]);
  await Promise.all([a.locator('#noteClose').click(),b.locator('#noteClose').click()]);await savedText(a,'A changed');await savedText(a,'B changed');
  await a.reload();await ready(a);const got=await record(a);assert.ok(got.state.notes.some(n=>n.text==='A changed'));assert.ok(got.state.notes.some(n=>n.text==='B changed'));assert.equal(got.state.notes.length,2);await context.close();
});
test('two tabs editing the same note preserve both versions without repeated conflict copies',async()=>{
  const {context}=await contextFor();const a=await context.newPage();await a.goto(origin+'/notas.html');await ready(a);await create(a,'original');const id=(await record(a)).state.notes[0].id;
  const b=await context.newPage();await b.goto(origin+'/notas.html');await ready(b);await openNote(a,id);await openNote(b,id);
  await Promise.all([a.locator('#noteEditor').fill('version A'),b.locator('#noteEditor').fill('version B')]);
  await Promise.all([a.locator('#noteClose').click(),b.locator('#noteClose').click()]);await savedText(a,'version A');await savedText(a,'version B');
  await a.reload();await ready(a);assert.equal((await record(a)).state.notes.length,2);await a.reload();await ready(a);assert.equal((await record(a)).state.notes.length,2);await context.close();
});
test('service worker restores the application shell and notes during a completely offline reload',async()=>{
  const {context}=await contextFor({serviceWorkers:'allow'});const page=await context.newPage();await page.goto(origin+'/notas.html');await ready(page);await create(page,'offline persists');
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await ready(page);assert.equal((await record(page)).state.notes[0].text,'offline persists');await context.setOffline(false);await context.close();
});
test('client/server v5 protocol saves through a real cross-origin iframe and acknowledges the version',async()=>{
  const {context,backend:b,posts}=await contextFor({api:'v5'});const page=await context.newPage();await page.goto(origin+'/notas.html');await ready(page);await create(page,'cloud protocol');
  await waitRecord(page,r=>r?.cloudBase?.notes.some(n=>n.text==='cloud protocol'));
  assert.ok(b.get().notes.some(n=>n.text==='cloud protocol'));assert.ok(posts()>0);await context.close();
});
for(const mobile of [false,true]){
  test((mobile?'mobile':'desktop')+': dark card interface, filters, navigation and category view are usable',async()=>{
    const {context}=await contextFor({mobile,api:'offline',seed:true});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/notas.html');await ready(page);
    assert.equal(await page.locator('#uiPageTitle').innerText(),'Notas');
    assert.equal(await page.locator('.ui-nav button').count(),3);
    assert.ok(await page.locator('.ui-chip').count()>0);
    assert.ok(await page.locator('.note .ui-card-title').count()>0);
    assert.ok(await page.locator('#newNote').isVisible());
    await page.locator('[data-ui-nav="categories"]').click();
    assert.equal(await page.locator('#uiPageTitle').innerText(),'Categorías');
    assert.ok(await page.locator('.ui-category-card').count()>0);
    assert.ok(!await page.locator('#newNote').isVisible());
    await page.locator('.ui-category-menu').first().click();
    assert.ok(await page.locator('#uiCategorySheet').isVisible());
    await page.locator('#uiCategoryCancel').click();
    await page.locator('[data-ui-nav="notes"]').click();
    assert.equal(await page.locator('#uiPageTitle').innerText(),'Notas');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(root,'test-results',(mobile?'mobile':'desktop')+'-new-design.png'),fullPage:true});
    await context.close();
  });
}
for(const mobile of [false,true]) test((mobile?'mobile':'desktop')+': persistent status and trash restore work offline after a full reload',async()=>{
  const {context}=await contextFor({mobile});const page=await context.newPage();await page.goto(origin+'/notas.html');await ready(page);
  await create(page,'recover this offline');const id=(await record(page)).state.notes[0].id;
  await rowAction(page,id,'delete');
  await waitRecord(page,r=>r?.state.notes.length===0);await page.reload();await ready(page);
  assert.ok((await page.locator('#syncSummary').innerText()).includes('dispositivo'));
  await page.locator('[data-ui-nav="trash"]').click();const row=page.locator('.recovery-entry').filter({hasText:'recover this offline'});
  assert.equal(await page.locator('#recoveryMore').isVisible(),false);
  await row.getByRole('button',{name:'Revisar y recuperar',exact:true}).click();assert.equal(await page.locator('#recoveryPreviewText').innerText(),'recover this offline');
  await page.locator('#recoveryRestore').click();await savedText(page,'recover this offline');
  await page.locator('#recoveryClose').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(root,'test-results',(mobile?'mobile':'desktop')+'-reliability.png')});await context.close();
});

test('cloud history and independent backups can be recovered without deleting current notes',async()=>{
  const {context,backend:b}=await contextFor({api:'v5'});b.context.Utilities.formatDate=()=> '2026-10-30';
  const page=await context.newPage();await page.goto(origin+'/notas.html');await ready(page);await savedText(page,fixture.notes[0].text);
  const id=(await record(page)).state.notes[0].id;await openNote(page,id);await page.locator('#noteEditor').fill('new version kept');await page.locator('#noteClose').click();
  await waitRecord(page,r=>r?.cloudBase?.notes.some(n=>n.text==='new version kept'));
  await page.locator('[data-ui-nav="trash"]').click();await page.locator('#recoveryKind').selectOption('backup');
  const row=page.locator('.recovery-entry').filter({hasText:'Google'}).filter({hasText:'1 notas'});
  await row.getByRole('button',{name:'Revisar y recuperar',exact:true}).click();await page.locator('#recoveryRestore').click();
  await savedText(page,'new version kept');await savedText(page,fixture.notes[0].text);assert.equal((await record(page)).state.notes.length,2);
  await context.close();
});

test('Google connection control navigates only to the configured Google owner deployment',async()=>{
  const html=fs.readFileSync(path.join(root,'notas.html'),'utf8');const login=html.match(/const GOOGLE_CONNECT_URL = "([^"]+)"/)[1];
  assert.match(login,/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/);
  const {context}=await contextFor();await context.route(login+'?action=connect',route=>route.fulfill({contentType:'text/html',body:'<h1>Google owner authentication</h1>'}));
  const page=await context.newPage();await page.goto(origin+'/notas.html');await ready(page);await openSettings(page);await page.locator('#connectGoogle').click();
  await page.getByRole('heading',{name:'Google owner authentication'}).waitFor();assert.equal(page.url(),login+'?action=connect');await context.close();
});
test('clipboard permission delay survives an autosave and canceling the fallback does not alter a note',async()=>{
  const {context}=await contextFor();const page=await context.newPage();await page.goto(origin+'/notas.html');await ready(page);
  await page.locator('#newNote').click();await page.locator('#noteClose').click();
  await page.evaluate(()=>{navigator.clipboard.readText=()=>new Promise(resolve=>window.finishTestPaste=resolve);});
  await firstRowAction(page,'copyPaste');await page.waitForFunction(()=>typeof window.finishTestPaste==='function');
  await waitRecord(page,r=>r?.state.notes.length===1);await page.evaluate(()=>window.finishTestPaste('delayed paste'));await savedText(page,'delayed paste');
  await firstRowAction(page,'clear');await savedText(page,'');
  await page.evaluate(()=>{navigator.clipboard.readText=()=>Promise.reject(new Error('Denied'));});page.once('dialog',dialog=>dialog.dismiss());await firstRowAction(page,'copyPaste');
  assert.equal((await record(page)).state.notes[0].text,'');await context.close();
});
test('closing the tab before the debounce finishes recovers the newest text on reopening',async()=>{
  const {context}=await contextFor();const first=await context.newPage();await first.goto(origin+'/notas.html');await ready(first);
  await first.locator('#newNote').click();await first.locator('#noteEditor').fill('last keystroke before closing');await first.close();
  const reopened=await context.newPage();await reopened.goto(origin+'/notas.html');await ready(reopened);await savedText(reopened,'last keystroke before closing');
  assert.equal((await record(reopened)).state.notes.filter(n=>n.text==='last keystroke before closing').length,1);await context.close();
});
test('multiple category renames remain attached to the current model after each autosave',async()=>{
  const {context}=await contextFor();const page=await context.newPage();await page.goto(origin+'/notas.html');await ready(page);
  await openSettings(page);await page.locator('#newCatTop').click();await page.locator('#catNewName').fill('Initial category');await page.locator('#catAddBtn').click();
  const name=page.locator('#catTable input:not([disabled])');await name.fill('First rename');await waitRecord(page,r=>r?.state.categories.some(c=>c.name==='First rename'));
  await name.fill('Second rename');await waitRecord(page,r=>r?.state.categories.some(c=>c.name==='Second rename'));
  await name.fill('Third rename');await waitRecord(page,r=>r?.state.categories.some(c=>c.name==='Third rename'));
  await page.locator('#catClose').click();await page.reload();await ready(page);assert.ok((await record(page)).state.categories.some(c=>c.name==='Third rename'));await context.close();
});
test('a clean synchronized device reads remote updates periodically and again on reload without local edits',async()=>{
  const {context,backend:b}=await contextFor({api:'v5'});const page=await context.newPage();await page.clock.install();await page.goto(origin+'/notas.html');await ready(page);
  await waitRecord(page,r=>r?.cloudBase?.notes.some(n=>n.id==='fixture'));
  let remote=b.get();remote.notes.find(n=>n.id==='fixture').text='remote periodic update';assert.equal(b.post({...remote,baseRevision:remote.revision}).ok,true);
  await page.clock.fastForward(16000);await savedText(page,'remote periodic update');
  remote=b.get();remote.notes.find(n=>n.id==='fixture').text='remote update before reload';assert.equal(b.post({...remote,baseRevision:remote.revision}).ok,true);
  await page.reload();await ready(page);await savedText(page,'remote update before reload');await context.close();
});
test('a private fragment configures the pinned endpoint and is removed before cloud requests',async()=>{
  const {context}=await contextFor({api:'v5',seedAuth:false});const page=await context.newPage();await page.goto(origin+'/notas.html#notas_key='+'a'.repeat(64));await ready(page);
  await waitRecord(page,r=>r?.cloudBase?.notes.some(n=>n.id==='fixture'));assert.equal(new URL(page.url()).hash,'');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('notas_web_cloud_connection_v1')).token.length),64);await context.close();
});
test('a wrong private key leaves local data usable and cannot change remote notes',async()=>{
  const {context,backend:b,posts}=await contextFor({api:'v5',seedAuth:false});const page=await context.newPage();await page.goto(origin+'/notas.html#notas_key='+'b'.repeat(64));await ready(page);
  await create(page,'local despite denied connection');assert.ok((await record(page)).state.notes.some(n=>n.text==='local despite denied connection'));assert.equal(b.get().notes.length,1);assert.equal(posts(),0);await context.close();
});
test('a delayed IndexedDB read cannot replace an edit that committed after that read began',async()=>{
  const {context}=await contextFor();const page=await context.newPage();await page.goto(origin+'/notas.html');await ready(page);await create(page,'before delayed read');
  const id=(await record(page)).state.notes[0].id;
  await page.evaluate(()=>{
    const original=IDBDatabase.prototype.transaction;let once=true;
    IDBDatabase.prototype.transaction=function(...args){
      const tx=original.apply(this,args);
      if(once&&args[1]==='readonly'){
        once=false;Object.defineProperty(tx,'oncomplete',{set(fn){tx.addEventListener('complete',event=>{window.releaseDelayedLocalRead=()=>fn.call(tx,event);});}});
      }
      return tx;
    };
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForFunction(()=>typeof window.releaseDelayedLocalRead==='function');
  await openNote(page,id);await page.locator('#noteEditor').fill('after delayed read');await page.locator('#noteClose').click();await savedText(page,'after delayed read');
  await page.evaluate(async()=>{window.releaseDelayedLocalRead();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await page.locator('.note[data-id="'+id+'"] .ui-card-title').innerText(),'after delayed read');
  await page.reload();await ready(page);assert.equal((await record(page)).state.notes.find(n=>n.id===id).text,'after delayed read');await context.close();
});


test('category removal archives its notes and full category snapshot before changing the active state',async()=>{
  const {context}=await contextFor({api:'offline'});
  const page=await context.newPage();await page.goto(origin+'/notas.html');await ready(page);
  await create(page,'recover category body');
  await openSettings(page);await page.locator('#newCatTop').click();
  await page.locator('#catNewName').fill('Trabajo');await page.locator('#catAddBtn').click();await page.locator('#catClose').click();
  const id=(await record(page)).state.notes[0].id;
  await page.locator('.note[data-id="'+id+'"] select').selectOption({label:'Trabajo'});
  await savedText(page,'recover category body');
  await page.locator('[data-ui-nav="categories"]').click();
  const category=page.locator('.ui-category-card').filter({hasText:'Trabajo'});
  await category.locator('.ui-category-menu').click();
  assert.match(await page.locator('#uiCategorySheetDescription').innerText(),/1 nota irán/);
  await page.locator('#uiCategoryCancel').click();
  assert.equal((await record(page)).state.notes.length,1);
  await category.locator('.ui-category-menu').click();
  await page.locator('#uiCategoryDelete').click();
  await waitRecord(page,r=>r?.state.notes.length===0&&!r.state.categories.some(c=>c.name==='Trabajo'));
  const entries=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('notas_durable_v1',1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('state','readonly'),q=tx.objectStore('state').getAll();
      tx.oncomplete=()=>{resolve(q.result.filter(e=>e?.kind==='trash'||e?.kind==='backup').map(e=>({kind:e.kind,id:e.id,noteText:e.note?.text})));db.close();};
      tx.onerror=()=>reject(tx.error);
    };
  }));
  assert.ok(entries.some(e=>e.kind==='trash'&&e.noteText==='recover category body'));
  assert.ok(entries.some(e=>e.kind==='backup'&&e.id.startsWith('before_category_delete_')));
  await context.close();
});
