# OSO · 个人智能工作台

基于提供的产品原型和 WeLink / Multica 命令文档实现的本地演示系统。Node.js 22+，零运行时依赖，不需要 npm install。

## 启动

Windows 双击 `start.cmd`，或在此目录运行：

```powershell
node server.mjs
```

浏览器访问 http://127.0.0.1:3210 。关闭终端或 Ctrl+C 停止。端口被占用时可设置 `PORT` 环境变量，浏览器访问对应端口。

## 建议演示路径

1. 首页查看今日重点、消息、会议、项目和知识文件。
2. 点击“AI 已为你筛选”，将紧急消息转为任务，保留消息上下文。
3. 点击“开始演示执行”，查看执行计划与日志，打开生成的 Markdown 产物。
4. 验收任务，观察今日重点、工作总结和最近记忆更新。
5. 使用“安排日程”添加空闲时段；重叠时段会提示冲突。
6. 使用 Ctrl+K 跨消息、任务和文档搜索；知识库可新建笔记、预览与下载。
7. 用 AI 助手生成周报草稿、整理输入的会议记录、生成方案或邮件回复草稿。
8. 生成今日总结，下载文档；刷新页面验证持久化。

## 实现与边界

- 前端：原生 JavaScript / CSS，响应式三列工作台，无构建工具或外部字体依赖。
- 后端：Node.js HTTP 服务，仅绑定 127.0.0.1；限制 Host、跨站请求、请求大小和可执行命令。
- 数据保存在 `data/state.json`，写入采用串行队列和临时文件替换。可在连接设置导出 JSON 备份和重置演示。单用户、单页面会话为目标，多标签同时修改可能覆盖。
- 初始人物、消息、项目进度、日程和文档都是演示数据。项目进度是演示快照。初始文档显示原型中的文件名称，预览内容为本地文本示例，不是真实 Office/PDF 文件。
- AI 助手和任务执行为确定性模板演示，不调用大模型、不运行代码、不声称完成真实研发任务。生成的方案需要人工检查；任务只有验收后才计入完成数。
- 邮件回复仅保存草稿，日历仅保存本地日程，不对外发送消息或邀请。知识搜索为本地关键词检索。
- 真实 CLI 接入目前是独立的只读连接面板，不会自动将远端数据合并到演示工作台，也未实现远端 issue 创建、agent 分配和执行轮询。

## 连接真实 CLI

先按用户提供的 `SKILL.md` 和 `multica-commands.md` 在本机安装、登录并配置 CLI。服务继承当前用户环境，不读取或记录认证令牌。

连接设置支持：

| 连接 | 实际调用 |
| --- | --- |
| WeLink | `auth status`、`im query-recent-conversation`、`mail --format json list`、`calendar --format json list` |
| Multica | `auth status`、`agent list --output json`、`issue list --output json`、`daemon status` |

邮件和日历首次使用需根据文档完成 `welink-cli mail autodiscover --email 你的邮箱`。Multica 需选定工作区。

Windows 的 npm CLI 通常是 `.cmd` 包装器。服务不通过 shell 拼接命令；如无法直接执行，设置 JavaScript 入口路径再启动：

```powershell
# 路径请根据已安装包的 package.json 中 bin 字段确定，不是 .cmd 文件
$env:WELINK_CLI_ENTRY = 'C:\实际路径\welink-cli\dist\入口文件.js'
node server.mjs
```

Multica 若是原生可执行文件，放入 PATH 即可；若也是 Node CLI，可设置 `MULTICA_CLI_ENTRY`。未安装、未登录或内网不可达时页面显示真实错误，演示仍可使用。只允许固定白名单中的命令，超时 20 秒。

## 检查

```powershell
node --check server.mjs
node --check public/app.js
npm.cmd test
```

`tests/server.test.mjs` 检查静态文件边界、跨站写入阻止、CLI 白名单及数据格式校验。
