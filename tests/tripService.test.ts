import test from 'node:test';import assert from 'node:assert/strict';
import { TripService } from '../src/data/tripService.ts';
import { emptyState } from '../src/domain/accounting.ts';
import { SharedDataError, type Mutation } from '../src/data/googleRepository.ts';
test('응답 유실 재시도는 원래 요청을 유지하며 새 입력을 저장하지 않는다',async()=>{
 const snapshot={state:emptyState(),revision:0};const requests:Mutation[]=[];let fail=true;
 const service=new TripService({load:async()=>snapshot,save:async m=>{requests.push(m);if(fail){fail=false;throw new SharedDataError('NETWORK','응답 유실');}return {...snapshot,revision:1};}},()=> 'request-id');
 await service.load();await assert.rejects(service.save(s=>({...s,threshold:100000})));assert(service.pending);
 await service.save(()=>{throw new Error('재시도에서 새 입력 평가 금지');});assert.deepEqual(requests[0],requests[1]);assert.equal(service.pending,null);
});
test('저장 중 중복 호출 차단 및 완료 이후 최신 조회',async()=>{
 const base={state:emptyState(),revision:0};let finish!:()=>void;let count=0;
 const service=new TripService({load:async()=>base,save:async()=>{count++;await new Promise<void>(r=>{finish=r;});return {...base,revision:1};}},()=> 'request-id');
 await service.load();const first=service.save(s=>s);await assert.rejects(service.save(s=>s));finish();await first;assert.equal(count,1);assert.equal(service.busy,false);
});
test('조회 실패와 저장 확인 후 재조회 실패를 구분한다',async()=>{
 const base={state:emptyState(),revision:0};let fail=false;
 const service=new TripService({load:async()=>{if(fail)throw new Error('offline');return base;},save:async()=>({...base,revision:1})},()=> 'request-id');
 await service.load();fail=true;const result=await service.save(s=>s);assert.equal(result.refreshFailed,true);assert.equal(result.snapshot.revision,1);assert.equal(service.pending,null);
});
