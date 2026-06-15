# Takagi Q Interactive Pet

一个基于 Electron 的 macOS 桌面宠物。Takagi Q 会悬浮在桌面上，可以拖拽、互动、聊天，也可以通过 DeepSeek 或 OpenAI 回复消息。当前版本还实验性接入了 Safari：当你让她查资料、搜索网页或总结当前页面时，她会尝试读取 Safari 中的网页内容，再用大模型整理成中文回复。

## 功能

- 桌面悬浮宠物：透明窗口、置顶显示、可拖拽移动。
- 角色动画：待机、奔跑、挥手、跳跃、等待、失败、思考等状态。
- 随机台词：拖拽、思考、点击和日常互动会随机说不同的话。
- 聊天面板：双击 Takagi 打开输入框，支持 DeepSeek / OpenAI。
- API key 设置：在聊天面板里点击 `Key` 保存当前服务的 key。
- Safari 查资料：DeepSeek 模式下，可通过 Safari 搜索、打开网页、读取当前网页并总结。
- macOS 启动脚本：提供启动、关闭、状态检查和开机自启脚本。

## 项目结构

```text
.
├── electron-main.js           # Electron 主进程：窗口、AI、Safari 工具、控制服务
├── electron-preload.js        # 主进程和页面之间的安全桥接
├── app.js                     # 前端交互：动画、拖拽、聊天框、台词
├── index.html                 # 桌宠界面结构
├── styles.css                 # 桌宠、气泡、聊天面板样式
├── Resources/
│   ├── spritesheet.webp       # Takagi 动画图集
│   ├── TakagiQ.icns           # macOS 图标
│   └── takagi-q-icon-source.png
├── launchers/                 # 当前 macOS 启动器
├── legacy-launchers/          # 旧版唤醒/睡眠启动器
└── docs/
    └── conversation-log.md    # 开发记录
```

## 安装

需要 macOS 和 Node.js。

```bash
npm install
```

> 注意：发布到 GitHub 前，请确认 `package.json` 和 `package-lock.json` 已在项目根目录中。它们负责声明 Electron 入口和依赖，是别人 clone 后运行项目所必需的文件。

## 启动

开发运行通常使用：

```bash
npm start
```

也可以使用脚本：

```bash
./petctl.command start
./petctl.command stop
./petctl.command status
```

开机自启：

```bash
./petctl.command autostart-on
./petctl.command autostart-off
```

## 使用 AI 聊天

1. 启动 Takagi Q。
2. 双击 Takagi 打开聊天框。
3. 点击 `Key`。
4. 选择 `DeepSeek` 或 `OpenAI`。
5. 输入对应 API key 并保存。

API key 会保存在 Electron 的本地用户数据目录，不应该提交到 GitHub。

## Safari 查资料

当前版本的 Safari 工具主要服务于 DeepSeek 模式。你可以说：

- “帮我用 Safari 查一下这个资料”
- “搜索一下 Takagi Q”
- “打开 https://example.com 看看”
- “总结当前网页”

权限说明：

- macOS 可能会要求允许 Takagi Q 或 Electron 控制 Safari。
- 如果需要读取网页正文，Safari 可能还需要打开“允许来自 Apple 事件的 JavaScript”。
- 这个功能只做打开 URL、搜索和读取当前网页内容，不会自动点击按钮、填写表单或读取密码。

## 上传 GitHub 前注意

建议保留：

- `electron-main.js`
- `electron-preload.js`
- `app.js`
- `index.html`
- `styles.css`
- `package.json`
- `package-lock.json`
- `petctl.command`
- `start-desktop.command`
- `Resources/`
- `launchers/`
- `legacy-launchers/`
- `docs/`
- `.gitignore`
- `README.md`

不要上传：

- `node_modules/`
- `.DS_Store`
- `*.pid`
- `*.log`
- 任何 API key 或本地私密配置
- 临时备份目录，例如只含 `.DS_Store` 的副本目录

当前 `.gitignore` 已包含：

```gitignore
node_modules/
.DS_Store
*.log
*.pid
```

## 后续计划

- 整理目录结构，让 `npm start` 在 clone 后可以直接运行。
- 增加正式打包配置，生成可分发的 macOS App。
- 给 Safari 查资料增加更稳定的搜索结果提取。
- 增加更多角色台词和互动状态。
- 补充截图、演示 GIF 和安装说明。
