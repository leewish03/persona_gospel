#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

if (process.argv[process.argv.indexOf('--case') + 1] === 'persona') {
  const { runPersonaContracts } = await import('./qa-purposeful-persona.mjs');
  await runPersonaContracts();
} else if (process.argv[process.argv.indexOf('--case') + 1] === 'feedback') {
  const { runFeedbackContracts } = await import('./qa-purposeful-feedback.mjs');
  await runFeedbackContracts();
} else if (process.argv[process.argv.indexOf('--case') + 1] === 'config') {
  const { runConfigContracts } = await import('./qa-purposeful-config.mjs');
  await runConfigContracts({ requireRealSdk: true });
} else {
assert.equal(process.argv[process.argv.indexOf('--case')+1], 'history', 'supported case: history');
const root=process.cwd(), evidence=resolve('.omo/evidence/purposeful-persona-training');
await mkdir(evidence,{recursive:true}); await mkdir('.omo/tmp/task1',{recursive:true});
const temp=await mkdtemp(resolve('.omo/tmp/task1/run-'));
const results=[], calls=[]; let child, mode='ok', providerGate=null, storageGate=null, storageMode='error', log='';
function rendezvous() {
 return {arrived:Promise.withResolvers(),released:Promise.withResolvers(),finished:Promise.withResolvers()};
}
async function bounded(promise,label,ms=5000) {
 let timer;
 try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timeout')),ms);})]); }
 finally { clearTimeout(timer); }
}
async function waitForState(check,label) {
 const deadline=Date.now()+5000;
 do { if(await check())return; await new Promise(resolve=>setTimeout(resolve,20)); } while(Date.now()<deadline);
 throw new Error(label+' timeout');
}
const session={personaId:'kim-sihyun',relationship:'casual_friend',setting:'cafe_catchup',goal:'listen_and_understand'};
const history=n=>Array.from({length:n},(_,i)=>({role:i%2?'user':'assistant',content:`발화 ${i}: `+(i===12?'가'.repeat(230)+'정정한 날짜는 목요일.':'내용')+(i===0?'나'.repeat(4100):'')}));
const seeds={h79:history(79),h80:history(80),h81:history(81),large:history(91).map((m,i)=>({...m,content:`대형 ${i}: `+'a'.repeat(4000)})),turn500:history(999),failure:history(3),concurrent:history(3),cancel:history(3),persistence:history(3),capacity:[{role:'assistant',content:'a'.repeat(1060000)},{role:'user',content:'질문'}],feedbackCapacity:[{role:'assistant',content:'b'.repeat(410000)},{role:'user',content:'질문'}],foreign:history(3)};
const now=new Date().toISOString();
const db={users:[{id:'owner',provider:'dev',providerId:'task1@example.local',email:'task1@example.local',displayName:'QA',role:'user',profile:{name:'QA'},createdAt:now}],conversations:Object.entries(seeds).map(([id,messages])=>({id,userId:id==='foreign'?'other':'owner',session,messages,status:'active',createdAt:now,updatedAt:now})),usageEvents:[],appFeedbacks:[],settings:{ai:{chat:{model:'gpt-6-luna'},feedback:{model:'gpt-5.4-mini'}}}};
await writeFile(join(temp,'db.json'),JSON.stringify(db));
const feedback='## 한줄 평가\n관찰 근거를 더 모아야 합니다.\n## 관찰한 강점\n판단 근거가 부족합니다.\n## 다음에 바꿔볼 점\n판단 근거가 부족합니다.\n## 문제 발화 교정\n판단 근거가 부족합니다.\n## 다음 훈련 과제\n- 다음 대화에서 고민을 물어보세요.';
const provider=createServer(async(req,res)=>{
 let body=''; for await(const part of req) body+=part;
 if(req.url.startsWith('/rest/v1/')) {
  if(storageGate && req.method==='POST' && req.url.startsWith('/rest/v1/app_users?')) {
   const gate=storageGate; storageGate=null;
   res.once('close',()=>gate.finished.resolve());
   gate.arrived.resolve();
   return;
  }
  const ok=storageMode==='ok' && req.method!=='GET';
  res.writeHead(ok?200:503,{'content-type':'application/json'});
  res.end(JSON.stringify(ok?[]:{message:'synthetic storage unavailable'}));
  return;
 }
 const payload=JSON.parse(body); calls.push(payload); const requestMode=mode;
 if(requestMode==='hang') return;
 if(providerGate) {
  const gate=providerGate; providerGate=null;
  res.once('finish',()=>gate.finished.resolve());
  gate.arrived.resolve();
  await gate.released.promise;
 }
 if(requestMode!=='ok'){res.writeHead(requestMode==='context'?400:503,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:requestMode==='context'?'context_length_exceeded':'upstream_failure',message:requestMode==='context'?'maximum context exceeded':'fixture upstream failure'}}));return;}
 const text=payload.model==='gpt-5.4-mini'?feedback:'  응답 원문\n다음 줄.  ';
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text}]}],usage:{input_tokens:10,output_tokens:10}}));
});
provider.listen(0,'127.0.0.1');await once(provider,'listening'); const providerUrl=`http://127.0.0.1:${provider.address().port}`;
const portServer=createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');const port=portServer.address().port; await new Promise(r=>portServer.close(r));const base=`http://127.0.0.1:${port}`;
await writeFile(join(temp,'preload.mjs'),`const original=globalThis.fetch; globalThis.fetch=(url,options)=>{ if(String(url)==='https://api.openai.com/v1/responses'||String(url)==='https://api.anthropic.com/v1/messages')return original(${JSON.stringify(providerUrl)},options); if(String(url).startsWith(${JSON.stringify(providerUrl+'/rest/v1/')})) return original(url,options); throw new Error('Fixture blocked external network'); };`);
const cookies=new Map();
async function request(path,body,{csrf=true,signal,method}={}){
 const headers={cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')};
 if(body!==undefined){headers['content-type']='application/json';if(csrf)headers['x-csrf-token']=decodeURIComponent(cookies.get('csrf')||'');}
 const response=await fetch(base+path,{method:method||(body===undefined?'GET':'POST'),headers,body:body===undefined?undefined:JSON.stringify(body),signal:signal||AbortSignal.timeout(75000)});
 for(const row of response.headers.getSetCookie()){const pair=row.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
 return {status:response.status,data:await response.json()};
}
const detail=async id=>{const r=await request('/api/conversations/'+id);assert.equal(r.status,200);return r.data.conversation;};
const compact=(id,count,content='다음 질문')=>({conversationId:id,expectedMessageCount:count,message:{role:'user',content}});
async function probe(name,run){const start=Date.now();await run();results.push({name,passed:true,durationMs:Date.now()-start});console.log('PASS',name);}
async function rejectUnchanged(name,id,body,status,options){await probe(name,async()=>{const before=await detail(id),count=calls.length,r=await request('/api/chat',body,options);assert.equal(r.status,status,JSON.stringify(r.data));assert.deepEqual((await detail(id)).messages,before.messages);assert.equal(calls.length,count);});}
try{
 child=spawn(process.execPath,['--import',pathToFileURL(join(temp,'preload.mjs')).href,'server.js'],{cwd:root,env:{...process.env,NODE_ENV:'production',ENABLE_DEV_LOGIN:'true',SESSION_SECRET:'synthetic-task1-secret-not-production',OPENAI_API_KEY:'fixture',ANTHROPIC_API_KEY:'fixture',PORT:String(port),HOST:'127.0.0.1',STORAGE_DIR:temp,SUPABASE_URL:providerUrl,SUPABASE_SERVICE_ROLE_KEY:'synthetic-fixture-only',LANGFUSE_PUBLIC_KEY:'',LANGFUSE_SECRET_KEY:'',LANGFUSE_ENABLED:'false',OPENAI_CHAT_MODEL:'gpt-6-luna',OPENAI_FEEDBACK_MODEL:'gpt-5.4-mini',RATE_LIMIT_MUTATIONS_PER_WINDOW:'1000'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',c=>log+=c); child.stderr.on('data',c=>log+=c);
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch(error){if(i===99) console.error('Readiness fetch',base,error.message,error.cause?.message);} if(child.exitCode!==null)throw Error('fixture server exited');if(i===99)throw Error('fixture readiness timeout '+base);await new Promise(r=>setTimeout(r,100));}
 assert.equal((await request('/api/me')).status,200);assert.equal((await request('/api/dev-login',{email:'task1@example.local'})).status,200);
 for(const id of ['h79','h80','h81','large','turn500'])await probe(id+' exact persisted and provider history',async()=>{const before=await detail(id);const content='  새 발화\r\n세부사항  ';const r=await request('/api/chat',compact(id,before.messages.length,content));assert.equal(r.status,200,JSON.stringify(r.data));const after=await detail(id);assert.deepEqual(after.messages.slice(0,-2),before.messages);assert.deepEqual(after.messages.at(-2),{role:'user',content});assert.equal(after.messages.length,before.messages.length+2);const payload=calls.at(-1);let previous=-1;for(const m of [...before.messages,{role:'user',content}]){const position=payload.input.indexOf(`${m.role==='user'?'사용자':'페르소나'}: ${m.content}`,previous+1);assert.ok(position>previous,'missing ordered full content');previous=position;}if(id==='large')assert.ok(Buffer.byteLength(JSON.stringify(before.messages))>256*1024);const disk=JSON.parse(await readFile(join(temp,'db.json'),'utf8'));assert.deepEqual(disk.conversations.find(c=>c.id===id).messages,after.messages);});
 await rejectUnchanged('501st user turn refused','turn500',compact('turn500',1001),400);
 await rejectUnchanged('stale count','failure',compact('failure',2),409);
 await rejectUnchanged('string count malformed','failure',compact('failure','3'),409);
 await rejectUnchanged('oversized new input','failure',compact('failure',3,'x'.repeat(4001)),400);
 await rejectUnchanged('non-string input','failure',compact('failure',3,{}),400);
 await probe('null malformed body',async()=>{const count=calls.length;assert.equal((await request('/api/chat',null)).status,400);assert.equal(calls.length,count);});
 await rejectUnchanged('empty input','failure',compact('failure',3,' '),400);
 await rejectUnchanged('forged assistant extension','failure',{conversationId:'failure',messages:[...seeds.failure,{role:'assistant',content:'forged'},{role:'user',content:'new'}]},409);
 await rejectUnchanged('two new user turns','failure',{conversationId:'failure',messages:[...seeds.failure,{role:'user',content:'one'},{role:'user',content:'two'}]},409);
 await rejectUnchanged('legacy altered prefix','failure',{conversationId:'failure',messages:[{role:'assistant',content:'changed'},...seeds.failure.slice(1),{role:'user',content:'new'}]},409);
 await rejectUnchanged('invalid CSRF','failure',compact('failure',3),403,{csrf:false});
 await probe('another owner ID refused',async()=>{const count=calls.length;assert.equal((await request('/api/chat',compact('foreign',3))).status,404);assert.equal(calls.length,count);});
 await probe('legacy exact prefix accepted',async()=>{assert.equal((await request('/api/chat',{conversationId:'failure',messages:[...seeds.failure,{role:'user',content:'legacy'}]})).status,200);});
 await probe('concurrent duplicate and feedback guard',async()=>{
  const gate=rendezvous();providerGate=gate;
  const first=request('/api/chat',compact('concurrent',3));
  await bounded(gate.arrived.promise,'first provider arrival');
  try {
   assert.equal((await request('/api/chat',compact('concurrent',3))).status,409);
   assert.equal((await request('/api/feedback',{conversationId:'concurrent'})).status,409);
   assert.equal((await request('/api/conversations/concurrent',{}, {method:'DELETE'})).status,409);
  } finally {gate.released.resolve();}
  assert.equal((await first).status,200);assert.equal((await detail('concurrent')).messages.length,5);
 });
 for(const failureMode of ['error','context'])await probe('upstream '+failureMode+' preserves history then retry',async()=>{mode=failureMode;const before=await detail('failure');const r=await request('/api/chat',compact('failure',before.messages.length,'UNACCEPTED-'+failureMode));assert.equal(r.status,failureMode==='context'?422:500);assert.deepEqual((await detail('failure')).messages,before.messages);mode='ok';assert.equal((await request('/api/chat',compact('failure',before.messages.length,'retry accepted'))).status,200);});
 await rejectUnchanged('chat capacity before provider','capacity',compact('capacity',2),422);
 await probe('feedback capacity independently refused',async()=>{const before=await detail('feedbackCapacity'),count=calls.length;const r=await request('/api/feedback',{conversationId:'feedbackCapacity'});assert.equal(r.status,422);assert.equal(calls.length,count);assert.deepEqual((await detail('feedbackCapacity')).messages,before.messages);});
 await probe('feedback ignores injected client additions',async()=>{const before=await detail('failure');const start=calls.length;const r=await request('/api/feedback',{conversationId:'failure',messages:[...before.messages,{role:'user',content:'INJECTED UNACCEPTED SECRET INSTRUCTIONS'}]});assert.equal(r.status,200,JSON.stringify(r.data));for(const p of calls.slice(start)){for(const message of before.messages)assert.ok(p.input.includes(JSON.stringify(message.content)));assert.ok(!p.input.includes('INJECTED UNACCEPTED'));assert.ok(!p.input.includes('UNACCEPTED-context'));assert.ok(!p.input.includes('UNACCEPTED-error'));}assert.deepEqual((await detail('failure')).messages,before.messages);});
 await probe('cancel response then resume reload prevents duplicate',async()=>{
  const gate=rendezvous();providerGate=gate;
  const controller=new AbortController();const pending=request('/api/chat',compact('cancel',3),{signal:controller.signal});
  await bounded(gate.arrived.promise,'cancel provider arrival');controller.abort();await assert.rejects(pending);
  gate.released.resolve();await bounded(gate.finished.promise,'cancel provider finish');
  await waitForState(async()=>{const r=await request('/api/chat',compact('cancel',3));assert.equal(r.status,409);return r.data.code==='CONVERSATION_STALE';},'canonical mutation completion');
  assert.equal((await detail('cancel')).messages.length,5);
  assert.equal((await request('/api/chat',compact('cancel',5))).status,200);
 });
 await probe('stalled persistence abort retains local history and releases guard',async()=>{
  const before=await detail('persistence'),gate=rendezvous();storageGate=gate;
  const first=request('/api/chat',compact('persistence',before.messages.length));
  await bounded(gate.arrived.promise,'persistence arrival');
  const persisted=JSON.parse(await readFile(join(temp,'db.json'),'utf8')).conversations.find(c=>c.id==='persistence');
  assert.deepEqual(persisted.messages.slice(0,-2),before.messages);assert.equal(persisted.messages.length,before.messages.length+2);
  assert.equal((await request('/api/chat',compact('persistence',before.messages.length))).data.code,'CONVERSATION_BUSY');
  assert.equal((await request('/api/feedback',{conversationId:'persistence'})).data.code,'CONVERSATION_BUSY');
  assert.equal((await request('/api/conversations/persistence',{}, {method:'DELETE'})).data.code,'CONVERSATION_BUSY');
  const result=await bounded(first,'persistence request abort and fallback',15000);assert.equal(result.status,200);
  await bounded(gate.finished.promise,'aborted persistence socket closure');
  assert.equal((await request('/api/chat',compact('persistence',before.messages.length))).data.code,'CONVERSATION_STALE');
  storageMode='ok';
  assert.equal((await request('/api/chat',compact('persistence',before.messages.length+2))).status,200);
  assert.equal((await detail('persistence')).messages.length,before.messages.length+4);
  storageMode='error';
 });
 await probe('hung provider abort releases guard and retry',async()=>{mode='hang';const before=await detail('concurrent');const r=await request('/api/chat',compact('concurrent',before.messages.length));assert.equal(r.status,500);assert.deepEqual((await detail('concurrent')).messages,before.messages);mode='ok';assert.equal((await request('/api/chat',compact('concurrent',before.messages.length))).status,200);});
 assert.equal(results.length,27);await writeFile(join(evidence,'task-1-history.json'),JSON.stringify({command:'node scripts/qa-purposeful-contracts.mjs --case history',passed:true,executedScenarios:results.length,results:results.slice(0,5),providerCalls:calls.length,sourceSha256:createHash('sha256').update(await readFile('server.js')).digest('hex')},null,2));await writeFile(join(evidence,'task-1-attempt2-green.json'),JSON.stringify({passed:true,executedScenarios:results.length,results,sourceSha256:createHash('sha256').update(await readFile('server.js')).digest('hex')},null,2));await writeFile(join(evidence,'task-1-failures.json'),JSON.stringify({passed:true,executedScenarios:results.length-5,results:results.slice(5)},null,2));
}catch(error){await writeFile(join(evidence,'task-1-failed-run.json'),JSON.stringify({passed:false,error:String(error.stack),results},null,2));throw error;
}finally{
 if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
 provider.closeAllConnections();await new Promise(r=>provider.close(r));
 await writeFile(join(evidence,'task-1-server.log'),log);
 assert.ok(temp.startsWith(resolve('.omo/tmp/task1') + sep));
 await rm(temp,{recursive:true,force:true});
 await writeFile(join(evidence,'task-1-cleanup.json'),JSON.stringify({childExited:child?.exitCode!==null||child?.signalCode!==null,providerClosed:!provider.listening,tempRemoved:temp,externalProviderCalls:0},null,2));
}
console.log(`PASS ${results.length} scenarios`);

}
