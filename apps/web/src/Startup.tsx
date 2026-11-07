import { useEffect, useState, type ReactNode } from 'react';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { useConnection } from './api';
import { Layers, CheckCircle, Circle, AlertCircle } from 'lucide-react';
type State = {ready:boolean;failed?:boolean;stage?:string;message?:string;logs:string[]};
export function Startup({children}:{children:ReactNode}){
 const [state,setState]=useState<State>({ready:!isTauri(),stage:'Preparing',logs:[]});
 const [elapsed,setElapsed]=useState(0);
 useEffect(()=>{if(!isTauri())return;let active=true;const started=Date.now();
 let finished=false;
 const poll=async()=>{if(finished)return;try{const next=JSON.parse(await invoke<string>('startup_status')) as State;if(active){if(next.ready){try{const token=await invoke<string>('local_session_token');if(active)useConnection.getState().setToken(token);}catch{/* Manual connection remains available */}finished=true;}setState(next);setElapsed(Math.floor((Date.now()-started)/1000));}}catch{/* Retry partial status writes */}};
 void poll();const timer=setInterval(()=>void poll(),1000);return()=>{active=false;clearInterval(timer)};
 },[]);
 if(state.ready)return <>{children}</>;
 const stages=['Preparing','Docker','Switch','API','Room connection','Ready'];
 return <div className="startup"><div className="startup-card"><Layers size={32}/><p>FlowState OS</p><h1>{state.failed?'Startup needs attention':'Getting your workspace ready'}</h1><p role="status">{state.message||'Checking local services…'}</p><div className="startup-track">{stages.map((stage,index)=><span key={stage} className={state.stage===stage?'current':''}>{state.stage===stage?<span className="startup-spinner"/>:index<stages.indexOf(state.stage||'Preparing')?<CheckCircle/>:<Circle/>}{stage}</span>)}</div><p>{elapsed}s elapsed · {state.stage}</p><details open><summary>Startup log</summary><pre>{state.logs.join('\n')}</pre></details>{state.failed&&<p role="alert"><AlertCircle size={16}/> Resolve the service error, close this window, and double-click Launch FlowState to retry. Logs are in %LOCALAPPDATA%\FlowState\startup.</p>}</div></div>;
}
