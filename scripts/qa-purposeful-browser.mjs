import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const task = '상대가 말한 고민을 내 말로 짧게 되짚은 뒤, 내가 이해한 내용이 맞는지 한 번 확인하고 상대의 대답을 기다려 보세요. 조언하거나 신앙 이야기를 덧붙이기 전에 지금 가장 마음에 걸리는 일이 무엇인지 물어보세요.';
export const report = `## 한줄 평가\n관찰 근거를 더 모아야 합니다.\n## 관찰한 강점\n판단 근거가 부족합니다.\n## 다음에 바꿔볼 점\n판단 근거가 부족합니다.\n## 문제 발화 교정\n판단 근거가 부족합니다.\n## 다음 훈련 과제\n- ${task}`;
export const session = {personaId:'kim-sihyun',relationship:'casual_friend',setting:'cafe_catchup',goal:'listen_and_understand'};
export async function fixture(root) {
 const out=join(root,'.omo/evidence/purposeful-persona-training'), tempRoot=join(root,'.omo/tmp/task5');
 await mkdir(out,{recursive:true}); await mkdir(tempRoot,{recursive:true});
 const temp=await mkdtemp(join(tempRoot,'run-')); const calls=[]; let mode='ok', log='', release, child;
 const now=new Date().toISOString();
 const db={users:[{id:'task5',provider:'dev',providerId:'dev@example.local',email:'dev@example.local',displayName:'QA',role:'user',profile:{name:'QA'},createdAt:now}],conversations:['full','legacy','missing'].map((id,i)=>({id,userId:'task5',session,messages:[{role:'assistant',content:'OLD_TRANSCRIPT: 요즘 무엇이 마음에 걸려?'},{role:'user',content:'이전 연습 질문'}],feedbackText:id==='legacy'?'## 한줄 평가\n이전 형식 보고서입니다.':report,status:'finished',createdAt:new Date(Date.now()-i*1000).toISOString(),updatedAt:now})),usageEvents:[],appFeedbacks:[],settings:{ai:{chat:{model:'gpt-6-luna'},feedback:{model:'gpt-5.4-mini'}}}};
 await writeFile(join(temp,'db.json'),JSON.stringify(db));
 const provider=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c; const payload=JSON.parse(body); calls.push(payload); if(mode==='wait')await new Promise(r=>release=r); if(mode==='fail'){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'fixture unavailable'}}));return;}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:payload.model==='gpt-5.4-mini'?report:'요즘 취업 준비가 막막해서 잠도 잘 못 자겠어.'}]}],usage:{input_tokens:10,output_tokens:10}}));});
 provider.listen(0,'127.0.0.1');await once(provider,'listening');
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 const url=`http://127.0.0.1:${port}`;
 await writeFile(join(temp,'preload.mjs'),`const original=fetch;globalThis.fetch=(url,options)=>{if(['https://api.openai.com/v1/responses','https://api.anthropic.com/v1/messages'].includes(String(url)))return original('http://127.0.0.1:${provider.address().port}',options);throw Error('External network blocked in task5');};`);
 child=spawn(process.execPath,['--import',pathToFileURL(join(temp,'preload.mjs')).href,'server.js'],{cwd:root,env:{...process.env,NODE_ENV:'production',ENABLE_DEV_LOGIN:'true',SESSION_SECRET:'synthetic-task5-local-only',OPENAI_API_KEY:'fixture',ANTHROPIC_API_KEY:'fixture',PORT:String(port),HOST:'127.0.0.1',STORAGE_DIR:temp,SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',LANGFUSE_PUBLIC_KEY:'',LANGFUSE_SECRET_KEY:'',LANGFUSE_ENABLED:'false',OPENAI_CHAT_MODEL:'gpt-6-luna',OPENAI_FEEDBACK_MODEL:'gpt-5.4-mini',RATE_LIMIT_MUTATIONS_PER_WINDOW:'1000'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',c=>log+=c);child.stderr.on('data',c=>log+=c);
 for(let i=0;i<100;i++){try{const ready=await fetch(url+'/healthz'); if(ready.ok)break; if(i===0)console.log('readiness status',ready.status);}catch(e){if(i===0)console.log('readiness error',e.message,e.cause?.message);}if(i===99||child.exitCode!==null){ child.kill(); provider.closeAllConnections(); provider.close(); await writeFile(join(out,'task-5-readiness-failure.log'),log); await rm(temp,{recursive:true,force:true}); throw Error('fixture failed readiness: '+log); }await new Promise(r=>setTimeout(r,100));}
 return {url,temp,calls,setMode(value){mode=value;if(value!=='wait')release?.();},async disk(){return JSON.parse(await readFile(join(temp,'db.json'),'utf8'));},async close(){release?.();if(child.exitCode===null){child.kill();await once(child,'exit');}provider.closeAllConnections();await new Promise(r=>provider.close(r));await writeFile(join(out,'task-5-server.log'),log);assert.ok(temp.startsWith(tempRoot));await rm(temp,{recursive:true,force:true});await assert.rejects(fetch(url+'/healthz',{signal:AbortSignal.timeout(1000)}));return {serverExited:true,providerClosed:true,tempRemoved:true,loopbackClosed:true};}};
}

async function waitFor(page, predicate) {
 for(let i=0;i<160;i++){if(await page.evaluate(predicate))return;await new Promise(r=>setTimeout(r,50));}
 throw Error('UI readiness timeout: '+await page.evaluate(()=>document.body.innerText));
}
export async function runBrowser({baseline=false}={}) {
 const {loadOmowright}=await import('file:///C:/Users/WISH/.codex/plugins/cache/sisyphuslabs/omo/5.1.33/skills/browser/scripts/omowright.mjs');
 const {omowright}=await loadOmowright(); const root=process.cwd(), fx=await fixture(root);
 const profile=await mkdtemp(join(root,'.omo/tmp/task5/profile-')); let browser,page; const results=[],captures=[];
 const out=join(root,'.omo/evidence/purposeful-persona-training'); let cleanup, complete=false, failure;
 const passed=(scenario,observable)=>{results.push({scenario,invocation:'node scripts/qa-purposeful-browser.mjs --run',observable,passed:true});console.log('PASS',scenario);};
 try {
 browser=await omowright.connectPipe({browserPath:'C:/Program Files/Google/Chrome/Application/chrome.exe',browserArgs:['--headless','--no-first-run','--disable-background-networking',`--user-data-dir=${profile}`],storageRoot:profile});
 const isolatedTab=async()=>{const p=await browser.newTab('about:blank');const routes=omowright.createRoutes(p);await routes.route(/.*/,route=>route.request.url.startsWith(fx.url+'/')?route.continue():route.abort());await p.goto(fx.url);return p;};
 page=await isolatedTab(); await omowright.emulate(page,'iphone-14');
 const click=async(label,index=0,target=page)=>{await target.cdp.send('Page.bringToFront',{},await target.resolveSessionId());const snap=omowright.compactSnapshot(await target.snapshot()); const rows=snap.split('\n').filter(row=>row.includes('button "'+label+'"'));const ref=rows[index]?.match(/\[ref=(\w+)\]/)?.[1];if(ref){await target.locator(ref).click();return;}
 const selector=await target.evaluate(({label,index})=>{let el=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===label)[index];if(!el)return '';const path=[];while(el&&el!==document.body){path.unshift(el.tagName.toLowerCase()+':nth-child('+([...el.parentElement.children].indexOf(el)+1)+')');el=el.parentElement;}return 'body > '+path.join(' > ');},{label,index});assert.ok(selector,'missing button '+label+'\n'+snap);await target.locator(selector).click();};
 const text=()=>page.evaluate(()=>document.body.innerText);
 const focus=async expected=>assert.equal(await page.evaluate(value=>document.body.innerText.includes(value),task),expected,'task visibility');
 const ready=()=>waitFor(page,()=>document.querySelector('textarea')&&!document.querySelector('textarea').disabled);
 const send=async value=>{await page.fill('textarea',value);await click('전송');await ready();};
 const dismiss=async()=>{if((await text()).includes('나중에'))await click('나중에');};
 const begin=async()=>{await dismiss();await click('내용 확인');await click('확인하고 시작');await ready();};
 const history=async()=>{await click('기록');if((await text()).includes('대화 화면을 잠시 벗어날까요?'))await click('이동하기');await waitFor(page,()=>document.body.innerText.includes('같은 설정으로 다시'));};
 const api=async(path,method='GET',body)=>page.evaluate(async({path,method,body})=>{const token=document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/)?.[1];const r=await fetch(path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':decodeURIComponent(token||'')},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};},{path,method,body});
 const capture=async(name,matrix=true)=>{
  await page.cdp.send('Page.bringToFront',{},await page.resolveSessionId());await dismiss();
  for(const device of matrix?['iphone-14','desktop-1440']:['iphone-14']){
   await omowright.emulate(page,device);
   for(const scheme of matrix?['light','dark']:['light']){
    const sid=await page.resolveSessionId();await page.cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme},{name:'prefers-reduced-motion',value:'reduce'}]},sid);
    for(const end of [false,true]){
     await page.evaluate(end=>{document.querySelectorAll('main, main > section, [data-slot="card-content"]').forEach(e=>{if(e.scrollHeight>e.clientHeight)e.scrollTop=end?e.scrollHeight:0;});},end);
     const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth,background:getComputedStyle(document.body).backgroundColor,scheme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}));
     assert.equal(geometry.width,device==='iphone-14'?390:1440);assert.equal(geometry.height,device==='iphone-14'?844:900);assert.equal(geometry.overflow,false);
     const path=`browser/task-5-flow/${name}-${device}-${scheme}-${end?'end':'top'}.png`;await writeFile(join(out,path),await page.screenshot({timeout:10000}));captures.push({page:name,path,...geometry,scroll:end?'end':'top'});
    }
   }
  }
  await omowright.emulate(page,'iphone-14');
 };
 await waitFor(page,()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('로그인하고 첫 연습하기')&&!b.disabled));
 await click('로그인하고 첫 연습하기');await click('개발용 로그인');await waitFor(page,()=>document.body.innerText.includes('추천 훈련 살펴보기'));
 if(baseline){await history();await click('같은 설정으로 다시');await waitFor(page,()=>document.body.innerText.includes('선택한 훈련'));await focus(false);await capture('baseline-review',false);passed('baseline loses report next task','review task absent');return;}
 await click('추천 훈련 살펴보기');await begin();
 await page.fill('textarea','조합 중인 한글');const beforeIME=fx.calls.length;
 await page.evaluate(()=>{const t=document.querySelector('textarea');t.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'글'}));t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true,bubbles:true,cancelable:true}));t.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'글'}));});
 assert.equal(fx.calls.length,beforeIME);assert.equal(await page.evaluate(()=>document.querySelector('textarea').value),'조합 중인 한글');passed('IME Enter','zero provider calls; composed draft retained');
 fx.setMode('fail');await send('실패해도 남아 있어야 하는 질문');assert.equal(await page.evaluate(()=>document.querySelector('textarea').value),'실패해도 남아 있어야 하는 질문');
 let disk=await fx.disk(), active=disk.conversations.find(c=>c.status==='active');assert.equal(active.messages.length,1);await capture('provider-error');passed('provider failure preserves editable draft','draft exact; canonical messages=1; composer enabled');
 fx.setMode('ok');await click('전송');await ready();assert.equal(await page.evaluate(()=>document.querySelector('textarea').value),'');assert.equal((await fx.disk()).conversations.find(c=>c.id===active.id).messages.length,3);passed('resend commits once','canonical messages=3; draft cleared');
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0])==='/api/chat'){window.fetch=original;await original(...args);throw new TypeError('Failed to fetch');}return original(...args);};});
 await send('응답을 잃어도 두 번 저장하지 않는 질문');assert.equal(await page.evaluate(()=>document.querySelector('textarea').value),'');assert.equal((await fx.disk()).conversations.find(c=>c.id===active.id).messages.length,5);passed('lost response reconciles canonical history','draft cleared after owned GET; canonical messages=5 exactly');
 await click('피드백');await click('피드백 받기');await waitFor(page,()=>document.body.innerText.includes('전체 피드백 읽기'));await capture('feedback');
 await page.locator('summary').click();await capture('feedback-report');assert.ok((await text()).includes('관찰한 강점'));assert.equal(await page.evaluate(()=>document.querySelector('.feedback-content script')!==null),false);passed('full feedback report retained','all report sections visible; escaped DOM');
 const finishedId=active.id, callsBefore=fx.calls.length;
 await click('이 과제로 다시 연습');await waitFor(page,()=>document.body.innerText.includes('선택한 훈련'));await focus(true);assert.equal(fx.calls.length,callsBefore);await capture('review');
 await begin();disk=await fx.disk();active=disk.conversations.find(c=>c.status==='active');assert.notEqual(active.id,finishedId);assert.equal(active.messages.length,1);assert.deepEqual(Object.fromEntries(Object.keys(session).map(k=>[k,active.session[k]])),session);assert.ok(!JSON.stringify(fx.calls.at(-1)).includes(task));assert.ok(!JSON.stringify(fx.calls.at(-1)).includes('OLD_TRANSCRIPT'));
 await page.locator('summary').press('Enter');await waitFor(page,()=>Boolean(document.querySelector('details[open]')));await focus(true);assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');await capture('chat-help');
 await page.locator('summary').press('Enter');assert.equal(await page.evaluate(()=>document.querySelector('details').open),false);await page.locator('summary').press('Enter');passed('feedback fresh practice and keyboard help','same task on review/help; new ID, one opening, same context; no task/old transcript in provider prompt; summary retains focus');
 // The other tab operates on the same owned active conversation; the first becomes stale.
 const other=await isolatedTab();await waitFor(other,()=>document.body.innerText.includes('추천 훈련 살펴보기'));await click('기록',0,other);await waitFor(other,()=>document.body.innerText.includes('대화 이어가기'));await click('대화 이어가기',0,other);await waitFor(other,()=>document.querySelector('textarea')&&!document.querySelector('textarea').disabled);await other.fill('textarea','다른 탭에서 먼저 보낸 질문');await click('전송',0,other);await waitFor(other,()=>document.querySelector('textarea')&&!document.querySelector('textarea').disabled);
 await send('오래된 탭의 새 질문');assert.equal(await page.evaluate(()=>document.querySelector('textarea').value),'오래된 탭의 새 질문');assert.ok((await text()).includes('다른 탭에서 먼저 보낸 질문'));assert.equal((await fx.disk()).conversations.find(c=>c.id===active.id).messages.length,3);await capture('stale-reloaded');await click('전송');await ready();assert.equal((await fx.disk()).conversations.find(c=>c.id===active.id).messages.length,5);passed('stale tab reload then resend','foreign tab turn visible, unsent draft retained, canonical history 3 then 5');
 await history();await capture('history-list');await click('같은 설정으로 다시');await waitFor(page,()=>document.body.innerText.includes('선택한 훈련'));await focus(true);await capture('history-list-review');await begin();await page.locator('summary').click();await focus(true);await capture('history-list-help');passed('history list full detail repractice','task survived list missing report → owned detail GET → review → fresh chat help');
 await history();await click('상세',(await fx.disk()).conversations.filter(c=>c.status==='active').length);await waitFor(page,()=>document.body.innerText.includes('대화 전문'));await capture('history-detail');
 await click('같은 설정으로 다시 훈련');await waitFor(page,()=>document.body.innerText.includes('선택한 훈련'));await focus(true);await capture('history-detail-review');await begin();await page.locator('summary').click();await focus(true);await capture('history-detail-help');passed('history detail repractice','same task in review and fresh chat help');
 await history();
 // Fetch failure after a list row becomes deleted must not start a new practice.
 const listBefore=(await api('/api/conversations')).data.conversations;
 const missingIndex=listBefore.filter(c=>c.status==='finished').findIndex(c=>c.id==='missing');
 assert.ok(missingIndex>=0);assert.equal((await api('/api/conversations/missing','DELETE')).status,200);
 const countBeforeMissing=(await fx.disk()).conversations.length;
 await click('같은 설정으로 다시',missingIndex);await waitFor(page,()=>document.body.innerText.includes('해당 훈련 기록을 찾지 못했습니다'));
 assert.equal((await fx.disk()).conversations.length,countBeforeMissing);assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='필터 적용').disabled),false);await capture('missing-list-error');passed('deleted list detail','recoverable 404; no new conversation; busy released');
 await click('상세',listBefore.findIndex(c=>c.id==='missing'));await waitFor(page,()=>document.body.innerText.includes('훈련 기록을 찾지 못했습니다. 기록 목록'));
 await capture('missing-detail');assert.ok(!(await text()).includes('기록을 불러오는 중입니다.'));passed('missing history detail','loading replaced by explicit missing record message');
 await history();
 const list=(await api('/api/conversations')).data.conversations;
 await click('같은 설정으로 다시',list.filter(c=>c.status==='finished').findIndex(c=>c.id==='legacy'));await waitFor(page,()=>document.body.innerText.includes('선택한 훈련'));await focus(false);assert.ok((await text()).includes('조언보다 먼저, 한 번 더 듣기'));await capture('legacy-review');await begin();await page.locator('summary').click();await focus(false);assert.ok((await text()).includes('조언보다 먼저, 한 번 더 듣기'));passed('legacy report fallback','no prior task; goal guide on review/help');
 // Reset retains saved history but clears controller-only focus.
 await history();await click('같은 설정으로 다시');await waitFor(page,()=>document.body.innerText.includes('선택한 훈련'));await focus(true);await click('처음');await click('추천 훈련 살펴보기');await focus(false);passed('reset and beginner clear task','review uses beginner guide with no prior focus');
 await history();await click('같은 설정으로 다시');await waitFor(page,()=>document.body.innerText.includes('선택한 훈련'));await focus(true);await click('훈련');await click('상대와 상황 직접 고르기');await click('랜덤 선택');await click('다음');await click('랜덤 선택');await click('다음');await focus(false);passed('unrelated new and random clear task','random context review has no prior focus');
 await history();await click('같은 설정으로 다시');await waitFor(page,()=>document.body.innerText.includes('선택한 훈련'));await focus(true);await click('설정');await click('로그아웃');await waitFor(page,()=>document.body.innerText.includes('로그인하고 첫 연습하기'));await click('로그인하고 첫 연습하기');await click('개발용 로그인');await waitFor(page,()=>document.body.innerText.includes('추천 훈련 살펴보기'));await click('추천 훈련 살펴보기');await focus(false);passed('logout clears task','login restored, fresh review has only goal guide');
 await history();await page.fill('input[placeholder="검색"]','존재하지않는검색어');await click('필터 적용');await waitFor(page,()=>document.body.innerText.includes('조건에 맞는 훈련 기록이 없습니다.'));await capture('empty-history');passed('empty history','explicit empty state visible');
 await page.fill('input[placeholder="검색"]','');await click('필터 적용');await waitFor(page,()=>document.body.innerText.includes('같은 설정으로 다시'));
 // Hold the actual owned GET to verify loading, then release the same real response.
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).startsWith('/api/conversations/')){window.fetch=original;const response=await original(...args);await new Promise(resolve=>window.releaseTask5=resolve);return response;}return original(...args);};});
 await click('상세',0);await waitFor(page,()=>document.body.innerText.includes('기록을 불러오는 중입니다.'));await capture('loading-detail');await page.evaluate(()=>window.releaseTask5());await waitFor(page,()=>document.body.innerText.includes('대화 전문'));passed('detail loading to success','loading visible while owned request held; successful detail after release');
 assert.equal((await fx.disk()).conversations.find(c=>c.id===finishedId).messages.length,5);passed('prior report and history retained','original completed session still has exact 5 canonical messages');
 assert.ok(fx.calls.filter(p=>p.model==='gpt-6-luna').every(p=>!JSON.stringify(p).includes(task)&&!JSON.stringify(p).includes('OLD_TRANSCRIPT')));passed('focus excluded from persona prompts','all actual fixture chat payloads exclude coaching task and old transcript');complete=true;
 } catch(error){failure=error.message;if(page)await writeFile(join(out,'browser/task-5-flow/failure.png'),await page.screenshot({timeout:10000})).catch(()=>{});throw error;}
 finally {await browser?.close();await rm(profile,{recursive:true,force:true});cleanup=await fx.close();await writeFile(join(out,baseline?'task-5-baseline.json':'task-5-browser.json'),JSON.stringify({complete,failure,results,captures,cleanup,sourceHashes:Object.fromEntries(await Promise.all(['src/App.jsx','src/hooks/useAppController.js','src/lib/feedbackTakeaway.js','scripts/qa-purposeful-browser.mjs','public/index.html',...Array.from((await readFile(join(root,'public/index.html'),'utf8')).matchAll(/(?:src|href)="(\/assets\/index-[^"]+)"/g),m=>'public'+m[1])].map(async p=>[p,createHash('sha256').update(await readFile(join(root,p))).digest('hex')]))),externalModelCalls:0,note:'Dark preference captured against existing theme; no separate dark palette exists.'},null,2));console.log(JSON.stringify({executed:results.length,captures:captures.length,cleanup}));}
}
if(process.argv.includes('--baseline')||process.argv.includes('--run')) await runBrowser({baseline:process.argv.includes('--baseline')});
