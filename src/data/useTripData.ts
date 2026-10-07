import { useEffect, useRef, useState } from 'react';
import { emptyState, type State } from '../domain/accounting';
import { createSharedRepository } from './sharedConfiguration';
import { TripService } from './tripService';
export function useTripData() {
 const service=useRef<TripService|null>(null), configurationError=useRef('');
 if(!service.current && !configurationError.current) {
  try {const repo=createSharedRepository();if(!repo)throw new Error('공유 저장소 URL이 설정되지 않았습니다. VITE_GOOGLE_SCRIPT_URL을 설정해 주세요.');service.current=new TripService(repo);}
  catch(e){configurationError.current=(e as Error).message;}
 }
 const [state,setState]=useState<State>(emptyState),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const active=useRef(true), loadInFlight=useRef(false);
 const [refreshEpoch,setRefreshEpoch]=useState(0);
 function cache(s:State){try{localStorage.setItem('shanghai-trip-expense:shared-cache:v1',JSON.stringify(s));}catch{/* cache failure never undoes an acknowledged shared save */}}
 async function refresh(){
  if(loadInFlight.current||service.current?.busy||service.current?.pending)return;
  if(!service.current){setLoading(false);setError(configurationError.current);return;}
  loadInFlight.current=true;setLoading(true);setError('');
  try{const result=await service.current.load();if(active.current){setState(result.state);setLoaded(true);setRefreshEpoch(value=>value+1);cache(result.state);}}
  catch{if(active.current){setLoaded(false);setError('공유 데이터를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');}}
  finally{loadInFlight.current=false;if(active.current)setLoading(false);}
 }
 useEffect(()=>{active.current=true;void refresh();return()=>{active.current=false;};},[]);
 useEffect(()=>{if(status!=='저장 완료')return;const timer=setTimeout(()=>setStatus(''),3000);return()=>clearTimeout(timer);},[status]);
 async function perform(action:(state:State)=>State, requireRevision=false):Promise<boolean>{
  const current=service.current;
  if(!current||!loaded||current.busy||loadInFlight.current)return false;
  setBusy(true);setStatus('저장 중...');setError('');
  try{const result=await current.save(action,requireRevision);setState(result.snapshot.state);setRefreshEpoch(value=>value+1);cache(result.snapshot.state);setStatus('저장 완료');if(result.refreshFailed)setError('저장은 완료됐지만 최신 재조회에 실패했습니다. 새로고침으로 확인해 주세요.');return true;}
  catch(e){if(current.snapshot)setState(current.snapshot.state);setStatus('저장 실패');setError(current.pending?'저장에 실패했습니다. 입력내용을 유지했습니다. 인터넷 연결을 확인하고 아래 저장 재시도를 눌러주세요.':(e as Error).message+' 입력내용을 유지했습니다. 확인 후 다시 시도해주세요.');return false;}
  finally{setUncertain(Boolean(current.pending));setBusy(false);}
 }
 return {s:state,loaded,loading,busy,uncertain,error,setError,status,refresh,perform,refreshEpoch};
}
