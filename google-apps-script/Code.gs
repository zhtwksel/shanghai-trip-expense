// Only edit this ID. Use a NEW spreadsheet dedicated to this app.
const SPREADSHEET_ID = 'PASTE_NEW_SPREADSHEET_ID_HERE';
const TAB = 'tripRecords';
const MEMBERS = ['이사장','센터장','김재영','강병우','박재득','화현경'];
function sheet_() {
 const sheet=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TAB);
 if(!sheet) throw new Error('initializeSpreadsheet를 먼저 실행하세요.');
 const header=sheet.getRange(1,1,1,2).getValues()[0];
 if(header[0]!=='key'||header[1]!=='json') throw new Error('전용 시트 헤더가 다릅니다. 자동 변경하지 않습니다.');
 return sheet;
}
function lock_(fn) {const lock=LockService.getScriptLock();lock.waitLock(20000);try{return fn();}finally{lock.releaseLock();}}
function initializeSpreadsheet() {
 return lock_(function(){
  const book=SpreadsheetApp.openById(SPREADSHEET_ID);let sheet=book.getSheetByName(TAB);
  if(sheet && sheet.getLastRow()>0){sheet_();return '기존 데이터를 유지했습니다.';}
  if(!sheet) sheet=book.insertSheet(TAB);
  const rows=[['key','json'],['_meta',JSON.stringify({revision:0})],['settings',JSON.stringify({version:1,trip:{name:'상하이 국외출장',start:'',end:''},rate:'205',threshold:200000})]];
  MEMBERS.forEach(name=>rows.push(['member/'+name,JSON.stringify({initial:0,allocated:0})]));
  sheet.getRange(1,1,rows.length,2).setValues(rows);SpreadsheetApp.flush();return '초기화 완료';
 });
}
function read_(sheet) {
 const data={};const rows=sheet.getDataRange().getValues();
 rows.slice(1).forEach(row=>{if(!row[0])return;if(Object.prototype.hasOwnProperty.call(data,row[0]))throw new Error('중복 저장 키');data[row[0]]=JSON.parse(row[1]);});
 if(!data._meta||!data.settings)throw new Error('저장소 초기화가 필요합니다.');return data;
}
function snapshot_(data) {
 const state=Object.assign({},data.settings,{people:{},expenses:[],transfers:[],adjustments:[]});
 MEMBERS.forEach(name=>{if(!data['member/'+name])throw new Error('출장자 데이터 누락');state.people[name]=data['member/'+name];});
 ['expenses','transfers','adjustments'].forEach(collection=>Object.keys(data).filter(k=>k.indexOf(collection+'/')===0).forEach(k=>state[collection].push(data[k])));
 return {ok:true,revision:data._meta.revision,state:state};
}
function canonical_(value) {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical_).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical_(value[k])).join(',')+'}';
}
function validChange_(change) {
 if(!change||typeof change.key!=='string'||!Object.prototype.hasOwnProperty.call(change,'before')||!Object.prototype.hasOwnProperty.call(change,'after'))throw new Error('잘못된 변경 요청');
 const key=change.key,value=change.after;
 if(key==='settings') {
  if(!value||value.version!==1||!value.trip||typeof value.trip.name!=='string'||typeof value.trip.start!=='string'||typeof value.trip.end!=='string'||typeof value.rate!=='string'||!/^\d+(\.\d{1,4})?$/.test(value.rate)||Number(value.rate)<=0||!Number.isSafeInteger(value.threshold)||value.threshold<0)throw new Error('잘못된 설정');
 } else if(key.indexOf('member/')===0) {
  if(MEMBERS.indexOf(key.slice(7))<0||!value||!Number.isSafeInteger(value.initial)||value.initial<0||!Number.isSafeInteger(value.allocated)||value.allocated<0)throw new Error('잘못된 출장자');
 } else {
  const parts=key.split('/');if(parts.length!==2||['expenses','transfers','adjustments'].indexOf(parts[0])<0||!/^[A-Za-z0-9_-]{1,100}$/.test(parts[1]))throw new Error('잘못된 거래 키');
  if(value!==null){
   if(value.id!==parts[1]||typeof value.date!=='string'||!Number.isFinite(Date.parse(value.date))||typeof value.memo!=='string'||!Number.isSafeInteger(value.krw))throw new Error('잘못된 거래');
   if(parts[0]==='expenses'){
    if(MEMBERS.indexOf(value.payer)<0||['before','during'].indexOf(value.phase)<0||['KRW','CNY'].indexOf(value.currency)<0||typeof value.amount!=='string'||typeof value.rate!=='string'||typeof value.description!=='string'||!value.description.trim()||value.krw<=0)throw new Error('잘못된 지출');
   } else if(MEMBERS.indexOf(value.person)<0||(parts[0]==='transfers'&&value.krw<=0))throw new Error('잘못된 지급/조정');
  }
 }
 if(JSON.stringify(value).length>40000)throw new Error('거래 기록이 너무 큽니다.');
}
function mutate_(request) {
 return lock_(function(){
  if(!request||request.action!=='mutate'||typeof request.requestId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(request.requestId)||!Number.isSafeInteger(request.revision)||request.revision<0||!Array.isArray(request.changes)||request.changes.length>1000)throw new Error('잘못된 요청');
  const sheet=sheet_(),data=read_(sheet),requestKey='_request/'+request.requestId,signature=canonical_(request);
  if(signature.length>40000)throw new Error('한 번의 요청이 너무 큽니다.');
  if(data[requestKey]){if(data[requestKey]!==signature)throw new Error('요청 ID를 다른 변경에 재사용할 수 없습니다.');return snapshot_(data);}
  const keys={};let strict=request.requireRevision===true;
  request.changes.forEach(c=>{validChange_(c);if(keys[c.key])throw new Error('중복 변경 키');keys[c.key]=true;if(c.key.indexOf('expenses/')!==0)strict=true;});
  // Funding/transfer/adjustment/restore changes require the latest snapshot.
  if(strict&&request.revision!==data._meta.revision)return {ok:false,code:'CONFLICT',message:'다른 사용자가 자금을 변경했습니다. 최신 조회 후 내용을 확인하고 다시 저장하세요.'};
  for(let i=0;i<request.changes.length;i++){
   const c=request.changes[i];if(canonical_(data[c.key]===undefined?null:data[c.key])!==canonical_(c.before))return {ok:false,code:'CONFLICT',message:'같은 기록이 변경되었습니다. 최신 조회 후 다시 확인하세요.'};
  }
  request.changes.forEach(c=>{if(c.after===null)delete data[c.key];else data[c.key]=c.after;});
  data._meta.revision++;data[requestKey]=signature;
  const rows=[['key','json']].concat(Object.keys(data).map(key=>{const json=JSON.stringify(data[key]);if(json.length>49000)throw new Error('저장 행이 너무 큽니다.');return [key,json];}));
  const size=Math.max(rows.length,sheet.getLastRow());while(rows.length<size)rows.push(['','']);
  if(size>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),size-sheet.getMaxRows());
  // State and deduplication records are written in the same batch while locked.
  sheet.getRange(1,1,size,2).setValues(rows);SpreadsheetApp.flush();return snapshot_(data);
 });
}
function output_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function doGet(e){try{if(!e||e.parameter.action!=='getAll')throw new Error('지원하지 않는 조회');return output_(lock_(function(){return snapshot_(read_(sheet_()));}));}catch(error){return output_({ok:false,code:'SERVER',message:String(error.message)});}}
function doPost(e){try{if(!e||!e.postData||e.postData.contents.length>100000)throw new Error('잘못된 요청 본문');return output_(mutate_(JSON.parse(e.postData.contents)));}catch(error){return output_({ok:false,code:'SERVER',message:String(error.message)});}}
