import { type State } from '../domain/accounting';
import { prepareMutation, SharedDataError, type Mutation, type SharedTripRepository, type Snapshot } from './googleRepository';
export class TripService {
 snapshot: Snapshot | null = null;
 pending: Mutation | null = null;
 busy = false;
 constructor(private repository: SharedTripRepository, private requestId: () => string = () => crypto.randomUUID()) {}
 async load(): Promise<Snapshot> {
  if(this.busy || this.pending) throw new Error('저장 결과를 확인한 뒤 새로고침하세요.');
  this.busy=true;
  try { return this.snapshot = await this.repository.load(); } finally { this.busy=false; }
 }
 async save(action: (state: State) => State, requireRevision = false): Promise<{ snapshot: Snapshot; refreshFailed: boolean }> {
  if(this.busy) throw new Error('저장 중입니다.');
  if(!this.snapshot) throw new Error('공유 데이터를 먼저 불러오세요.');
  this.busy=true;
  try {
   // An ambiguous failure must retry the exact same request, not a newly generated transfer.
   if(!this.pending) this.pending=JSON.parse(JSON.stringify(prepareMutation(this.snapshot,action(this.snapshot.state),this.requestId(),requireRevision)));
   let confirmed: Snapshot;
   try { confirmed = await this.repository.save(this.pending!); }
   catch(error) {
    if(error instanceof SharedDataError && error.code !== 'NETWORK') {
     this.pending=null;
     if(error.code==='CONFLICT') { try { this.snapshot=await this.repository.load(); } catch { /* keep the input and report the original conflict */ } }
    }
    throw error;
   }
   this.pending=null;this.snapshot=confirmed;
   try {this.snapshot=await this.repository.load();return {snapshot:this.snapshot,refreshFailed:false};}
   catch {return {snapshot:confirmed,refreshFailed:true};}
  } finally {this.busy=false;}
 }
}
