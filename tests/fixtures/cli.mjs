// Offline contract fixture. Used only when explicitly selected by tests via *_CLI_ENTRY.
import { appendFile, readFile, writeFile } from 'node:fs/promises';
let args=process.argv.slice(2);
while(['--profile','--server-url','--workspace-id'].includes(args[0]))args=args.slice(2);
const flag=k=>args[args.indexOf(k)+1];
if(process.env.OSO_FIXTURE_LOG)await appendFile(process.env.OSO_FIXTURE_LOG,JSON.stringify(args)+'\n');
const output=v=>console.log(JSON.stringify(v));
const issue={id:'issue-1',identifier:'LAB-7',title:'集成验证任务',status:'done',workspace_id:'ws-1'};
if(args[0]==='workspace')output([{id:'ws-1',name:'测试工作区'}]);
else if(args[0]==='agent'){
 const file=process.env.OSO_FIXTURE_LOG+'.agents.json';let agents=[];try{agents=JSON.parse(await readFile(file,'utf8'));}catch{}
 if(args[1]==='create'&&args.includes('--help'))console.log('agent create --name string --runtime-id string --instructions string --model string --output string');
 else if(args[1]==='create'){
  const agent={id:'created-'+(agents.length+1),name:flag('--name'),instructions:flag('--instructions'),runtime_id:flag('--runtime-id'),workspace_id:'ws-1',model:args.includes('--model')?flag('--model'):'fixture-model',status:'idle'};
  agents.push(agent);await writeFile(file,JSON.stringify(agents));output(agent);
 }else output([{id:'agent-1',name:'测试 Agent',status:'idle',model:'fixture-model',runtime_id:'runtime-1',workspace_id:'ws-1'},...agents]);
}
else if(args[0]==='runtime')output([{id:'runtime-1',name:'测试 Runtime',status:'online',provider:'fixture'}]);
else if(args[0]==='project')output([{id:'project-1',title:'测试项目',status:'in_progress'}]);
else if(args[0]==='issue'&&args[1]==='list')output({issues:[issue],has_more:false,total:1,limit:50,offset:0});
else if(args[0]==='issue'&&args[1]==='create'){
 const content=await readFile(flag('--description-file'),'utf8');
 if(!content.includes('OSO 请求编号'))throw Error('Missing request marker');
 output({...issue,title:flag('--title'),description:content,status:'todo'});
}else if(args[0]==='issue'&&args[1]==='runs')output([{id:'run-1',issue_id:'issue-1',status:'completed',started_at:'2026-10-13T01:00:00Z',completed_at:'2026-10-13T01:01:00Z',result:{output:'# 真实接口契约测试产物\n\n这是模拟 CLI 返回的最终回答。',work_dir:'D:\\fixture\\workdir'},error:null}]);
else if(args[0]==='issue'&&args[1]==='run-messages')output([{seq:1,type:'tool_use',tool:'Read',task_id:'run-1',input:{private:'DO_NOT_EXPOSE_TOOL_PAYLOAD'}},{seq:2,type:'text',task_id:'run-1',content:'DO_NOT_EXPOSE_INTERMEDIATE_REASONING'}]);
else if(args[0]==='im'&&args[1]==='query-recent-conversation')output({conversation_info:[{recent_conversation_type:'CHAT_TYPE_GROUP_MSG',group_id:'991001',group_name:'测试研发群'},{recent_conversation_type:'CHAT_TYPE_P2P_MSG',target_account:'test-user',native_name:'测试同事'}],error:{error_code:'IM.0000',error_msg:'success'}});
else if(args[0]==='im'&&args[1]==='query-history-message')console.log('{"respData":{"chatInfo":[{"msgId":89576386754070125,"sender":"test-user","content":"请整理接口优化方案，不修改代码。","contentType":"TEXT_MSG","serverSendTime":1791849600000}]}}');
else if(args[0]==='mail'&&args.includes('list'))output([{itemId:'mail-1',subject:'测试周报请求',from:'测试负责人',fromEmail:'test@example.invalid',preview:'请整理本周工作',dateTimeReceived:'2026-10-13T09:00:00+08:00',isRead:false,importance:'High',body:''}]);
else if(args[0]==='mail'&&args.includes('get'))output({itemId:'mail-1',subject:'测试周报请求',fromEmail:'test@example.invalid',body:'完整正文：整理本周研发进展，生成草稿即可。',attachments:[],dateTimeReceived:'2026-10-13T09:00:00+08:00'});
else if(args[0]==='calendar'&&args.includes('list'))output([{itemId:'event-1',subject:'测试评审',start:'2026-10-13T09:00:00+08:00',end:'2026-10-13T10:00:00+08:00',legacyFreeBusyStatus:'Busy',location:'测试会议室'}]);
else if(args[0]==='calendar'&&args.includes('get'))output({subject:'测试评审',body:'评审交互流程。'});
else if(args[0]==='meeting'&&args[1]==='query-list')output({code:200,data:{data:[{meetingId:12345,subject:'测试会议',meetingStartTime:1791856800000,meetingEndTime:1791860400000}],total:1}});
else if(args[0]==='meeting')output({subject:'测试会议',meetingSummaryTextList:null});
else if(args[0]==='onebox'&&args[1]==='user-info')output({cloudUserId:'space-1'});
else if(args[0]==='onebox'&&['folder-list','node-search'].includes(args[1]))output({files:[{id:135,name:'测试设计.md',size:860,modifiedAt:1791850000000,parent:0}],totalCount:1});
else if(args[0]==='onebox'&&args[1]==='file-info')output({id:135,name:'测试设计.md',size:860,versions:1});
else if(args[0]==='im'&&args[1].startsWith('send-'))output({error:{error_code:'IM.0000',error_msg:'success'}});
else if(args.includes('reply')||args.includes('create'))console.log('Fixture write succeeded');
else {console.error('Unsupported fixture command');process.exitCode=1;}
