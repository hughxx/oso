import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCLI,parseJSON,checkBusiness,IntegrationError,resolveCLI} from '../lib/cli.mjs';
import {createIntegration} from '../lib/integration.mjs';
import {messages,runStatus,mergeActivity} from '../lib/adapters.mjs';
const fixture=fileURLToPath(new URL('./fixtures/cli.mjs',import.meta.url));
const request={requestId:'request-1',confirmed:true,title:'中文 "$()" ; & 特殊字符',description:'完整任务\n第二行',agentId:'agent-1'};
async function setup(t,override){const directory=await mkdtemp(path.join(os.tmpdir(),'oso-test-'));const log=path.join(directory,'calls.jsonl');const base=createCLI({env:{...process.env,MULTICA_CLI_ENTRY:fixture,WELINK_CLI_ENTRY:fixture,OSO_FIXTURE_LOG:log}});const service=await createIntegration({directory,cli:override?override(base):base,pollMs:3600000});t.after(()=>service.close());await service.action('config',{workspaceId:'ws-1'});await service.action('sync');return {service,directory,log,base};}

test('preserves 64-bit IDs without changing quoted strings or timestamps',()=>{
 const obj=parseJSON('{"id":89576386754070125,"text":"89576386754070125 and \\\"literal\\\"","ts":1791527735081,"negative":-9007199254740993}');
 assert.equal(obj.id,'89576386754070125');assert.equal(obj.negative,'-9007199254740993');assert.equal(typeof obj.ts,'number');assert.match(obj.text,/literal/);
 const rows=messages({respData:{chatInfo:[{msgId:obj.id,serverSendTime:obj.ts,content:'@张三',at:false}]}},{id:'group:1'});
 assert.equal(rows[0].remoteId,obj.id);assert.equal(rows[0].mentionConfirmed,false);
});
test('business errors, invalid JSON and unknown states never appear successful',()=>{
 assert.throws(()=>checkBusiness({error:{error_code:'IM.9999',error_msg:'expired'}}));assert.throws(()=>checkBusiness({code:'400',message:{message:'bad'}}));assert.throws(()=>parseJSON('warning\n{}'));
 assert.equal(runStatus({status:'completed'}),'review');assert.equal(runStatus({status:'new-state'}),'unknown');assert.equal(runStatus({status:'running',error:'bad'}),'failed');
 const activity=mergeActivity([],[{seq:1,type:'text',content:'SECRET'},{seq:2,type:'tool_use',tool:'Read',input:{secret:'SECRET'}}],'r');assert.ok(!JSON.stringify(activity).includes('SECRET'));
});
test('Windows wrappers are not launched through shell',async()=>{
 await assert.rejects(()=>resolveCLI('welink',{welinkPath:'C:/tools/welink.cmd'}),/请选择/);
 assert.deepEqual(await resolveCLI('welink',{welinkPath:'C:/tools/wrapper.js'}),{file:process.execPath,args:['C:/tools/wrapper.js']});
});
test('full CLI contract: sync, exact IDs, full mail, submit once, track, accept and restart',async t=>{
 const {service,directory,log,base}=await setup(t);
 const state=await service.action('state');assert.equal(state.cache.mail.data[0].fullBody,false);assert.equal(state.cache.meetings.data[0].source,'meeting');assert.equal(state.cache.agents.data[0].id,'agent-1');
 const history=await service.action('query',{kind:'history',conversation:state.cache.conversations.data[0]});assert.equal(history.rows[0].remoteId,'89576386754070125');
 const detail=await service.action('query',{kind:'mail',id:'mail-1'});assert.match(detail.body,/完整正文/);
 await assert.rejects(()=>service.action('submit',{...request,confirmed:false}),/确认/);
 const [a,b]=await Promise.all([service.action('submit',request),service.action('submit',request)]);
 assert.equal(a.operation.id,b.operation.id);assert.equal(a.job.issueId,'issue-1');
 await assert.rejects(()=>service.action('submit',{...request,title:'different'}),/不同内容/);
 const tracked=await service.action('refresh',{id:a.job.id});assert.equal(tracked.runId,'run-1');assert.equal(tracked.status,'review');assert.match(tracked.output,/最终回答/);assert.ok(!JSON.stringify(tracked.activity).includes('DO_NOT_EXPOSE'));
 await service.action('accept',{id:a.job.id,confirmed:true});service.close();
 const restarted=await createIntegration({directory,cli:base,pollMs:3600000});t.after(()=>restarted.close());assert.equal((await restarted.action('state')).jobs[0].status,'done');
 const calls=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(calls.filter(a=>a[0]==='issue'&&a[1]==='create').length,1);
 assert.equal(calls.find(a=>a[1]==='create'&&a[0]==='issue')[3],request.title);assert.ok(calls.find(a=>a[0]==='calendar').includes('--end'));
});
test('ambiguous create is never retried; can recover by verified request marker',async t=>{
 let creates=0;
 const {service}=await setup(t,base=>async(p,args,options)=>{
  if(args[0]==='issue'&&args[1]==='create'){creates++;throw new IntegrationError('timeout','TIMEOUT');}
  if(args[0]==='issue'&&args[1]==='get')return {id:'issue-1',identifier:'LAB-7',description:'[OSO 请求编号: request-1]'};
  return base(p,args,options);
 });
 const first=await service.action('submit',request);assert.equal(first.operation.state,'uncertain');assert.equal(first.job.status,'uncertain');
 await service.action('submit',request);assert.equal(creates,1);
 const attached=await service.action('attach',{id:first.job.id,issueId:'LAB-7'});assert.equal(attached.issueId,'issue-1');
});
test('partial source failure preserves cached data and cannot become demo fallback',async t=>{
 let failMail=false;
 const {service}=await setup(t,base=>async(p,args,options)=>{if(failMail&&args[0]==='mail')throw new IntegrationError('认证过期，请重新登录','CLI_ERROR');return base(p,args,options);});
 failMail=true;const state=await service.action('sync');assert.equal(state.cache.mail.data[0].remoteId,'mail-1');assert.match(state.cache.mail.error.message,/认证过期/);assert.equal(state.cache.calendar.error,null);
});
test('writeback requires confirmation, uses fixed args and does not replay',async t=>{
 const {service,log}=await setup(t);const input={requestId:'write-1',kind:'send-im',targetType:'group',target:'991001',body:'hello & "world"'};
 await assert.rejects(()=>service.action('write',input),/确认/);
 await service.action('write',{...input,confirmed:true});await service.action('write',{...input,confirmed:true});
 const calls=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);const sends=calls.filter(a=>a[1]==='send-to-group');assert.equal(sends.length,1);assert.equal(sends[0].at(-1),input.body);
 await assert.rejects(()=>service.action('write',{...input,requestId:'bad',confirmed:true,kind:'arbitrary-shell'}),/不支持/);
});
test('run identity stays pinned and missing final output is not inferred from text',async t=>{
 let iteration=0;
 const {service}=await setup(t,base=>async(p,args,options)=>{
  if(args[0]==='issue'&&args[1]==='runs')return iteration++===0?[{id:'first',issue_id:'issue-1',status:'running'}]:[{id:'newer',issue_id:'issue-1',status:'completed',result:{output:'wrong'}},{id:'first',issue_id:'issue-1',status:'completed',result:{}}];
  return base(p,args,options);
 });
 const result=await service.action('submit',request);await service.action('refresh',{id:result.job.id});const j=await service.action('refresh',{id:result.job.id});assert.equal(j.runId,'first');assert.equal(j.output,'');assert.match(j.resultNotice,/没有 result.output/);
});
test('restart marks interrupted writes uncertain and does not dispatch again',async t=>{
 const {service,directory,base,log}=await setup(t);service.close();
 const file=path.join(directory,'integration.json');const db=JSON.parse(await readFile(file,'utf8'));
 db.operations.push({id:'interrupted',state:'pending',kind:'multica.create'});db.jobs.push({id:'job-interrupted',operationId:'interrupted',status:'submitting'});await writeFile(file,JSON.stringify(db));
 const restarted=await createIntegration({directory,cli:base,pollMs:3600000});t.after(()=>restarted.close());const state=await restarted.action('state');
 assert.equal(state.operations[0].state,'uncertain');assert.equal(state.jobs[0].status,'uncertain');
 const calls=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(calls.filter(a=>a[1]==='create').length,0);
});
test('IM exit-zero business rejection is journaled as uncertain, never as sent',async t=>{
 const {service}=await setup(t,base=>async(p,args,options)=>args[1]==='send-to-user'?' {"error":{"error_code":"IM.9999","error_msg":"not authorized"}}':base(p,args,options));
 const result=await service.action('write',{kind:'send-im',targetType:'user',target:'test-user',body:'hello',requestId:'rejected-write',confirmed:true});assert.equal(result.operation.state,'uncertain');assert.equal(result.operation.error.code,'BUSINESS_ERROR');
});
test('configuration changes clear caches but keep running jobs pinned to their original workspace',async t=>{
 const contexts=[];const {service}=await setup(t,base=>async(p,args,options)=>{if(args[1]==='runs')contexts.push(options.config.workspaceId);return base(p,args,options);});
 const result=await service.action('submit',request);await service.action('config',{workspaceId:'ws-2'});await service.action('refresh',{id:result.job.id});
 assert.deepEqual(contexts,['ws-1']);assert.deepEqual((await service.action('state')).cache,{});
});
