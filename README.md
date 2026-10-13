# OSO · 个人智能工作台

面向研发人员，以 WeLink 汇聚工作信息，以 Multica 组织 Agent 执行。Node.js 22+，零运行时依赖，不需要 `npm install`。

## 启动

Windows 双击 `start.cmd`，或运行：

```powershell
node server.mjs
```

- 演示工作台：http://127.0.0.1:3210/
- **真实工作台：http://127.0.0.1:3210/#live**

首页顶部可以切换模式。演示与真实数据独立保存；真实连接失败不会回退为模拟数据。关闭终端或 Ctrl+C 停止。设置 `PORT` 可改变端口。

## 内网首次使用

1. 在最终使用电脑上安装并登录 WeLink CLI 和 Multica。参考已有 CLI 文档；服务继承当前用户的登录环境，不在页面接收 Token。
2. 邮件/日历首次使用应先在终端完成 `welink-cli mail autodiscover --email 你的邮箱`。
3. 启动 OSO，进入真实工作台，打开“连接设置”。可以先保留默认路径、profile 和服务地址，保存后点击“同步工作信息”。
4. 再打开连接设置，从读取到的工作区列表复制 UUID 到“工作区 ID”，保存并重新同步。若工作区查询失败，先确认 Multica 登录和 profile。
5. 选择一封邮件读取完整正文，或打开 WeLink 会话读取消息，点击“转为真实任务”。也可以直接创建任务。
6. 编辑目标、上下文、允许的操作范围，选择 Agent 和可选项目。预览后点击“确认创建并执行”。这会真实创建 issue 并分配 Agent。
7. 后端每约 5 秒跟踪 run；在任务详情查看工具活动摘要和最终产物。检查后点击“我已检查，验收完成”。

Multica Agent 可以执行哪些工具、是否修改代码，由其内网权限和任务目标决定。OSO 不创建或修改 Agent/Runtime，不自动启动 daemon。报告观察到 desktop runtime 在线而独立 daemon 显示 stopped，因此应以实际 runtime 和 run 结果为准。

## CLI 路径与配置

Multica v1.1.8 是原生 exe，可直接调用。WeLink 1.0.14 的 npm 包提供 `scripts/welink-cli-wrapper.js`，再启动 Rust exe，不能假定它是普通 Node CLI。

服务使用 `execFile` 和参数数组，**不使用 shell 拼接**。Windows 自动尝试 PATH 中的 `welink-cli.exe`，以及 PATH / `%APPDATA%\npm` 下的 `node_modules/@welink/welink-cli/package.json` 中 `bin` 指向的 wrapper。

自动发现失败时，在连接设置指定：

- Multica：`C:\实际目录\multica.exe`
- WeLink：实际 `welink-cli.exe`，或 `C:\实际npm目录\node_modules\@welink\welink-cli\scripts\welink-cli-wrapper.js`

不要填写 `.cmd`、`.bat`、`.ps1` 包装器。真实路径应以安装包为准。

也支持启动环境变量：

```powershell
$env:MULTICA_CLI_PATH = 'C:\实际目录\multica.exe'
$env:WELINK_CLI_ENTRY = 'C:\实际npm目录\node_modules\@welink\welink-cli\scripts\welink-cli-wrapper.js'
node server.mjs
```

页面保存的路径优先于 `*_CLI_ENTRY`，再优先于 `*_CLI_PATH`，最后自动发现。Multica 的 profile、server URL、workspace 通过 CLI 全局 flags 传入，不覆盖已有登录文件。已有任务保存提交时的连接上下文，切换工作区不改变它们的跟踪目标。

## 真实能力

| 场景 | 当前实现 |
| --- | --- |
| 工作信息 | 最近 10 个 WeLink 会话、按会话读取 30 条历史并向前翻页；64 位消息 ID 保留为字符串 |
| 邮件 | 最近 30 封邮件；打开时获取完整纯文本正文；已读状态仅本地维护 |
| 日程 | 今日最多 100 个日历项和 30 场会议；分来源展示，不猜测重复项 |
| 云空间 | 个人空间根目录前 30 个文件、文件名搜索前 50 条、文件元数据 |
| Multica 资源 | 工作区、项目、Agent、Runtime、每页 50 条远端 issue，可翻页 |
| 执行 | `issue create --description-file --assignee-id`；明确确认后立即创建并执行 |
| 跟踪 | 持久化 issue/run ID；固定一个 run；`run-messages --since` 增量跟踪；重启恢复 |
| 产物 | 仅使用 `run.result.output`，不把中间文本冒充最终回答；可下载 Markdown、打开有效 HTTP(S) PR 链接 |
| 人工验收 | Agent 完成后进入待验收；OSO 独立记录用户验收，不依赖 Agent 自行修改的 issue 状态 |
| AI 助手 | 将明确上下文交给所选 Agent 生成总结、方案、会议整理、分析或回复草稿 |
| 写回 | 原邮件回复、群/个人 IM 发送、无参会人日程创建；每次展示完整参数并确认后调用 |
| 容错 | 各来源独立错误，保留上次成功缓存；未知 run 状态显式显示；不自动重试写入 |

日程创建前重新查询所选日期范围，检查可见日历冲突。查询达到 100 条上限时拒绝宣称完整检查。时区固定为 `China Standard Time`。未传参会人，但报告没有验证该场景的邀请行为，确认页会说明这一点。

### 提交超时 / 网络中断

每次操作使用一个持久化请求编号。同一编号不会再次发起远端写入。CLI 超时、解析失败、异常退出或服务在写入过程中中断时，记录为“结果未确认”；**不要换一个新请求直接重发**。

Multica 创建存在不确定性时，在远端查找对应标题，并核对描述里的 `[OSO 请求编号: ...]`。将 issue ID/identifier 填入任务详情的恢复表单；后端验证请求标记后恢复跟踪。WeLink 写回不确定时，请先在 WeLink 核对；工具中心保存操作状态及错误。

请求编号仅防止 OSO 重复提交，不声称 CLI/服务端支持幂等键。远端并发执行、返回 run 的失败/取消枚举和认证过期行为仍需内网实测。

## 保留的演示模式

无需 CLI 即可体验：消息转任务 → 模板产物 → 验收 → 总结，以及日程冲突、知识笔记、搜索和下载。人物、消息、项目进度和文档均为示例，不是实际 Office/PDF 文件。演示中的 AI 执行是确定性模板。

## 数据与实现边界

- `data/state.json`：演示状态。
- `data/integration.json`：真实连接配置、来源缓存、运行状态、请求记录和本地已读状态。包含工作信息，仅留在本机，已被 Git 忽略。
- 创建任务时短暂写 UTF-8 描述文件到数据目录，调用完成后清理。进程意外中断可能留下该文件，不对浏览器开放访问。
- 可用 `OSO_DATA_DIR` 指定数据目录。服务绑定 `127.0.0.1`，校验 Host、Origin、跨站请求、请求体大小和固定接口操作。
- 实时任务日志仅展示工具名称和处理状态，不展示中间推理、工具参数或原始工具返回。
- 不下载云空间正文、不递归扫描 runtime 产物目录、不自动打开文件路径。页面显示的 runtime 目录不保证属于当前电脑。
- @ 文本不等于可靠的“@ 我”；无深链接契约时不构造跳转链接。
- 不提供取消/重跑、评论触发继续执行、Squad 编排或自动发送。这些可基于进一步验证补充。
- 缓存同步由用户触发，任务运行状态由后端自动跟踪。数据写入串行化；此版本面向个人本机使用，不是多用户服务器。

## 验证

```powershell
npm.cmd test
node --check server.mjs
node --check public/live.js
```

测试通过独立临时数据目录和模拟 CLI 验证报告中的契约，不调用实际内网服务：长 ID、JSON/业务错误、读数据适配、确认门槛、重复提交、超时恢复、run 固定、最终产物、验收、重启和来源部分失败。

可选浏览器测试需要本机已安装 Playwright。可设置 `PLAYWRIGHT_MODULE` 为其 `index.mjs` 的 file URL、`BROWSER_EXECUTABLE` 为兼容 Chromium 路径，然后运行：

```powershell
node tests/live-browser.mjs
```

该测试自启端口 3223 的隔离服务，注入 `tests/fixtures/cli.mjs`，自动关闭服务。截图保存到 `test-results/`。覆盖完整邮件 → 确认 → 任务 → 产物 → 验收、刷新持久化、IM 精确 ID、回复确认、日程冲突、云空间搜索、移动布局和模式切换。此结果**不代表已经在用户内网完成实连验证**。
