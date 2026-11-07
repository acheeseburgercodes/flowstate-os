import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const out=path.resolve('test-results/product');
const scenes=[
 ['FlowState OS','A clearer path<br>from intent<br>to action.','Team context. Specialist work. Local control.','dispatch'],
 ['01 / CONNECT','Keep the team<br>in the loop.','Switch connects the shared room.<br>Mattermost verified live.','switch'],
 ['02 / DELEGATE','Three skills.<br>One queue.','Match by skill. Balance the queue.<br>See why each task was assigned.','dispatch'],
 ['03 / EXECUTE','Real agents.<br>Real answers.','Three live tasks completed.<br>Two concurrent, read-only Codex workers.','answer'],
 ['04 / MAKE IT YOURS','Change the mood.<br>Keep your flow.','Warm dark. Cream and violet light.<br>Responsive layouts and reduced-motion support.','light'],
 ['FLOWSTATE OS','Your laptop.<br>Your workspace.','One launcher starts the local stack.<br>Health checks and startup logs included.','overview'],
];
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
for(let i=0;i<scenes.length;i++){
 const [label,title,subtitle,file]=scenes[i];
 const data=(await readFile(`${out}/${file}.png`)).toString('base64');
 await page.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;background:#080a0b;color:#f4f0eb;font-family:'Segoe UI',sans-serif;width:1920px;height:1080px;overflow:hidden}.rail{position:absolute;left:64px;top:64px;width:48px;height:4px;background:#b8a0ff}.copy{position:absolute;left:64px;top:128px;width:410px}small{font-size:20px;color:#b8a0ff;letter-spacing:1px}h1{font-size:66px;font-weight:500;line-height:1.07;letter-spacing:-3px;margin:48px 0 32px}p{font-size:23px;line-height:1.6;color:#b5ada3}img{position:absolute;left:520px;top:110px;width:1344px;height:840px;border-radius:18px;border:1px solid #48413d;box-shadow:0 24px 80px #0008}.foot{position:absolute;bottom:48px;left:64px;right:64px;display:flex;justify-content:space-between;font-size:18px;color:#938b83}.count{color:#b8a0ff}.line{position:absolute;bottom:90px;left:64px;right:64px;height:1px;background:#34302c}</style><div class=rail></div><div class=copy><small>${label}</small><h1>${title}</h1><p>${subtitle}</p></div><img src="data:image/png;base64,${data}"><div class=line></div><div class=foot><span>FlowState OS · Built with Switch</span><span>${i===5?'github.com/acheeseburgercodes/flowstate-os':'Actual application captures · Local Windows setup'}</span><span class=count>0${i+1} / 06</span></div></html>`);
 await page.locator('img').evaluate(image=>image.decode());
 await page.screenshot({path:`${out}/card-${i}.png`});
}
await browser.close();
// Original upbeat instrumental: 112 BPM, soft chords, plucked melody and percussion.
const seconds=39,rate=44100,count=seconds*rate,pcm=Buffer.alloc(count*4),beat=60/112;
const chords=[[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66]];
let seed=42;const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1};
for(let n=0;n<count;n++){
 const t=n/rate,b=Math.floor(t/beat),q=t%beat,c=chords[Math.floor(b/4)%4];
 const kick=.24*Math.sin(2*Math.PI*(48*q+8*(1-Math.exp(-30*q))))*Math.exp(-22*q);
 const snare=b%2?.075*noise()*Math.exp(-35*q):0;
 const hat=.025*noise()*Math.exp(-80*(t%(beat/2)));
 const pad=c.reduce((v,f)=>v+.022*Math.sin(2*Math.PI*f*t),0);
 const f=c[Math.floor(t/(beat/2))%3]*2,pluck=.055*Math.sin(2*Math.PI*f*t)*Math.exp(-8*(t%(beat/2)));
 const bass=.06*Math.sin(2*Math.PI*c[0]/2*t);
 const fade=Math.min(1,t/1.5,(seconds-t)/2);
 const sample=Math.max(-1,Math.min(1,(kick+snare+hat+pad+pluck+bass)*fade));
 pcm.writeInt16LE(Math.round(sample*28000),n*4);pcm.writeInt16LE(Math.round(sample*28000),n*4+2);
}
const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
await writeFile(`${out}/original-instrumental.wav`,Buffer.concat([header,pcm]));
const args=['-y','-hide_banner','-loglevel','error','-filter_complex_threads','2'];
for(let i=0;i<6;i++)args.push('-loop','1','-framerate','60','-t','7','-i',`${out}/card-${i}.png`);
args.push('-i',`${out}/original-instrumental.wav`);
const filters=[];
for(let i=0;i<6;i++)filters.push(`[${i}:v]scale=1920:1080,zoompan=z='1+0.012*on/420':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1920x1080:fps=60,format=yuv420p,settb=AVTB[v${i}]`);
let last='v0';
for(let i=1;i<6;i++){const name=`x${i}`;filters.push(`[${last}][v${i}]xfade=transition=${i%2?'fade':'smoothleft'}:duration=0.6:offset=${(6.4*i).toFixed(1)}[${name}]`);last=name;}
args.push('-filter_complex',filters.join(';'),'-map',`[${last}]`,'-map','6:a','-t','39','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-r','60','-c:a','aac','-b:a','192k','-movflags','+faststart',`${out}/FlowState-OS-product-film.mp4`);
const result=spawnSync('ffmpeg',args,{stdio:'inherit'});
if(result.status!==0)throw new Error('Video rendering failed');
console.log('Rendered 1080p / 60 FPS product advertisement with original music.');
