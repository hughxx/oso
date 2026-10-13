import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createIntegration} from '../lib/integration.mjs';
import {createCLI,IntegrationError} from '../lib/cli.mjs';
import {AGENT_TEAM} from '../lib/agent-team.mjs';
const fixture=fileURLToPath(new URL('./fixtures/cli.mjs',import.meta.url));
async function make(t,decorate){
 const directory=await mkdtemp(path.join(os.tmpdir(),'oso-team-')),log=path.join(directory,'calls.jsonl');
 const base=createCLI({env:{...process.env,OSO_FIXTURE_LOG:log,MULTICA_CLI_ENTRY:fixture,WELINK_CLI_ENTRY:fixture}});
 const cli=decorate?decorate(base):base;const s=await createIntegration({directory,cli,pollMs:3600000});t.after(()=>s.close());return {s,directory,cli,log};
}
const input={workspaceId:'ws-1',runtimeId:'runtime-1',model:''};
test('fresh install shows seven blueprints and discovers Multica without WeLink',async t=>{
 const {s,log}=await make(t);assert.equal((await s.action('state')).agentBlueprints.length,7);
 const d=await s.action('team-discover');assert.equal(d.selectedWorkspace,'ws-1');assert.equal(d.runtimes[0].id,'runtime-1');
 const calls=(await readFile(log,'utf8')).split('\n').filter(Boolean).map(JSON.parse);assert.ok(calls.every(a=>['workspace','runtime','agent'].includes(a[0])));
});
test('creates seven real agents once, reuses them after restart and makes no issues',async t=>{
 const {s,directory,cli,log}=await make(t);
 const [first,concurrent]=await Promise.all([s.action('team-initialize',input),s.action('team-initialize',input)]);
 assert.equal(first.complete,true);assert.equal(concurrent.complete,true);assert.equal(first.results.length,7);assert.equal(first.state.config.workspaceId,'ws-1');
 assert.equal(first.state.cache.agents.data.filter(a=>a.role).length,7);
 const again=await s.action('team-initialize',input);assert.ok(again.results.every(r=>r.reused));
 s.close();const restarted=await createIntegration({directory,cli,pollMs:3600000});t.after(()=>restarted.close());
 assert.ok((await restarted.action('team-initialize',input)).results.every(r=>r.reused));
 const calls=(await readFile(log,'utf8')).split('\n').filter(Boolean).map(JSON.parse);
 const creates=calls.filter(a=>a[0]==='agent'&&a[1]==='create'&&!a.includes('--help'));assert.equal(creates.length,7);assert.ok(!calls.some(a=>a[0]==='issue'));
 assert.ok(creates.every(a=>a.includes('--instructions')&&a.includes('--runtime-id')&&!a.includes('--model')));
});
test('offline runtime prevents all writes',async t=>{
 const {s}=await make(t,base=>async(p,a,o)=>a[0]==='runtime'?[{id:'runtime-1',status:'offline'}]:base(p,a,o));
 await assert.rejects(()=>s.action('team-initialize',input),/在线/);
});
test('timeout after successful remote creation reconciles by marker and continues missing roles',async t=>{
 let timedOut=false;const {s,log}=await make(t,base=>async(p,a,o)=>{
  const result=await base(p,a,o);if(a[0]==='agent'&&a[1]==='create'&&!a.includes('--help')&&!timedOut){timedOut=true;throw new IntegrationError('lost response','TIMEOUT');}return result;
 });
 const first=await s.action('team-initialize',input);assert.equal(first.complete,false);assert.equal(first.results[0].state,'uncertain');
 const second=await s.action('team-initialize',input);assert.equal(second.complete,true);assert.equal(second.results[0].reused,true);
 const calls=(await readFile(log,'utf8')).split('\n').filter(Boolean).map(JSON.parse);assert.equal(calls.filter(a=>a[0]==='agent'&&a[1]==='create'&&!a.includes('--help')).length,7);
});
test('uncertain absent role is not recreated; unrelated same-name agent is not overwritten',async t=>{
 let creates=0;const {s}=await make(t,base=>async(p,a,o)=>{
  if(a[0]==='agent'&&a[1]==='list')return [{id:'user-agent',name:AGENT_TEAM[1].name,instructions:'my custom instructions'}];
  if(a[0]==='agent'&&a[1]==='create'&&!a.includes('--help')){creates++;throw new IntegrationError('timeout','TIMEOUT');}
  return base(p,a,o);
 });
 await s.action('team-initialize',input);const r=await s.action('team-initialize',input);
 assert.equal(r.results[0].state,'uncertain');assert.equal(r.results[1].state,'conflict');assert.equal(creates,2); // Next missing role attempted once; first role not replayed.
});
test('unsupported create contract is rejected before mutation',async t=>{
 const {s}=await make(t,base=>async(p,a,o)=>a.includes('--help')?'--name --runtime-id':base(p,a,o));
 await assert.rejects(()=>s.action('team-initialize',input),/instructions/);
});
