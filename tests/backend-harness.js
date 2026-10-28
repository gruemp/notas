'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
// Deliberately small Sheets service double; no network or production credentials.
module.exports = function backend() {
  let held = false, fail = null;
  const sheets = new Map();
  class Sheet {
    constructor(name) { this.name=name; this.rows=10; this.cols=10; this.data=[]; }
    getName(){return this.name;}
    getMaxRows(){return this.rows;}
    getMaxColumns(){return this.cols;}
    insertRowsAfter(_, n){this.rows+=n;}
    insertColumnsAfter(_, n){this.cols+=n;}
    hideSheet(){}
    setFrozenRows(){}
    getLastRow(){let i=this.data.length;while(i&&!(this.data[i-1]||[]).some(x=>x!==''&&x!=null))i--;return i;}
    getRange(r,c,n=1,m=1){
      if(n<1||m<1||r+n-1>this.rows||c+m-1>this.cols)throw Error('Range out of bounds');
      const sheet=this;
      return {
        getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.data[r+i-1]?.[c+j-1]??''));},
        getValue(){return this.getValues()[0][0];},
        setValues(values){
          if(fail?.(sheet.name,r)) { fail=null;throw Error('Injected write failure'); }
          if(values.length!==n||values.some(x=>x.length!==m))throw Error('Invalid shape');
          values.forEach((row,i)=>row.forEach((v,j)=>{
            if(typeof v==='string'&&v.startsWith('='))throw Error('Unexpected formula evaluation');
            if(typeof v==='string'&&v.startsWith("'"))v=v.slice(1);
            (sheet.data[r+i-1]??=[])[c+j-1]=v;
          }));return this;
        },
        setValue(v){return this.setValues([[v]]);},
        clearContent(){for(let i=0;i<n;i++)for(let j=0;j<m;j++)(sheet.data[r+i-1]??=[])[c+j-1]='';return this;},
        setFontWeight(){return this;},setNumberFormat(){return this;}
      };
    }
  }
  const ss={getSheetByName:n=>sheets.get(n),insertSheet:n=>{const s=new Sheet(n);sheets.set(n,s);return s;},getSheets:()=>[...sheets.values()],getName:()=> 'Isolated test'};
  const output = data => ({data,setMimeType(){return this;},setXFrameOptionsMode(){return this;}});
  const context=vm.createContext({console,Date,JSON,Set,Map,
    SpreadsheetApp:{openById:()=>ss,flush(){}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]},
    LockService:{getScriptLock:()=>({waitLock(){if(held)throw Error('Concurrent access');held=true;},releaseLock(){held=false;}})},
    ContentService:{createTextOutput:output,MimeType:{JSON:'json',JAVASCRIPT:'js'}},
    HtmlService:{createHtmlOutput:output,XFrameOptionsMode:{ALLOWALL:1}}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app script.txt'),'utf8'),context);
  return {context,sheets,failOnce:f=>{fail=f;},get:()=>JSON.parse(context.doGet({parameter:{action:'getState'}}).data),
    post(state,requestId='test'){
      const html=context.doPost({parameter:{action:'saveAll',payload:JSON.stringify(state),requestId}}).data;
      const match=html.match(/window.top.postMessage\((.*), "https:\/\/gruemp.github.io"\);/);
      if(!match)throw Error('Invalid save response');return JSON.parse(match[1]);
    }};
};
