import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results/product/live',{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:'test-results/product/live',size:{width:1600,height:1000}}});
const page=await context.newPage();
await page.goto('http://127.0.0.1:5173/operations');
await page.waitForTimeout(700);
for(const [title,skill] of [['Research the next team workspace','Research'],['Build the approved workspace plan','Code'],['Review the proposed changes','Review']]){
 await page.getByLabel('Task description').pressSequentially(title,{delay:22});
 await page.getByLabel('Required skill').selectOption(skill);
 await page.getByRole('button',{name:'Add task',exact:true}).click();
 await page.waitForTimeout(500);
}
await page.getByRole('button',{name:'Switch to light mode'}).click();
await page.waitForTimeout(900);
await page.getByLabel('Execution mode').selectOption('full-access');
await page.waitForTimeout(900);
await page.getByLabel('Execution mode').selectOption('sandbox');
await page.getByRole('button',{name:'Switch to dark mode'}).click();
await page.locator('main').evaluate(e=>e.scrollTo({top:520,behavior:'smooth'}));
await page.waitForTimeout(1200);
await page.locator('main').evaluate(e=>e.scrollTo({top:0,behavior:'smooth'}));
await page.waitForTimeout(1000);
const video=page.video();
await context.close();
await video.saveAs('test-results/product/live-ui.webm');
await browser.close();
console.log('Recorded actual task entry, routing, theme and permission controls.');
