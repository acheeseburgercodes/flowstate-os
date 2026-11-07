import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
const env = Object.fromEntries((await readFile('../../.env','utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const out='test-results/product';
await mkdir(out,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/operations');
await page.evaluate(async token=>{const {useConnection}=await import('/src/api.ts');useConnection.getState().setToken(token)},env.FLOWSTATE_API_TOKEN);
async function shot(name){await page.waitForTimeout(800);await page.screenshot({path:`${out}/${name}.png`});}
await shot('overview');
for(const [title,skill] of [['Give three concise steps for reviewing a shared workspace plan.','Research'],['Suggest two read-only checks for validating a workspace launcher.','Code'],['Identify one privacy boundary when sharing workspace results in chat.','Review']]){
 await page.getByLabel('Task description').fill(title);
 await page.getByLabel('Required skill').selectOption(skill);
 await page.getByRole('button',{name:'Add task',exact:true}).click();
}
await page.getByRole('button',{name:'Run assigned queue',exact:true}).click();
await page.waitForFunction(()=>JSON.parse(localStorage.getItem('flowstate-dispatch-v1')).tasks.every(t=>t.job),{},{timeout:30000});
await shot('dispatch');
const tasks=await page.evaluate(()=>JSON.parse(localStorage.getItem('flowstate-dispatch-v1')).tasks);
for(const task of tasks){
 let job;
 for(let i=0;i<100;i++){
  job=await page.evaluate(async id=>{const {request}=await import('/src/api.ts');return request(`/agents/jobs/${id}`)},task.job);
  if(['completed','failed','interrupted'].includes(job.status))break;
  await page.waitForTimeout(2000);
 }
 if(job.status!=='completed')throw new Error(`Agent job ${job.status}: ${job.result}`);
}
await page.getByRole('heading',{name:'Agent execution',exact:true}).scrollIntoViewIfNeeded();
await shot('answer');
await page.getByRole('button',{name:'Switch to light mode'}).click();
await page.locator('main').evaluate(e=>e.scrollTo({top:0,behavior:'instant'}));
await shot('light');
await page.locator('nav a[href="/collaboration"]').click();
await page.getByText('connected',{exact:true}).waitFor({timeout:15000});
await shot('switch');
if(errors.length)throw new Error(errors.join('\n'));
await browser.close();
console.log('Captured real UI. All three assigned jobs completed; Switch connected.');
