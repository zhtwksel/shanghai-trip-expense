import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { emptyState, putExpense, calculate, addTransfer, names } from '../src/domain/accounting.ts';
import { GoogleTripRepository, prepareMutation, SharedDataError } from '../src/data/googleRepository.ts';
function backend() {
 let rows: unknown[][]=[];let held=false;
 const sheet={getLastRow:()=>rows.length,getMaxRows:()=>10000,getDataRange:()=>({getValues:()=>rows}),getRange:(r:number,c:number,n:number,w:number)=>({getValues:()=>rows.slice(r-1,r-1+n),setValues:(value:unknown[][])=>{assert(held);rows=value.map(x=>[...x]);}})};
 const book={getSheetByName:()=>rows.length?sheet:null,insertSheet:()=>sheet};
 const context=vm.createContext({SpreadsheetApp:{openById:()=>book,flush:()=>{}},LockService:{getScriptLock:()=>({waitLock:()=>{assert(!held);held=true;},releaseLock:()=>{held=false;}})}});
 vm.runInContext(readFileSync('google-apps-script/Code.gs','utf8'),context);
 context.initializeSpreadsheet();
 return {load:()=>JSON.parse(JSON.stringify(context.snapshot_(context.read_(sheet)))),save:(request:unknown)=>JSON.parse(JSON.stringify(context.mutate_(JSON.parse(JSON.stringify(request))))),initialize:()=>context.initializeSpreadsheet()};
}
function add(base:ReturnType<typeof emptyState>,id:string,amount='82') {
 return putExpense(base,{id,phase:'during',payer:'김재영',currency:'CNY',amount,rate:'205',krw:0,description:'택시',date:'2026-10-08T12:00',memo:''});
}
test('서로 다른 두 브라우저 지출은 오래된 같은 기준에서도 모두 유지된다',()=>{
 const api=backend(),snapshot=api.load();
 api.save(prepareMutation(snapshot,add(snapshot.state,'expense-a'),'request-a'));
 const saved=api.save(prepareMutation(snapshot,add(snapshot.state,'expense-b'),'request-b'));
 assert.equal(saved.state.expenses.length,2);assert.equal(calculate(saved.state).during,33620);assert.equal(calculate(saved.state).people[2].balance,-33620);assert.equal(calculate(saved.state).difference,0);
});
test('응답 유실 후 같은 요청 재시도는 중복 저장되지 않는다',()=>{
 const api=backend(),base=api.load(),request=prepareMutation(base,add(base.state,'expense-a'),'retry-id');
 api.save(request);const saved=api.save(request);assert.equal(saved.revision,1);assert.equal(saved.state.expenses.length,1);
 assert.throws(()=>api.save({...request,revision:9}));
});
test('동일 지출 수정 충돌을 알리고 삭제는 회계 잔액을 원복한다',()=>{
 const api=backend(),start=api.load(),base=api.save(prepareMutation(start,add(start.state,'expense-a'),'add'));
 const first=api.save(prepareMutation(base,add(base.state,'expense-a','100'),'edit-a'));
 assert.equal(api.save(prepareMutation(base,add(base.state,'expense-a','200'),'edit-b')).code,'CONFLICT');
 const saved=api.save(prepareMutation(first,{...first.state,expenses:[]},'delete'));
 assert.equal(calculate(saved.state).during,0);assert.equal(calculate(saved.state).total,0);
});
test('자금 설정·전체 복원은 최신 revision을 요구한다; 초기화는 기존 데이터 보존',()=>{
 const api=backend(),base=api.load();api.save(prepareMutation(base,add(base.state,'expense-a'),'add'));
 assert.equal(api.save(prepareMutation(base,{...base.state,threshold:100000},'settings')).code,'CONFLICT');
 assert.equal(api.save(prepareMutation(base,base.state,'restore',true)).code,'CONFLICT');
 api.initialize();assert.equal(api.load().state.expenses.length,1);
});
test('Data Service POST는 읽을 수 있는 응답 확인 후에만 완료하며 실패를 구분한다',async()=>{
 let call:RequestInit|undefined;
 const fetcher=async (_url:unknown,options:RequestInit)=>{call=options;return new Response(JSON.stringify({ok:true,revision:1,state:emptyState()}));};
 const repository=new GoogleTripRepository('https://script.google.com/macros/s/test/exec',fetcher as typeof fetch);
 await repository.save(prepareMutation({state:emptyState(),revision:0},emptyState(),'request'));
 assert.equal(call?.method,'POST');assert.equal(call?.mode,undefined);assert.equal((call?.headers as Record<string,string>)['Content-Type'],'text/plain;charset=utf-8');
 const failing=new GoogleTripRepository('https://script.google.com/macros/s/test/exec',(async()=>{throw new Error('offline');}) as typeof fetch);
 await assert.rejects(failing.load(),(e:unknown)=>e instanceof SharedDataError&&e.code==='NETWORK');
 const conflicting=new GoogleTripRepository('https://script.google.com/macros/s/test/exec',(async()=>new Response(JSON.stringify({ok:false,code:'CONFLICT',message:'최신 조회 필요'}))) as typeof fetch);
 await assert.rejects(conflicting.load(),(e:unknown)=>e instanceof SharedDataError&&e.code==='CONFLICT');
});
test('설정·출발 전 지출·추가 지급도 공유되며 동시 자금 이동 충돌을 거부한다',()=>{
 const api=backend(),start=api.load(),funded=emptyState();
 for(const name of names)funded.people[name]={initial:1000000,allocated:500000};
 const configured=api.save(prepareMutation(start,funded,'funding'));
 const prepared=putExpense(configured.state,{...add(configured.state,'pretrip').expenses[0],phase:'before'});
 const base=api.save(prepareMutation(configured,prepared,'pretrip-save'));
 const before=calculate(base.state);
 const a=addTransfer(base.state,{id:'transfer-a',person:'강병우',krw:300000,date:'2026-10-08T12:00',memo:'추가 지급'});
 const b=addTransfer(base.state,{id:'transfer-b',person:'박재득',krw:300000,date:'2026-10-08T12:00',memo:''});
 const saved=api.save(prepareMutation(base,a,'transfer-save-a'));
 assert.equal(api.save(prepareMutation(base,b,'transfer-save-b')).code,'CONFLICT');
 const after=calculate(api.load().state);assert.equal(after.total,before.total);assert.equal(after.pool,before.pool-300000);assert.equal(after.people[3].balance,800000);assert.equal(after.before,16810);assert.equal(saved.state.expenses[0].rate,'205');assert.equal(after.difference,0);
});
