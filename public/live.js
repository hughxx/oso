const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const labels={submitting:'提交中',queued:'等待派发',running:'执行中',review:'待验收',done:'已验收',failed:'失败',cancelled:'已取消',blocked:'已阻塞',unknown:'未知状态',uncertain:'结果未确认'};
let state={config:{},cache:{},jobs:[],operations:[],reads:{}},page='工作台',dialogKind='',activeJob='',syncing=false,preview=null;
let history=[],conversation=null,historyCursor=null,mailDetail=null,issuePage=null;
let teamDiscovery=null,initializingTeam=false;
const channel=n=>state.cache[n]?.data;
const array=n=>Array.isArray(channel(n))?channel(n):[];
const status=j=>labels[j.status]||j.status;
const time=v=>v?new Date(v).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
const button=(title,action,cls='secondary',id='')=>`<button type="button" class="${cls}" data-act="${action}" data-id="${esc(id)}">${title}</button>`;
const empty=t=>`<p class="empty">${esc(t)}</p>`;
const heading=(title,action,label='查看全部')=>`<div class="card-heading"><h2>${title}</h2>${action?button(label,action,'text-button'):''}</div>`;
const tag=(text,type='')=>`<span class="badge ${type}">${esc(text)}</span>`;
function notify(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
async function api(action,body){const r=await fetch('/api/live/'+action,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error||'请求失败');return v;}
async function load(){state=await api('state');}
function modal(title,body,kind='other'){dialogKind=kind;$('#overlay').innerHTML=`<div class="backdrop"><section class="dialog wide-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dialog-head"><h2>${esc(title)}</h2>${button('×','close','close')}</div><div class="dialog-body">${body}</div></section></div>`;setTimeout(()=>$('#overlay input, #overlay textarea, #overlay button')?.focus(),0);}
function close(){dialogKind='';activeJob='';$('#overlay').innerHTML='';}
function errors(){return Object.entries(state.cache).filter(([,v])=>v.error).map(([k,v])=>`<div class="source-error"><b>${esc(k)}</b> ${esc(v.error.message)}${v.at?`<small>保留上次成功数据：${time(v.at)}</small>`:''}</div>`).join('');}
function tasks(limit=50){return state.jobs.slice(0,limit).map(j=>`<button class="live-task" data-act="job" data-id="${esc(j.id)}"><span class="live-task-icon">${j.status==='done'?'✓':j.status==='review'?'◎':'⌘'}</span><span class="grow"><strong>${esc(j.title)}</strong><small>${esc(j.identifier||'等待关联 issue')} · ${time(j.createdAt)}</small></span>${tag(status(j),['uncertain','failed'].includes(j.status)?'danger':j.status==='done'?'success':'')}</button>`).join('')||empty('还没有真实任务。选择一条工作信息，交给 Agent 推进。');}
function mailRows(limit=30){return array('mail').slice(0,limit).map(m=>`<button class="live-message" data-act="mail" data-id="${esc(m.id)}"><span class="file-icon">✉</span><span class="grow"><strong>${esc(m.title)}</strong><small>${esc(m.sender)} · ${time(m.sentAt)}</small></span>${state.reads[m.id]||m.read?'':tag('未读')}${m.urgent?tag('高优先级','danger'):''}</button>`).join('')||empty('暂无邮件。同步后显示最近 30 封，正文按需读取。');}
function eventRows(limit=100){const list=[...array('calendar'),...array('meetings')].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));return list.slice(0,limit).map(e=>`<button class="live-event" data-act="event" data-id="${esc(e.id)}"><span class="event-date">${time(e.start)}</span><span class="grow"><strong>${esc(e.title)}</strong><small>${e.source==='calendar'?'日历':'会议'} · ${e.cancelled?'已取消':esc(e.location||'地点未提供')} · 至 ${time(e.end)}</small></span>${e.allDay?tag('全天'):''}</button>`).join('')||empty('暂无今日日程。日历和会议分来源展示，不猜测合并。');}
function fileRows(rows=channel('files')?.rows||[]){return rows.map(d=>`<button class="file-row" data-act="file" data-id="${esc(d.id)}"><span class="file-icon type-M">▤</span><span class="grow"><strong>${esc(d.title)}</strong><small>${Math.ceil(Number(d.size||0)/1024)} KB · ${time(d.modifiedAt)} · 云空间</small></span><span>↗</span></button>`).join('')||empty('暂无云空间文件。可以按文件名搜索。');}
function conversations(){return array('conversations').map(c=>`<button class="live-message" data-act="conversation" data-id="${esc(c.id)}"><span class="helper-icon blue">${c.kind==='group'?'♧':'◌'}</span><span class="grow"><strong>${esc(c.title)}</strong><small>${c.kind==='group'?'群聊':'单聊'} · 点击读取历史</small></span><b>›</b></button>`).join('')||empty('暂无最近会话。会话接口不提供未读数。');}
function projectRows(){return array('projects').map(p=>`<article class="live-message"><span class="project-icon purple">▣</span><span class="grow"><strong>${esc(p.title||p.name||p.id)}</strong><small>${esc(p.status||'状态未提供')}</small></span></article>`).join('')||empty('当前工作区暂无项目，可以直接创建未关联项目的任务。');}
function home(){return `<section class="live-hero"><div><span class="eyebrow">CONNECTED WORKSPACE</span><h1>让工作信息，变成工作进展。</h1><p>先同步上下文，选择执行目标，再检查 Agent 的真实产出。</p></div>${button('＋ 交给 Agent','new-task','primary')}</section><div class="live-metrics"><span><b>${state.jobs.filter(j=>['running','queued'].includes(j.status)).length}</b> 执行中</span><span><b>${state.jobs.filter(j=>j.status==='review').length}</b> 待验收</span><span><b>${state.jobs.filter(j=>j.status==='done').length}</b> 已验收</span><span><b>${array('agents').length}</b> 可选 Agent</span></div><div class="dashboard live-grid"><section class="card">${heading('今日重点 · 真实执行','tasks')}${tasks(5)}</section><section class="card">${heading('工作邮件','messages')}${mailRows(5)}</section><section class="card">${heading('今日日程','calendar')}${eventRows(5)}</section><section class="card">${heading('WeLink 最近会话','messages')}${array('conversations').slice(0,4).map(c=>`<button class="live-message" data-act="conversation" data-id="${esc(c.id)}"><span class="channel-icon">◌</span><span class="grow"><strong>${esc(c.title)}</strong><small>${c.kind==='group'?'群聊':'单聊'} · 按需获取历史</small></span><span>›</span></button>`).join('')||empty('点击“同步工作信息”读取真实会话。')}</section><section class="card">${heading('云空间文件','knowledge')}${fileRows((channel('files')?.rows||[]).slice(0,5))}</section><section class="card">${heading('AI 助手','tools')}<div class="helpers">${[['report','▤','工作总结'],['meeting','♧','会议整理'],['code','⌘','代码分析'],['plan','☼','生成方案'],['reply','✉','回复草稿'],['knowledge','⌕','查找资料']].map(([id,icon,t])=>button(`<span class="helper-icon purple">${icon}</span><strong>${t}</strong>`,'helper','',id)).join('')}</div><p class="muted">任务由你选择的 Multica Agent 执行，提交前可检查完整内容。</p></section></div><section class="summary-strip"><h2>工作回顾</h2><p class="grow muted">Agent 执行完成后仍需人工验收，验收记录独立保存在本机。</p>${button('让 Agent 生成总结 ↗','summary','text-button')}</section>`;}
function issues(){const data=issuePage||channel('issues');return (data?.rows||[]).map(i=>`<article class="live-message"><span class="grow"><strong>${esc(i.title)}</strong><small>${esc(i.identifier||i.id)} · 远端状态 ${esc(i.status)}</small></span>${tag(i.assignee_type||'未分配')}</article>`).join('')+(data?.hasMore?button('下一页','more-issues','secondary'):'');}
function render(){
 const syncTimes=Object.values(state.cache).map(v=>v.at).filter(Boolean).sort();
 $('#app').innerHTML=`<header class="live-header"><a class="brand" href="/#live"><span class="logo">⌁</span><b>OSO <span>AI 工作台</span></b></a><nav>${['工作台','信息中心','任务中心','知识库','工具中心'].map(p=>button(p,'nav',page===p?'active':'',p)).join('')}</nav><span class="live-mode">● 真实环境</span>${button('连接设置','settings','secondary small')}<a class="demo-link" href="/">演示模式 ↗</a></header><main><div class="live-toolbar"><span class="muted">${state.config.workspaceId?'工作区 '+esc(state.config.workspaceId):'请先设置工作区并同步'} · ${syncTimes.length?'最近同步 '+time(syncTimes.at(-1)):'尚未同步'}</span>${button(syncing?'同步中…':'↻ 同步工作信息','sync','primary small')}</div>${errors()?`<details class="live-errors"><summary>${Object.values(state.cache).filter(v=>v.error).length} 个来源读取失败 · 展开查看，其他来源可继续使用</summary>${errors()}</details>`:''}${page==='工作台'?home():page==='信息中心'?`<div class="page-title"><div><span class="eyebrow">WORK CONTEXT</span><h1>信息中心</h1><p>邮件读取正文后可转任务；已读仅在 OSO 本地维护。</p></div>${button('创建个人日程','new-event','primary')}</div><div class="live-columns"><section class="card">${heading('最近会话')}${conversations()}</section><section class="card">${heading('最近邮件')}${mailRows()}</section></div><section class="card wide">${heading('今日日历与会议')}${eventRows()}</section>`:page==='任务中心'?`<div class="page-title"><div><span class="eyebrow">EXECUTION & REVIEW</span><h1>任务中心</h1><p>保存 issue 和 run 关联，服务重启后恢复跟踪。</p></div>${button('＋ 交给 Agent','new-task','primary')}</div><section class="card wide">${heading('OSO 发起的任务')}${tasks()}</section><section class="card wide">${heading('Multica 工作区任务 · 远端快照')}${issues()||empty('暂无远端任务')}</section><section class="card wide">${heading('我的项目')}${projectRows()}</section>`:page==='知识库'?`<div class="page-title"><div><span class="eyebrow">KNOWLEDGE & OUTPUT</span><h1>知识与产物</h1><p>云空间提供文件名检索；Agent 最终回答可下载为 Markdown。</p></div></div><section class="card wide"><form id="cloud-search" class="inline-form"><input name="text" required placeholder="输入云空间文件名…"><button class="primary">搜索</button></form><div id="cloud-results">${fileRows()}</div></section><section class="card wide">${heading('Agent 最终产物')}${state.jobs.filter(j=>j.output).map(j=>`<button class="file-row" data-act="job" data-id="${esc(j.id)}"><span class="file-icon type-M">M</span><span class="grow"><strong>${esc(j.title)}</strong><small>${esc(j.identifier)} · ${status(j)}</small></span>↗</button>`).join('')||empty('执行完成后，最终产物会出现在这里。')}</section>`:`<div class="page-title"><div><span class="eyebrow">AGENTS & CONNECTIONS</span><h1>工具中心</h1><p>Agent 与 Runtime 状态分别显示；daemon 状态不代表所有运行时状态。</p></div>${button('配置连接','settings','primary')}</div><div class="live-columns"><section class="card">${heading('Agents')}${array('agents').map(a=>`<article class="live-message"><span class="project-icon purple">✦</span><span class="grow"><strong>${esc(a.name)}</strong><small>${esc(a.model)} · ${esc(a.id)}</small></span>${tag(a.status||'未知')}</article>`).join('')||empty('同步后显示当前工作区 Agents')}</section><section class="card">${heading('Runtimes')}${array('runtimes').map(r=>`<article class="live-message"><span class="grow"><strong>${esc(r.name)}</strong><small>${esc(r.provider)}</small></span>${tag(r.status||'未知')}</article>`).join('')||empty('暂无运行时信息')}</section></div><section class="card wide">${heading('提交与写回记录')}${state.operations.slice().reverse().slice(0,30).map(o=>`<article class="operation-row"><span class="grow"><strong>${esc(o.kind)}</strong><small>${time(o.createdAt)} · 请求 ${esc(o.id)}</small>${o.error?`<p class="form-error">${esc(o.error.message)}</p>`:''}</span>${tag(o.state,o.state==='uncertain'?'danger':'')}</article>`).join('')||empty('尚未提交真实操作')}</section>`}<footer><span>数据缓存保存在本机 · 不自动执行写回</span><span>WeLink × Multica</span>${button('连接与设置 ↗','settings','text-button')}</footer></main>`;
 const sync=$('[data-act="sync"]');if(sync)sync.disabled=syncing;
 renderTeamPanel();
}
function renderTeamPanel(){
 if(!['工作台','工具中心'].includes(page))return;
 const roles=state.agentBlueprints||[];if(!roles.length)return;
 const ready=roles.filter(r=>array('agents').some(a=>a.role===r.key)).length;
 const panel=document.createElement('section');panel.className='card team-panel';
 panel.innerHTML=`<div class="card-heading"><div><h2>你的默认 AI 团队 <em>${ready} / ${roles.length}</em></h2><p class="muted">${ready?'选择角色，直接开始一项工作。':'职责和交付标准已配好，初始化后即可交给真实 Agent 执行。'}</p></div>${button(ready===roles.length?'检查团队配置':'初始化默认团队','team-setup','primary')}</div><div class="team-grid">${roles.map(r=>{
   const a=array('agents').find(a=>a.role===r.key);return `<article class="team-role"><span class="helper-icon purple">${esc(r.icon)}</span><strong>${esc(r.name.replace('OSO ',''))}</strong><p>${esc(r.description)}</p><small>交付：${esc(r.deliverable)}</small>${a?tag('已就绪','success'):tag('待初始化')}<div class="dialog-actions">${button(a?'交给它处理':'查看职责','team-role','text-button',r.key)}</div></article>`;
 }).join('')}</div>`;
 $('main .live-toolbar').after(panel);
}
async function teamSetup(workspaceId=''){
 modal('初始化默认 AI 团队','<p class="muted">正在检测 Multica 工作区和在线 Runtime…</p>','team-setup');
 try{
  teamDiscovery=await api('team-discover',workspaceId?{workspaceId}:{});
  const d=teamDiscovery,online=d.runtimes.filter(r=>r.status==='online');
  modal('初始化默认 AI 团队',`<p>七个角色的职责、输入要求和交付格式已设计好。选择运行环境，一次创建；已有 OSO 角色自动复用。</p><form id="team-form"><label>工作区<select id="team-workspace" name="workspaceId" required><option value="">请选择工作区</option>${d.workspaces.map(w=>`<option value="${esc(w.id)}" ${w.id===d.selectedWorkspace?'selected':''}>${esc(w.name||w.slug)} · ${esc(w.id)}</option>`).join('')}</select></label><label>默认 Runtime<select name="runtimeId" required><option value="">请选择在线 Runtime</option>${online.map((r,i)=>`<option value="${esc(r.id)}" ${i===0?'selected':''}>${esc(r.name)} · ${esc(r.provider)}</option>`).join('')}</select></label>${d.selectedWorkspace&&!online.length?'<p class="source-error">当前工作区没有在线 Runtime。请打开 Multica Desktop 的运行时，再点击重新检测。</p>':''}<label>模型（可选）<input name="model" list="team-models" placeholder="留空使用 Runtime / Multica 的默认模型"><datalist id="team-models">${[...new Set(d.agents.filter(a=>online.some(r=>r.id===a.runtimeId)).map(a=>a.model).filter(Boolean))].map(m=>`<option value="${esc(m)}"></option>`).join('')}</datalist></label><p class="muted">所有新角色绑定所选 Runtime；如需指定模型，请使用该 Runtime 支持的名称。已有角色保留当前配置。</p><details><summary>查看七个角色的完整指令</summary>${d.blueprints.map(r=>`<h3>${esc(r.name)}</h3><pre class="document">${esc(r.instructions)}</pre>`).join('')}</details><div class="dialog-actions"><button class="primary" ${!online.length?'disabled':''}>创建默认团队</button>${button('重新检测','team-setup','secondary')}${button('连接设置','settings','text-button')}</div><div id="team-result"></div></form>`,'team-setup');
 }catch(e){modal('初始化默认 AI 团队',`<div class="source-error">${esc(e.message)}</div><p>请确认 Multica 已登录，服务地址和 profile 正确。只检测 Multica，不依赖 WeLink 同步成功。</p>${button('连接设置','settings','primary')}${button('重新检测','team-setup','secondary')}`,'team-setup');}
}
function roleTask(roleKey,title,description){taskForm(title,description,roleKey);}
function settings(){modal('真实环境 · 连接配置',`<p class="muted">复用当前用户已登录的 CLI，不需要在此填写 Token。配置保存在本机。</p><form id="connection-form"><label>Multica 工作区 ID（创建任务必填）<input name="workspaceId" value="${esc(state.config.workspaceId)}" placeholder="从下方工作区列表复制 UUID"></label>${array('workspaces').length?`<div class="workspace-options">${array('workspaces').map(w=>`<p><b>${esc(w.name||w.slug)}</b><code>${esc(w.id)}</code></p>`).join('')}</div>`:'<p class="muted">可先保存默认配置并同步，读取可用工作区，再选择工作区并重新同步。</p>'}<div class="form-grid"><label>Multica profile（可选）<input name="profile" value="${esc(state.config.profile)}" placeholder="沿用 CLI 默认 profile"></label><label>Multica 服务地址（可选）<input name="serverUrl" value="${esc(state.config.serverUrl)}" placeholder="http://内网服务/multica-service"></label></div><label>Multica 路径（可选）<input name="multicaPath" value="${esc(state.config.multicaPath)}" placeholder="自动在 PATH 查找 multica.exe"></label><label>WeLink 路径（可选）<input name="welinkPath" value="${esc(state.config.welinkPath)}" placeholder="welink-cli.exe 或 scripts/welink-cli-wrapper.js"></label><p class="muted">Windows 会尝试自动查找 npm 全局包的 wrapper。不能填写 .cmd/.bat/.ps1；没有安装时在终端完成安装及登录。</p><div class="dialog-actions"><button class="primary">保存连接配置</button>${button('关闭','close','secondary')}</div></form><details><summary>认证与同步范围</summary><p>终端登录命令：welink-cli auth login / multica login。邮件首次使用需 mail autodiscover。同步只读取最近 10 个会话、30 封邮件、今日最多 100 个日历事件/30 场会议、30 个根目录文件及 50 个 issue。历史消息按会话分页，issue 可继续翻页。其他上限会明确保留，不代表全量数据。</p><p>切换配置会清理首页缓存。已有任务仍使用提交时的工作区与 profile 跟踪。认证过期或内网不可达时显示错误，不回退为假数据。</p></details>`,'settings');}
function taskForm(title='',description='',roleKey='coordinator'){
 if(!state.config.workspaceId||!array('agents').length){notify('先初始化默认团队，即可开始任务');return teamSetup();}
 modal('交给 Agent · 检查目标与上下文',`<form id="task-form"><label>任务标题<input name="title" maxlength="250" required value="${esc(title)}"></label><label>目标、输入与允许的操作范围<textarea name="description" rows="9" maxlength="40000" required placeholder="说明期望产物；涉及代码修改时写明仓库和授权范围。">${esc(description)}</textarea></label><div class="form-grid"><label>执行 Agent<select name="agentId" required>${array('agents').map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.model)} · ${esc(a.status)}</option>`).join('')}</select></label><label>关联项目<select name="projectId"><option value="">不关联项目</option>${array('projects').map(p=>`<option value="${esc(p.id)}">${esc(p.title||p.name||p.id)}</option>`).join('')}</select></label></div><div class="notice">提交会创建 Multica issue 并立即分配执行。Agent 的实际工具权限由内网配置决定。来源消息作为输入资料，邮件回复任务仅生成草稿。</div><button class="primary">预览并确认提交</button></form>`,'task-form');
 const preferred=array('agents').find(a=>a.role===roleKey);if(preferred&&$('#task-form [name="agentId"]'))$('#task-form [name="agentId"]').value=preferred.id;
}
function showPreview(kind,payload,title){preview={kind,payload,requestId:uid()};modal(title,`<p class="muted">请检查本次操作的完整内容。确认后才调用真实 CLI。</p><pre class="document">${esc(Object.entries(payload).map(([k,v])=>`${k}:\n${v}`).join('\n\n'))}</pre>${kind==='create-calendar'?'<p class="notice">时区：中国标准时间。不传参会人；报告尚未验证无参会人时的邀请行为，请在 WeLink 核对。</p>':''}<div id="commit-result"></div><div class="dialog-actions">${button(kind==='submit'?'确认创建并执行':'确认写入 WeLink','commit','primary')}${button('返回编辑','edit-preview','secondary')}</div>`,'preview');}
function jobBody(j){return `<div class="detail-top"><span class="project-icon purple">✦</span><div class="grow"><h2>${esc(j.title)}</h2><small>${esc(j.identifier||'待关联')} · 工作区 ${esc(j.context?.workspaceId)}</small></div>${tag(status(j),j.status==='uncertain'?'danger':'')}</div><p class="muted">原始 run 状态：${esc(j.rawStatus||'尚无')} · run ID：${esc(j.runId||'等待派发')}</p>${j.pollError?`<div class="source-error">${esc(j.pollError.message)}</div>`:''}${j.error?`<div class="source-error">${esc(j.error)}</div>`:''}${j.status==='uncertain'?`<div class="notice">创建结果未确认，不会自动重试。请在 Multica 搜索任务标题或请求编号 <code>${esc(j.operationId)}</code>，核对 description 中的 OSO 请求编号后关联。</div><form id="attach-form" data-id="${esc(j.id)}"><label>已创建的 issue ID 或 identifier<input name="issueId" required></label><button class="secondary">核对并恢复跟踪</button></form>`:''}<details><summary>提交的上下文</summary><pre class="document">${esc(j.description)}</pre></details><h3>执行活动</h3><div class="run-log">${(j.activity||[]).slice(-15).map(m=>`<p>${m.seq} · ${esc(m.label)}</p>`).join('')||'等待运行时返回活动…'}</div>${j.activityError?`<p class="form-error">活动获取失败：${esc(j.activityError.message)}</p>`:''}<p class="muted">只显示工具活动摘要；中间推理和原始工具载荷不作为产物展示。</p>${j.output?`<h3>最终产物</h3><pre class="document">${esc(j.output)}</pre>`:j.resultNotice?`<p class="notice">${esc(j.resultNotice)}</p>`:''}${j.workDir?`<p class="muted">运行时产物目录：<code>${esc(j.workDir)}</code>（不自动读取磁盘文件）</p>`:''}${j.prUrl?`<p><a class="text-button" target="_blank" rel="noopener noreferrer" href="${esc(j.prUrl)}">打开关联 PR ↗</a></p>`:''}<div class="dialog-actions">${j.issueId?button('刷新状态','refresh-job','secondary',j.id):''}${j.output?button('下载最终产物','download','secondary',j.id):''}${j.status==='review'?button('我已检查，验收完成','accept','primary',j.id):''}${j.acceptedAt?tag('验收于 '+time(j.acceptedAt),'success'):''}</div>`;}
function showJob(id){const j=state.jobs.find(j=>j.id===id);if(!j)return;activeJob=id;modal('任务执行与产物',`<div id="job-content">${jobBody(j)}</div>`,'job');}
function historyBody(){return `<p class="muted">只在本地记录已读；@ 文本仅为提示，不能可靠判断是否提到本人。</p><div>${history.map((m,i)=>`<article class="message-card"><small>${esc(m.sender)} · ${time(m.sentAt)} · ${esc(m.contentType)}</small><pre class="message-body">${esc(m.body)}</pre><div class="dialog-actions">${button('转为真实任务','history-task','primary small',String(i))}${button('起草回复','history-reply','secondary small',String(i))}</div></article>`).join('')||empty('该会话没有返回消息。')}</div>${historyCursor?button('加载更早消息','history-more','secondary'):''}`;}
function summaryContext(){return `请根据以下真实工作记录生成工作总结。区分“Agent 产出”“用户已验收”和“未完成”；不要编造进展。只输出文档，不发送消息或邮件。\n\n${state.jobs.map(j=>`${j.identifier||j.id} | ${j.title} | ${status(j)}\n${j.output||'尚无最终产物'}`).join('\n\n')||'当前没有任务记录，请指出信息不足。'}`;}
function eventForm(values={}){const day=new Date().toLocaleDateString('sv-SE');modal('创建 WeLink 个人日程',`<form id="event-form"><label>日程标题<input name="title" required value="${esc(values.title)}"></label><div class="form-grid"><label>开始（北京时间）<input name="start" type="datetime-local" required value="${esc(values.start||day+'T10:00')}"></label><label>结束（北京时间）<input name="end" type="datetime-local" required value="${esc(values.end||day+'T11:00')}"></label></div><label>备注<textarea name="body" rows="3">${esc(values.body)}</textarea></label><p class="muted">冲突检查会先重新读取所选日期范围的日历。最多 100 个可见事件，不包含你无权查看的日程。</p><button class="primary">检查冲突并预览</button></form>`,'event-form');}
function replyForm(values){preview=null;modal('WeLink 回复草稿',`<form id="reply-form" data-kind="${esc(values.kind)}"><label>${values.kind==='reply-mail'?'邮件 ItemId':'接收方 ID'}<input name="${values.kind==='reply-mail'?'itemId':'target'}" required value="${esc(values.itemId||values.target)}" readonly></label>${values.kind==='send-im'?`<input name="targetType" type="hidden" value="${esc(values.targetType)}">`:''}<label>完整发送内容<textarea name="body" rows="8" maxlength="10000" required>${esc(values.body||'')}</textarea></label><div class="notice">这是实际写回操作，下一步将展示内容供确认，不会自动发送。</div><button class="primary">预览写回</button></form>`,'reply-form');}

document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-act]');if(!b||b.disabled)return;const a=b.dataset.act,id=b.dataset.id;
 try{
  if(a==='close')return close();
  if(a==='nav'){page=id;render();return;}
  if(a==='settings')return settings();
  if(a==='team-setup'){if(initializingTeam)return notify('默认团队正在初始化，请稍候');return teamSetup();}
  if(a==='team-role'){
    const r=state.agentBlueprints.find(r=>r.key===id);if(!r)return;
    if(array('agents').some(a=>a.role===id))return roleTask(id,r.starter,id==='reporter'?summaryContext():r.prompt);
    return modal(r.name,`<p>${esc(r.description)}</p><p>交付：${esc(r.deliverable)}</p><pre class="document">${esc(r.instructions)}</pre>${button('初始化默认团队','team-setup','primary')}`);
  }
  if(a==='sync'){
    if(syncing)return;syncing=true;render();
    try{state=await api('sync',{});notify(Object.values(state.cache).some(v=>v.error)?'同步完成，部分来源失败，详情见提示':'工作信息已同步');}finally{syncing=false;render();}return;
  }
  if(['tasks','messages','calendar','knowledge','tools'].includes(a)){page={tasks:'任务中心',messages:'信息中心',calendar:'信息中心',knowledge:'知识库',tools:'工具中心'}[a];render();return;}
  if(a==='new-task')return taskForm();
  if(a==='job')return showJob(id);
  if(a==='refresh-job'){b.disabled=true;await api('refresh',{id});await load();render();showJob(id);return;}
  if(a==='accept'){b.disabled=true;await api('accept',{id,confirmed:true});await load();render();showJob(id);notify('已记录人工验收');return;}
  if(a==='download'){const j=state.jobs.find(j=>j.id===id),url=URL.createObjectURL(new Blob([j.output],{type:'text/markdown;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=j.title.replace(/[<>:"/\\|?*]/g,'_')+'.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  if(a==='conversation'){
    b.disabled=true;conversation=array('conversations').find(c=>c.id===id);const r=await api('query',{kind:'history',conversation});history=r.rows;historyCursor=r.mayHaveMore?r.before:null;
    modal(conversation.title,historyBody(),'history');return;
  }
  if(a==='history-more'){
    b.disabled=true;const r=await api('query',{kind:'history',conversation,before:historyCursor});const seen=new Set(history.map(m=>m.id));history.push(...r.rows.filter(m=>!seen.has(m.id)));historyCursor=r.mayHaveMore&&r.before!==historyCursor?r.before:null;modal(conversation.title,historyBody(),'history');return;
  }
  if(a==='history-task'){const m=history[Number(id)];return taskForm(`处理：${m.title}`,`目标：请根据以下消息梳理待办与可交付的处理方案。\n来源：WeLink ${m.conversation.kind==='group'?'群聊':'单聊'} ${m.title}\n消息 ID：${m.remoteId}\n发言人：${m.sender}\n时间：${m.sentAt}\n\n原始消息：\n${m.body}\n\n只生成方案，不向外部发送消息。`);}
  if(a==='history-reply'){const m=history[Number(id)];return replyForm({kind:'send-im',targetType:m.conversation.kind,target:m.conversation.target});}
  if(a==='mail'){
    b.disabled=true;const m=array('mail').find(m=>m.id===id);const detail=await api('query',{kind:'mail',id:m.remoteId});mailDetail={...m,...detail,remoteId:m.remoteId,id:m.id};
    await api('read',{id:m.id});state.reads[m.id]=true;render();
    modal(detail.subject||m.title,`<p class="muted">${esc(detail.fromEmail||detail.from)} · ${time(detail.dateTimeReceived)}</p><pre class="document">${esc(detail.body||'(无正文)')}</pre><p class="muted">附件：${esc((detail.attachments||[]).map(a=>a.name||a.Name||'附件').join('、')||'无')}</p><div class="dialog-actions">${button('转为真实任务','mail-task','primary')}${button('起草回复','mail-reply','secondary')}</div>`,'mail');return;
  }
  if(a==='mail-task')return taskForm(`处理：${mailDetail.subject||mailDetail.title}`,`来源：WeLink 邮件\nItemId：${mailDetail.remoteId}\n发件人：${mailDetail.sender}\n主题：${mailDetail.subject||mailDetail.title}\n\n${mailDetail.body}\n\n目标：梳理处理计划或回复草稿，不实际发送邮件。`);
  if(a==='mail-reply')return replyForm({kind:'reply-mail',itemId:mailDetail.remoteId});
  if(a==='event'){
    b.disabled=true;const item=[...array('calendar'),...array('meetings')].find(v=>v.id===id);const d=await api('query',{kind:item.source,id:item.remoteId});
    modal(item.title,`<p class="muted">${time(item.start)} — ${time(item.end)} · ${esc(item.source)}</p><pre class="document">${esc(d.body||'该接口没有提供纪要正文。')}${d.location?'\n地点：'+esc(d.location):''}</pre><p class="muted">会议与日历 ID 分别处理；不将空纪要推断为已有会议结论。</p>`);return;
  }
  if(a==='new-event')return eventForm();
  if(a==='file'){
    const rows=[...(channel('files')?.rows||[]),...(fileRows.results||[])];const f=rows.find(f=>f.id===id);if(!f)return;
    b.disabled=true;const d=await api('query',{kind:'file',id:f.remoteId,spaceId:f.spaceId});
    modal(f.title,`<p>云空间文件 · ${esc(f.spaceId)} / ${esc(f.remoteId)}</p><p class="muted">当前接口提供文件元数据，未读取文件正文。搜索范围是文件名。</p><pre class="document">${esc(JSON.stringify({name:d.name,size:d.size,versions:d.versions,modifiedAt:d.modifiedAt,previewable:d.previewable},null,2))}</pre>`);return;
  }
  if(a==='summary')return roleTask('reporter','真实工作记录总结',summaryContext());
  if(a==='helper'){
    if(id==='knowledge'){page='知识库';render();return;}
    const names={report:'工作总结',meeting:'会议整理',code:'代码分析',plan:'生成方案',reply:'回复草稿'};
    return roleTask(({report:'reporter',meeting:'meeting',code:'developer',plan:'coordinator',reply:'communicator'})[id],names[id],id==='report'?summaryContext():id==='code'?'请填写代码仓库、需要分析的模块、问题和允许的操作范围。默认只读分析，不修改代码。':id==='reply'?'请在此粘贴原始消息，生成回复草稿，不实际发送。':'请补充原始材料和预期输出，未提供的信息不要编造。');
  }
  if(a==='more-issues'){b.disabled=true;issuePage=await api('query',{kind:'issues',offset:(issuePage?.offset||0)+50});render();return;}
  if(a==='edit-preview'){
    const p=preview;if(p.kind==='submit')return taskForm(p.payload.title,p.payload.description);
    if(p.kind==='create-calendar')return eventForm(p.payload);
    return replyForm({kind:p.kind,...p.payload});
  }
  if(a==='commit'){
    if(!preview)return;const current=preview;b.disabled=true;
    const r=await api(current.kind==='submit'?'submit':'write',{...current.payload,kind:current.kind,requestId:current.requestId,confirmed:true});
    await load();render();
    if(r.job){showJob(r.job.id);return;}
    modal('写回结果',`<div class="notice">${r.operation.state==='succeeded'?'CLI 已成功返回，请在 WeLink 核对。':r.operation.state==='uncertain'?'结果未确认：可能已经写入，请先在 WeLink 核对，避免重复发送。':'操作失败'}</div>${r.operation.error?`<p class="form-error">${esc(r.operation.error.message)}</p>`:''}<pre class="document">${esc(r.operation.result?.receipt||'')}</pre><small>请求编号 ${esc(r.operation.id)}</small>`);return;
  }
 }catch(err){notify(err.message);if(dialogKind==='preview'&&$('#commit-result'))$('#commit-result').textContent='请求未确认时请在工具中心核对记录。相同确认按钮会复用请求编号。';}
 finally{if(b.isConnected)b.disabled=false;}
});

document.addEventListener('submit',async e=>{
 e.preventDefault();const f=e.target,values=Object.fromEntries(new FormData(f)),submit=f.querySelector('button[type="submit"],button:not([type])');if(submit?.disabled)return;if(submit)submit.disabled=true;
 try{
  if(f.id==='team-form'){
    if(initializingTeam)return;initializingTeam=true;
    const resultBox=$('#team-result');if(resultBox)resultBox.innerHTML='<p class="muted">正在逐个创建并验证角色，可保留此窗口等待；重复点击不会重复创建。</p>';
    try{
      const result=await api('team-initialize',values);state=result.state;render();
      modal('默认团队初始化结果',`<p>${result.complete?'默认团队已就绪。现在可以点击首页角色卡或 AI 助手开始工作。':'部分角色尚未就绪。已完成角色保留，处理原因后可再次检测补齐。'}</p>${result.results.map(r=>`<article class="operation-row"><span class="grow"><strong>${esc(r.name)}</strong>${r.error?`<p class="form-error">${esc(r.error)}</p>`:''}<small>${esc(r.agentId||'')}</small></span>${tag(r.state==='ready'?(r.reused?'已复用':'已创建'):r.state,r.state==='ready'?'success':'danger')}</article>`).join('')}<div class="dialog-actions">${button('开始使用','close','primary')}${button('重新检测 / 补齐','team-setup','secondary')}${button('同步工作信息','sync','text-button')}</div>`,'team-result');
    }finally{initializingTeam=false;}return;
  }
  if(f.id==='connection-form'){state=await api('config',values);close();render();notify('配置已保存，请同步工作信息');return;}
  if(f.id==='task-form')return showPreview('submit',values,'确认创建真实任务');
  if(f.id==='reply-form')return showPreview(f.dataset.kind,values,'确认写回 WeLink');
  if(f.id==='event-form'){
    if(Date.parse(values.end+'+08:00')<=Date.parse(values.start+'+08:00'))throw Error('结束时间必须晚于开始时间');
    const result=await api('query',{kind:'calendar-range',start:values.start.slice(0,10),end:values.end.slice(0,10)});
    const conflict=result.rows.find(v=>!v.cancelled&&v.availability!=='Free'&&Date.parse(values.start+'+08:00')<Date.parse(v.end)&&Date.parse(values.end+'+08:00')>Date.parse(v.start));
    if(conflict)throw Error(`与“${conflict.title}”冲突，请调整时间`);
    if(result.truncated)throw Error('该日期范围日程达到查询上限，无法完整检查冲突，请缩小范围');
    return showPreview('create-calendar',values,'确认创建 WeLink 日程');
  }
  if(f.id==='attach-form'){await api('attach',{id:f.dataset.id,issueId:values.issueId});await load();render();showJob(f.dataset.id);return;}
  if(f.id==='cloud-search'){
    const spaceId=channel('files')?.spaceId;if(!spaceId)throw Error('请先同步并成功获取个人云空间 ID');
    const result=await api('query',{kind:'files',spaceId,text:values.text});fileRows.results=result.rows;$('#cloud-results').innerHTML=`<p class="muted">找到 ${result.total??result.rows.length} 个文件，展示前 50 条 · 仅文件名匹配</p>${fileRows(result.rows)}`;
  }
 }catch(err){notify(err.message);}finally{if(submit?.isConnected)submit.disabled=false;}
});
$('#overlay').addEventListener('click',e=>{if(e.target.classList.contains('backdrop'))close();});
document.addEventListener('change',e=>{if(e.target.id==='team-workspace'&&e.target.value&&!initializingTeam)teamSetup(e.target.value);});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape')close();
 if(e.key==='Tab'&&dialogKind){const fields=[...document.querySelectorAll('.dialog button,.dialog input,.dialog textarea,.dialog select,.dialog summary,.dialog a')].filter(el=>!el.disabled&&el.type!=='hidden');const first=fields[0],last=fields.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
// Poll stored results, not the CLI, and avoid overlapping requests or replacing active form inputs.
let updating=false;
setInterval(async()=>{
 if(updating||document.hidden||syncing)return;updating=true;
 try{const previous=JSON.stringify(state.jobs);await load();if(previous!==JSON.stringify(state.jobs)){render();if(dialogKind==='job'&&$('#job-content')&&!$('#attach-form')){const j=state.jobs.find(j=>j.id===activeJob);if(j)$('#job-content').innerHTML=jobBody(j);}}}catch{}finally{updating=false;}
},5000);
try{await load();render();}catch(err){$('#app').innerHTML=`<div class="startup-error"><h1>真实工作台暂时不可用</h1><p>${esc(err.message)}</p><a href="/">打开演示模式</a></div>`;}
