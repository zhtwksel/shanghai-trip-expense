import { validateState, type State } from '../domain/accounting';
export type Snapshot = { state: State; revision: number };
export type Change = { key: string; before: unknown; after: unknown };
export type Mutation = { action: 'mutate'; requestId: string; revision: number; requireRevision: boolean; changes: Change[] };
export interface SharedTripRepository { load(): Promise<Snapshot>; save(mutation: Mutation): Promise<Snapshot> }
export class SharedDataError extends Error { constructor(public code: string, message: string) { super(message); } }
export function records(s: State): Record<string, unknown> {
 const result: Record<string, unknown> = { settings: { version: s.version, trip: s.trip, rate: s.rate, threshold: s.threshold } };
 for(const [name, value] of Object.entries(s.people)) result[`member/${name}`] = value;
 for(const collection of ['expenses','transfers','adjustments'] as const) for(const value of s[collection]) result[`${collection}/${value.id}`] = value;
 return result;
}
export function canonical(value: unknown): string {
 if(value === null || typeof value !== 'object') return JSON.stringify(value);
 if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
 return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
}
export function prepareMutation(base: Snapshot, next: State, requestId: string, requireRevision = false): Mutation {
 validateState(next);const before=records(base.state), after=records(next);
 const changes=Array.from(new Set([...Object.keys(before),...Object.keys(after)])).map(key=>({key,before:before[key]??null,after:after[key]??null})).filter(c=>canonical(c.before)!==canonical(c.after));
 return {action:'mutate',requestId,revision:base.revision,requireRevision,changes};
}
export class GoogleTripRepository implements SharedTripRepository {
 constructor(private endpoint: string, private fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) throw new Error('배포된 Apps Script /exec URL을 설정하세요.');
 }
 private async request(mutation?: Mutation): Promise<Snapshot> {
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),45000);
  try {
   const response=await this.fetcher(this.endpoint+(mutation?'':`?action=getAll&refresh=${Date.now()}`),{method:mutation?'POST':'GET',redirect:'follow',credentials:'omit',cache:'no-store',signal:controller.signal,...(mutation?{headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(mutation)}:{})});
   if(!response.ok) throw new Error('HTTP '+response.status);
   const payload=await response.json();
   if(payload.ok!==true) throw new SharedDataError(payload.code||'SERVER',payload.message||'공유 저장에 실패했습니다.');
   if(!Number.isSafeInteger(payload.revision)||payload.revision<0) throw new Error('잘못된 응답');
   return {state:validateState(payload.state),revision:payload.revision};
  } catch(e) {
   if(e instanceof SharedDataError) throw e;
   throw new SharedDataError('NETWORK','공유 데이터 요청에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
  } finally {clearTimeout(timeout);}
 }
 load() {return this.request();}
 save(mutation: Mutation) {return this.request(mutation);}
}
