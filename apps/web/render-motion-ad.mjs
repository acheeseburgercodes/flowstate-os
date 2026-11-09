import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const output=path.resolve('test-results/product/FlowState-OS-motion-ad.mp4');
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1920,height:1200}});
await page.goto(pathToFileURL(path.resolve('test-results/product/FlowState-interactive-preview.html')).href);
await page.waitForFunction(()=>window.adReady);
await page.evaluate(()=>window.pauseAd());
if(process.argv.includes('--stills')){
 for(const t of [2,8,14,20,26,33]){
  await page.evaluate(t=>window.renderFrame(t,true),t);
  await page.locator('canvas').screenshot({path:`test-results/product/ad-still-${t}.png`});
 }
 await browser.close();process.exit(0);
}
const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','mjpeg','-framerate','60','-i','pipe:0','-i',path.resolve('test-results/product/original-instrumental.wav'),'-t','36','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-af','afade=t=out:st=34:d=2','-movflags','+faststart',output],{stdio:['pipe','inherit','inherit']});
const finished=once(ff,'close');ff.stdin.on('error',e=>console.error(e.message));
for(let n=0;n<2160;n++){
 await page.evaluate(t=>window.renderFrame(t,true),n/60);
 const encoded=await page.evaluate(()=>document.querySelector('canvas').toDataURL('image/jpeg',.93).split(',')[1]);
 if(!ff.stdin.write(Buffer.from(encoded,'base64')))await once(ff.stdin,'drain');
 if(n%360===0){await page.locator('canvas').screenshot({path:`test-results/product/motion-preview-${n/360}.png`});console.log(`Rendered ${n/60} / 36 seconds`);}
}
ff.stdin.end();const [code]=await finished;await browser.close();if(code!==0)throw new Error('Encoder failed');console.log(output);
