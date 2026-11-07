import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { flushSync } from 'react-dom';
export function ThemeToggle() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('flowstate-theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } });
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('flowstate-theme',theme);}catch{/* session-only fallback */}},[theme]);
  return <button className="theme-toggle" aria-label={`Switch to ${theme==='dark'?'light':'dark'} mode`} onClick={()=>{
    const change=()=>flushSync(()=>setTheme(theme==='dark'?'light':'dark'));
    const doc=document as Document & {startViewTransition?:(fn:()=>void)=>unknown};
    if(doc.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches)doc.startViewTransition(change);else change();
  }}>{theme==='dark'?<Sun size={16}/>:<Moon size={16}/>}<span>{theme==='dark'?'Light':'Dark'} mode</span></button>;
}
