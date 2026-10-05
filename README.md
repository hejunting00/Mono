<div align="center">

# Mono 简记

**一款极简、所见即所得的 Markdown 桌面编辑器**

*A minimal Markdown editor with Typora-like live preview*

`Tauri 2` · `Vue 3` · `Milkdown` · `KaTeX` · `Mermaid`

</div>

---

## ✨ 特性

### 编辑体验
- **所见即所得** — 基于 Milkdown（ProseMirror），编辑即渲染，无需分栏预览
- **源码 / 预览模式切换** — 一键在所见即所得与原始 Markdown 之间切换
- **数学公式 & 图表** — KaTeX 行内/块级公式、Mermaid 流程图（导出 HTML 中完整渲染）
- **任务列表** — 可点击勾选的 GFM 任务复选框
- **表格 / 代码块** — GFM 表格、带语言标识与语法高亮的代码块

### 界面
- **Apple 风格界面** — 无边框窗口、macOS 红绿灯按钮、毛玻璃侧栏与工具栏、分段控件
- **ZenMode 专注模式** — 全部界面退场只剩文字，顶部悬停唤出标题栏，Esc 退出
- **打字机模式** — 当前行始终居中
- **亮 / 暗双主题** — GitHub Light / Night，跟随切换即时生效
- **中英双语界面** — 菜单、对话框、提示语全部本地化

### 工作流
- **多标签页** — 临时文件与打开的工作区文件分组管理
- **文件夹工作区** — 打开文件夹、文件树增删改、变更自动刷新、在资源管理器中显示
- **大纲导航** — 文档标题实时提取，点击跳转
- **查找替换** — 全部匹配高亮、逐个跳转、批量替换
- **自动保存** — 编辑后防抖写回；退出时未保存内容弹出确认
- **导出** — 一键导出独立 HTML（内联样式 + 公式 + 图表）/ 通过系统打印导出 PDF
- **图片** — 粘贴图片自动存入 `assets/` 并插入相对路径；图片按钮从文件选择器导入
- **右键菜单** — 剪贴板、格式切换、段落转换、链接操作，按上下文动态生成
- **最近文件** — 记录最近打开的文件与文件夹

## 🖥 截图

*（启动应用后自行体验：亮/暗主题、ZenMode、源码模式、文件树与大纲）*

## 🚀 快速开始

### 前置要求

| 依赖 | 说明 |
| --- | --- |
| [Node.js](https://nodejs.org) 18+ | 前端构建 |
| [Rust](https://rustup.rs) stable（MSVC 工具链） | Tauri 后端 |
| [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) | Windows 11 一般已内置 |

> Linux / macOS 用户需安装对应平台的 Tauri 系统依赖，参见 [Tauri 文档](https://tauri.app/start/prerequisites/)。

### 开发

```bash
git clone https://github.com/hejunting00/Mono.git
cd Mono
npm install
npm run tauri dev
```

> 仅调试前端界面时可用 `npm run dev`，会以内置 mock 后端在浏览器中运行（无需 Rust）。

### 构建

```bash
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/`。

## ⌨️ 常用快捷键

| 快捷键 | 功能 | 快捷键 | 功能 |
| --- | --- | --- | --- |
| `Ctrl+N` | 新建文件 | `Ctrl+B` / `Ctrl+I` | 加粗 / 斜体 |
| `Ctrl+O` | 打开文件 | `Ctrl+U` | 下划线 |
| `Ctrl+Shift+O` | 打开文件夹 | `Ctrl+K` | 插入链接 |
| `Ctrl+S` | 保存 | `Ctrl+1~6` | 一级~六级标题 |
| `Ctrl+Shift+S` | 另存为 | `Ctrl+0` | 正文 |
| `Ctrl+P` | 导出 PDF | `Ctrl+F` / `Ctrl+H` | 查找 / 替换 |
| `Ctrl+W` | 关闭标签页 | `Ctrl+Shift+L` | 切换侧栏 |
| `Ctrl+/` | 源码模式 | `Ctrl+Shift+-` | 分割线 |

*完整清单见应用内菜单。*

## 📦 项目结构

```
mdread/
├── src/                  # Vue 3 前端
│   ├── components/       # 标题栏、菜单栏、标签页、侧栏、编辑器组件
│   ├── milkdown/         # Milkdown 编辑器组装与扩展
│   ├── composables/…     # 状态与工具（lib/ 内含 Tauri 桥接与浏览器 mock）
│   ├── export/           # HTML / PDF 导出
│   └── themes/           # GitHub Light / Night 主题
├── src-tauri/            # Tauri 2 后端（Rust）
│   └── src/              # 窗口管理、命令、插件
└── …
```

## 🛠 技术栈

[Tauri 2](https://tauri.app) · [Vue 3](https://vuejs.org) · [TypeScript](https://typescriptlang.org) · [Vite](https://vite.dev) · [Milkdown](https://milkdown.dev)（ProseMirror）· [KaTeX](https://katex.org) · [Mermaid](https://mermaid.js.org) · [markdown-it](https://markdown-it.github.io)

## 📄 License

[MIT](./LICENSE) © 2026 hejunting00
