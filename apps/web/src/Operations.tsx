import { useEffect, useState } from 'react';
import { GitBranch, Plus, ArrowRight, Bot, Check, Pause, Play } from 'lucide-react';
import { Reveal } from './Reveal';
import './operations.css';
import { request, useConnection } from './api';
import { useQuery } from '@tanstack/react-query';
type Agent = { id: string; name: string; skill: string; enabled: boolean };
type Task = { id: string; title: string; skill: string; agent: string; reason: string; done: boolean; job?: string };
const initial: Agent[] = [
  { id: 'research', name: 'Research specialist', skill: 'Research', enabled: true },
  { id: 'build', name: 'Implementation specialist', skill: 'Code', enabled: true },
  { id: 'review', name: 'Review specialist', skill: 'Review', enabled: true },
];
export function Operations() {
  const [agents, setAgents] = useState<Agent[]>(initial);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState('');
  const [title, setTitle] = useState('');
  const [skill, setSkill] = useState('Code');
  const [auto, setAuto] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [agentName, setAgentName] = useState('');
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem('flowstate-dispatch-v1') || 'null');
      if (saved && Array.isArray(saved.agents) && Array.isArray(saved.tasks)) { setAgents(saved.agents); setTasks(saved.tasks); }
    } catch { setError('Saved dispatch data could not be loaded'); }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) { try { localStorage.setItem('flowstate-dispatch-v1', JSON.stringify({ agents, tasks })); } catch { setError('Browser storage is unavailable; this session will not persist'); } } }, [agents, tasks, loaded]);
  const route = (task: Task, queue: Task[]): Task => {
    const eligible = agents.filter(a => a.enabled && a.skill === task.skill);
    const load = (id: string) => queue.filter(t => !t.done && t.agent === id).length;
    eligible.sort((a,b) => load(a.id) - load(b.id) || a.name.localeCompare(b.name));
    const agent = eligible[0];
    return { ...task, agent: agent?.id || '', reason: agent ? `${task.skill} matches ${agent.name}. Lowest eligible queue: ${load(agent.id)} open tasks.` : `No enabled specialist matches ${task.skill}. Manual assignment required.` };
  };
  const add = () => {
    if (!title.trim()) return;
    let task: Task = { id: crypto.randomUUID(), title: title.trim(), skill, agent: '', reason: 'Waiting for assignment', done: false };
    if (auto) task = route(task, tasks);
    setTasks([...tasks, task]); setSelected(task.id); setTitle('');
  };
  const current = tasks.find(t => t.id === selected);
  const token = useConnection(state => state.token);
  const [launching, setLaunching] = useState(false);
  const job = useQuery({queryKey:['agent-job',current?.job,token],enabled:!!current?.job&&!!token,queryFn:()=>request(`/agents/jobs/${current!.job}`) as Promise<{status:string;result:string}>,refetchInterval:2000});
  const execute = async () => {
    if (!current || !current.agent) return;
    const id=current.id;
    setLaunching(true);setError('');
    try { const result=await request('/agents/jobs','POST',{specialist:agents.find(a=>a.id===current.agent)?.name,prompt:current.title}) as {id:string};setTasks(previous=>previous.map(t=>t.id===id?{...t,job:result.id}:t)); }
    catch(e){setError(e instanceof Error?e.message:'Execution failed');}finally{setLaunching(false);}
  };
  const update = (patch: Partial<Task>) => setTasks(tasks.map(t => t.id === selected ? { ...t, ...patch } : t));
  return <section className="ops">
    <div className="ops-heading"><div><p>Workspace / Dispatch</p><h1>Give every task a direction.</h1><p>Plan the work. Choose the specialist. Keep the decision visible.</p></div><span className="local-badge">Local assignment planner</span></div>
    <div className="ops-metrics"><div><span>Open tasks</span><strong>{tasks.filter(t=>!t.done).length.toString().padStart(2,'0')}</strong></div><div><span>Specialist profiles</span><strong>{agents.length.toString().padStart(2,'0')}</strong></div><div><span>Awaiting assignment</span><strong>{tasks.filter(t=>!t.agent&&!t.done).length.toString().padStart(2,'0')}</strong></div><div><span>Routing policy</span><strong className="policy">Skill → queue size</strong></div></div>
    <div className="dispatch-map"><div><GitBranch/><b>Task intent</b><small>Explicit skill</small></div><ArrowRight/><div className="map-router"><b>Auto-router</b><small>Match · balance · explain</small></div><ArrowRight/><div><Bot/><b>Specialist profile</b><small>Review assignment locally</small></div></div>
    <div className="ops-grid"><section className="ops-panel roster"><div className="panel-title"><h2>Subagents</h2><span>{agents.length} profiles</span></div><p className="ops-note">Profiles plan delegation. No agent processes are started here.</p>
      {agents.map(a=><div className="agent-row" key={a.id}><div className="agent-avatar"><Bot size={18}/></div><div><b>{a.name}</b><small>{a.skill} · {tasks.filter(t=>t.agent===a.id&&!t.done).length} assigned</small></div><button aria-label={`${a.enabled?'Pause':'Enable'} ${a.name}`} onClick={()=>setAgents(agents.map(x=>x.id===a.id?{...x,enabled:!x.enabled}:x))}>{a.enabled?<Pause size={14}/>:<Play size={14}/>}</button></div>)}
      <form className="agent-form" onSubmit={e=>{e.preventDefault();if(agentName.trim()){setAgents([...agents,{id:crypto.randomUUID(),name:agentName.trim(),skill,enabled:true}]);setAgentName('');}}}><label>New specialist<input maxLength={80} value={agentName} onChange={e=>setAgentName(e.target.value)} placeholder="Specialist name"/></label><small>Uses the selected task skill: {skill}</small><button disabled={!agentName.trim()}><Plus size={14}/> Add subagent profile</button></form>
    </section><section className="ops-panel queue"><div className="panel-title"><h2>Task queue</h2><span>{tasks.length} total</span></div>
      <form className="task-composer" onSubmit={e=>{e.preventDefault();add();}}><label>Task description<input maxLength={240} value={title} onChange={e=>setTitle(e.target.value)} placeholder="What needs to happen next?"/></label><div><label>Required skill<select value={skill} onChange={e=>setSkill(e.target.value)}>{['Code','Research','Review'].map(s=><option key={s}>{s}</option>)}</select></label><label className="auto-toggle"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> Auto-route</label><button disabled={!title.trim()} type="submit">Add task <ArrowRight size={16}/></button></div></form>
      <div className="task-list">{tasks.length===0?<div className="queue-empty"><GitBranch size={32}/><h3>Your next handoff starts here</h3><p>Add a task and choose its skill. The router explains who gets it and why.</p></div>:tasks.map((t,i)=><button key={t.id} className={`task-row ${selected===t.id?'selected':''}`} onClick={()=>setSelected(t.id)}><span className="task-number">{String(i+1).padStart(2,'0')}</span><div><b>{t.title}</b><small>{agents.find(a=>a.id===t.agent)?.name||'Unassigned'} · {t.skill}</small></div><span className={`task-state ${t.done?'complete':''}`}>{t.done?'Reviewed':t.agent?'Assigned':'Queued'}</span></button>)}</div>
    </section><section className="ops-panel inspector" key={selected}><div className="panel-title"><h2>Assignment detail</h2><GitBranch size={16}/></div>{current?<><span className="local-badge">{current.skill}</span><h3>{current.title}</h3><div className="routing-reason"><small>Why this route</small><p>{current.reason}</p></div><label>Assign to<select value={current.agent} onChange={e=>update({agent:e.target.value,reason:'Manually assigned by the local user',done:false})}><option value="">Unassigned</option>{agents.filter(a=>a.enabled).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><button onClick={()=>update(route(current,tasks.filter(t=>t.id!==current.id)))}>Re-evaluate route <GitBranch size={14}/></button><button disabled={!current.agent||current.done} onClick={()=>update({done:true})}><Check size={14}/> Mark assignment reviewed</button><p className="ops-note">Reviewed means you accepted the assignment. It does not mean an AI agent executed the task.</p></>:<div className="queue-empty"><Bot size={32}/><p>Select a task to inspect its route and change its owner.</p></div>}</section></div>
    <Reveal><section className="ops-panel routing-log"><div className="panel-title"><h2>Routing decisions</h2><span>Explainable by design</span></div>{tasks.length?tasks.map(t=><div key={t.id}><span>{t.skill}</span><b>{t.title}</b><p>{t.reason}</p></div>):<p>Decisions appear as you add or reassign tasks.</p>}</section></Reveal>
    {current&&<section className="ops-panel routing-log"><div className="panel-title"><h2>Agent execution</h2><span>Codex · read-only analysis</span></div><p>Runs the selected task on the API host using its signed-in Codex runtime. This does not perform desktop actions or send Switch messages.</p><button disabled={!token||!current.agent||!!current.job||launching} onClick={execute}>{launching?'Submitting…':'Run assigned agent'}</button>{!token&&<p>Connect your device token in Settings to run agents.</p>}{job.data&&<><p role="status">{job.data.status}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{job.data.result}</pre></>}{job.error&&<p role="alert">{job.error.message}</p>}</section>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
