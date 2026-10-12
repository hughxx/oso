# Multica CLI 命令总览

> 生成时间：2026-10-12  
> 来源：`multica --help` 及所有子命令 `--help` 递归探查

---

## 全局用法

```
multica <command> <subcommand> [flags]
```

### 全局 Flags

| Flag | 说明 |
|---|---|
| `--debug` | 失败时打印完整错误信息（环境变量 `MULTICA_DEBUG`） |
| `-h, --help` | 显示帮助 |
| `--profile string` | 配置 profile 名称（如 dev），隔离配置、daemon 状态和工作区 |
| `--server-url string` | Multica 服务端 URL（环境变量 `MULTICA_SERVER_URL`） |
| `-v, --version` | 打印版本 |
| `--workspace-id string` | 工作区 ID（环境变量 `MULTICA_WORKSPACE_ID`） |

### 环境变量

| 变量 | 说明 |
|---|---|
| `MULTICA_SERVER_URL` | 覆盖默认服务端 URL |
| `MULTICA_WORKSPACE_ID` | 设置活跃工作区 |

---

## 核心命令（CORE COMMANDS）

### 1. agent — 管理智能体

| 子命令 | 说明 |
|---|---|
| `archive` | 归档一个 agent |
| `avatar` | 为 agent 上传头像图片 |
| `create` | 创建新 agent |
| `env` | 读取和更新 agent 的自定义环境变量（有审计） |
| `get` | 获取 agent 详情 |
| `list` | 列出工作区中的 agent |
| `restore` | 恢复已归档的 agent |
| `skills` | 管理 agent 的技能分配 |
| `tasks` | 列出 agent 的任务 |
| `update` | 更新 agent |

### 2. autopilot — 管理自动化驾驶（定时/触发式 agent 自动化）

| 子命令 | 说明 |
|---|---|
| `create` | 创建新 autopilot |
| `delete` | 删除 autopilot |
| `get` | 获取 autopilot 详情（含触发器） |
| `list` | 列出工作区中的 autopilot |
| `runs` | 列出 autopilot 的执行历史 |
| `trigger` | 手动触发一次 autopilot 执行 |
| `trigger-add` | 为 autopilot 添加定时或 webhook 触发器 |
| `trigger-delete` | 删除一个触发器 |
| `trigger-rotate-url` | 轮换 webhook 触发器的 URL |
| `trigger-update` | 更新已有触发器 |
| `update` | 更新 autopilot |

### 3. chat — 当前聊天会话

| 子命令 | 说明 |
|---|---|
| `history` | 查看当前频道概览（消息 + 线程列表） |
| `thread` | 读取某个线程的消息（当前线程或指定 ID） |

### 4. issue — 管理议题

| 子命令 | 说明 |
|---|---|
| `assign` | 将 issue 分配给成员、agent 或 squad |
| `cancel-task` | 取消运行中或排队的任务（中断进行中的 agent） |
| `children` | 列出 issue 的子 issue（按阶段分组） |
| `comment` | 管理 issue 评论 |
| `create` | 创建新 issue |
| `get` | 获取 issue 详情 |
| `label` | 管理 issue 上的标签 |
| `list` | 列出工作区中的 issue |
| `metadata` | 管理 issue 级别的元数据（KV） |
| `pull-requests` | 列出与 issue 关联的 Pull Request |
| `reorder` | 在状态列内移动 issue |
| `rerun` | 将 issue 的当前 agent 分配重新入队为新任务 |
| `run-messages` | 列出某次执行的消息 |
| `runs` | 列出 issue 的执行历史 |
| `search` | 按标题或描述搜索 issue |
| `status` | 修改 issue 状态 |
| `subscriber` | 管理 issue 订阅者 |
| `update` | 更新 issue |
| `usage` | 显示 issue 的聚合 token 用量 |

### 5. label — 管理议题标签

| 子命令 | 说明 |
|---|---|
| `create` | 创建新标签 |
| `delete` | 删除标签 |
| `get` | 获取标签详情 |
| `list` | 列出工作区中的标签 |
| `update` | 更新标签 |

### 6. project — 管理项目

| 子命令 | 说明 |
|---|---|
| `create` | 创建新项目 |
| `delete` | 删除项目 |
| `get` | 获取项目详情 |
| `list` | 列出工作区中的项目 |
| `resource` | 管理附加到项目的资源 |
| `status` | 修改项目状态 |
| `update` | 更新项目 |

### 7. repo — 管理代码仓库

| 子命令 | 说明 |
|---|---|
| `add` | 将仓库添加到工作区注册表 |
| `checkout` | 将仓库检出到工作目录 |
| `list` | 列出工作区仓库 |
| `remove` | 从工作区注册表移除仓库 |

### 8. skill — 管理技能

| 子命令 | 说明 |
|---|---|
| `create` | 创建新技能 |
| `delete` | 删除技能 |
| `files` | 管理技能文件 |
| `get` | 获取技能详情（含文件） |
| `import` | 从 URL（clawhub.ai、skills.sh、github.com）或本地 .skill/.zip 归档导入技能 |
| `list` | 列出工作区中的技能 |
| `search` | 搜索可安装的技能 |
| `update` | 更新技能 |

### 9. squad — 管理小队

| 子命令 | 说明 |
|---|---|
| `activity` | 在 issue 上记录小队负责人评估 |
| `create` | 创建新小队 |
| `delete` | 删除（归档）小队 |
| `get` | 获取小队详情 |
| `list` | 列出工作区中的小队 |
| `member` | 管理小队成员 |
| `update` | 更新小队 |

### 10. workspace — 管理工作区

| 子命令 | 说明 |
|---|---|
| `get` | 获取工作区详情 |
| `list` | 列出你所属的所有工作区 |
| `member` | 管理工作区成员 |
| `switch` | 设置当前 profile 的默认工作区 |
| `update` | 更新工作区元数据（仅 admin/owner） |

---

## 运行时命令（RUNTIME COMMANDS）

### 11. daemon — 控制本地 agent 运行时守护进程

| 子命令 | 说明 |
|---|---|
| `disk-usage` | 显示 daemon 工作区磁盘用量（按任务或工作区） |
| `logs` | 显示 daemon 日志 |
| `restart` | 重启运行中的 daemon（stop + start） |
| `start` | 启动本地 agent 运行时 daemon |
| `status` | 显示 daemon 状态 |
| `stop` | 停止运行中的 daemon |

### 12. runtime — 管理 agent 运行时

| 子命令 | 说明 |
|---|---|
| `activity` | 获取运行时的每小时任务活动 |
| `delete` | 从工作区删除运行时 |
| `list` | 列出工作区中的运行时 |
| `profile` | 管理自定义运行时 profile |
| `rename` | 为运行时设置自定义显示名 |
| `update` | 在运行时上发起 CLI 更新 |
| `usage` | 获取运行时的 token 用量 |

---

## 附加命令（ADDITIONAL COMMANDS）

### 13. attachment — 管理附件

| 子命令 | 说明 |
|---|---|
| `download` | 下载附件到本地文件 |
| `upload` | 上传文件以附加到聊天回复 |

### 14. auth — 认证管理

| 子命令 | 说明 |
|---|---|
| `logout` | 移除已存储的认证令牌 |
| `status` | 显示当前认证状态 |

### 15. config — 配置管理

| 子命令 | 说明 |
|---|---|
| `set` | 设置 CLI 配置值 |
| `show` | 显示当前 CLI 配置 |

### 16. login — 登录

```
multica login [flags]
```

| Flag | 说明 |
|---|---|
| `--callback-host string` | OAuth 回调 URL 的主机/IP（浏览器可直接访问 CLI 时使用） |
| `--token string[="prompt"]` | 使用个人访问令牌认证（`mul_...` 用户 PAT 或 `mcn_...` Cloud Node PAT） |

### 17. setup — 初始化配置

| 子命令 | 说明 |
|---|---|
| `cloud` | 为 Multica Cloud（multica-ai.rnd.huawei.com）配置 CLI |
| `self-host` | 为自托管 Multica 服务端配置 CLI |

| Flag | 说明 |
|---|---|
| `--callback-host string` | OAuth 回调 URL 的主机/IP |

### 18. update — 更新 CLI

```
multica update [flags]
```

| Flag | 说明 |
|---|---|
| `--download-timeout duration` | 等待发布归档下载的最长时间（默认 2m0s） |

### 19. user — 用户账户

| 子命令 | 说明 |
|---|---|
| `profile` | 获取或更新你的个人资料 |

### 20. version — 版本信息

```
multica version [flags]
```

| Flag | 说明 |
|---|---|
| `--output string` | 输出格式：text 或 json（默认 text） |

---

## 命令速查统计

| 类别 | 命令数 |
|---|---|
| 核心命令 | 10 |
| 运行时命令 | 2 |
| 附加命令 | 8 |
| **总计** | **20** |

### 示例

```bash
multica login
multica issue list --output json
multica daemon start
multica agent list --output json
```
