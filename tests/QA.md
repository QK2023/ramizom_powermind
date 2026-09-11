# Ramizom PowerMind 回归记录

## 2026-09-11 — 上线前检查

### 已修复

- **PWA 启动页图标黑边**：`icon.svg` 是向内缩进 8px 的圆角矩形，实测 28.2% 的像素 `alpha = 0`，而清单把同一个文件声明为 `purpose: "any maskable"`。系统把 maskable 图标遮罩成圆形/圆角时，透明角会合成到不透明图层上，即表现为黑边。现拆成两族图标：`icon.svg` / `icon-192.png` / `icon-512.png` 保留圆角品牌图并只声明 `any`；`icon-maskable-192.png` / `icon-maskable-512.png` 为全出血、完全不透明、图形收进 80% 安全区并声明 `maskable`；另补 `apple-touch-icon.png`（180px，同样不透明）。实测 maskable 图标与 apple-touch-icon 的透明像素数为 0。
- **`--shadow-4` / `--shadow-16` 从未定义**：`var()` 解析失败会使整条 `box-shadow` 失效，受影响的是首次启动的文件夹门禁卡片与尺规旋转手柄。已按 `--shadow-2` / `--shadow-8` 的数值梯度在亮色与暗色主题下补齐。
- **450ms 保存防抖可能吞掉最后一次编辑**：`markChanged()` 只排定时器，窗口内切后台或关闭页面就会丢写。现新增 `flushPendingSave()`，在 `visibilitychange`（hidden）与 `pagehide` 时立即排空待写内容；因 `createWritable()` 先写临时文件、`close()` 时才原子替换目标文件，被打断的排空不会损坏既有笔记。
- **误产生的文件**：删除仓库根目录下的 `System.Drawing.Drawing2D.GraphicsPath`（本次生成图标时脚本变量名冲突的产物，6.8 KB）。
- **`.gitignore` 加固**：新增 `out/`、`.nyc_output/`、`.parcel-cache/`、`.eslintcache`、`*.tsbuildinfo`、`*.orig`、`*.rej`、`.vs/`，并把"临时/缓存目录"拆成独立分区；`git add -A` 只会带上 5 个新图标，不会混入临时目录。

### 新增

- **不支持平台的多语言说明页**：缺少 File System Access API、或以 `file://` 打开、或来源不安全时，应用在渲染工作区之前停止并展示说明页。页面区分"浏览器不支持"与"来源不安全"两种原因，列出可用浏览器（Edge 105+ / Chrome 105+、Chrome for Android 132+）并明确不支持 Firefox、Safari 与 iOS/iPadOS，且自带语言选择器（8 种语言，切换后持久化）。
- `regression.cjs` 新增断言：图标契约（文件存在、`purpose` 合法、圆角图不得同时声明 maskable、必须存在 512px maskable、必须声明 apple-touch-icon）、说明页三个元素、7 个说明页文案在 8 种语言中各出现一次、保存排空的三处接线。
- `README.md` 记录图标契约（maskable 必须不透明）与浏览器支持底线。

### 本次已验证

- 本地静态服务器 + Chromium 实测（非只读代码）：首屏 0 console error、0 pageerror、0 requestfailed；启动过渡页正常出现并自动消失。
- 图标根因与修复：旧 `icon.svg` 透明像素占比 28.2%；圆形遮罩对比中旧图标四角发黑、新 maskable 图标无黑边；5 个 PNG 与清单均返回 200 且 MIME 正确。
- 保存链路（用内存桩模拟 File System Access API 与 IndexedDB）：连接文件夹 → 写出 `powermind.workspace.json` 与笔记文件 → 保存状态显示"已保存"。
- 排空行为 A/B 对照：不排空时编辑后 150ms 仍未落盘（确认 450ms 窗口存在）、600ms 后落盘（确认原有防抖未被破坏）；`pagehide` 后 200ms、`visibilitychange`（hidden）后 250ms 数据均已落盘。
- 不支持说明页：缺 API 时应用隐藏（`app-shell` 为 `display:none`）、说明页显示、8 个语言选项；切中文/日文后标题、正文与清单全部翻译且 `<html lang>` 同步；语言选择持久化；强制 `isSecureContext = false` 时自动切换为 HTTPS/localhost 文案；以上过程 0 console error。
- 支持的浏览器行为不变：文件夹门禁、画布、编辑器输入、撤销/重做、新建思维导图节点均实测正常，`app-shell` 仍为 `display:block`。
- `--shadow-4` / `--shadow-16` 在亮色与暗色主题下均正确解析，门禁卡片与尺规手柄阴影恢复。
- 仓库隐私扫描：源码中无邮箱、密钥、令牌、个人绝对路径与外链；无 XSS 缺口（所有 `innerHTML` 注入点均有 `escapeHtml` 或数值校验兜底）。

### 仍需专项验证

- **本轮未实际执行 `node tests/regression.cjs`**：当前开发机没有 Node.js。仅通过 VS Code 语言服务（0 错误）与静态字符串核对确认新增断言成立。上线前必须在有 Node 的机器上完整跑一遍。
- Windows Ink：`pointerrawupdate`、合并采样、压感、掌触抑制、笔尾擦除、可配置侧键与套索删除，仍需在 Surface Pen/Wacom 等目标硬件分别实测；不同厂商侧键上报位可能不同。
- 打印/PDF：尚未逐页检查输出；长内容与画布重叠仍有分页/裁切风险。
- 触屏双指缩放、压感与缩放后边缘拖拽需实机测试；改变浏览器视口不等同于触屏测试。
- Android 实机：安装后的图标与启动页观感、`showDirectoryPicker` 的 SAF 写盘流程，均需在目标设备确认。注意图标被缓存在 WebAPK 中，需卸载后重装（或等待 WebAPK 后台更新）才会显示新图标。
- 弹窗取消与外侧点击、工具栏鼠标滚轮、阅读模式禁止待办与对象菜单修改。

### 尚不能宣布正式发布的风险

- 多标签页同时编辑没有冲突合并，应避免同时编辑同一个存储源。
- 主编辑器与额外编辑器能力尚不完全一致，后者尚缺少完整的图片/公式/斜杠菜单工作流。
- 不支持 Firefox、Safari、iOS/iPadOS 上的全部浏览器，也不支持以 `file://` 直接打开；这些情况现由说明页明确拦下而非静默失败，但仍属于产品可用范围之外。
- 没有 Service Worker，应用外壳不缓存，断网时无法打开已安装的 PWA（当前为有意设计）。
- 性能未做规模验证：`storage.save()` 每次写出全部笔记；`checkpoint()` 深拷贝整条笔记（含全部墨迹点）。
- 无障碍：`style.css` 对 `button`、`input`、`[contenteditable]` 的 `:focus-visible` 关闭了轮廓（WCAG 2.4.7），仅少数控件单独补了焦点样式。
- `importBackup()` 已实现且随包发布，但未接入任何界面入口；JSON 备份当前为单向导出，本次已确认不提供导入功能。

运行数据回归：`node tests/regression.cjs`。

## 2026-09-09 — 回归记录

### 已验证

- 画布命令栏在 813px 可用宽度下保持单行、不压缩文字，内容宽度 966px 时通过横向滚动访问；新增编辑器与主编辑器实测无重叠。
- 新增编辑器实测具备 17 个格式/插入按钮；粗体产生 `<b>` 富文本，H3 正确创建，公式写入新增编辑器而未误写主编辑器。
- `regression.cjs` 全部断言通过：语法、导入关系/ID/内容保留、异常块类型与颜色、循环父子关系、写入失败、存储回退、新旧副本选择、备份恢复。
- 独立测试源 `127.0.0.1:4317` 的 Chrome 实际操作：添加第二个块编辑器；输入 `AlphaBeta`，在中间回车得到 `Alpha` / `Beta`。
- 刷新后第二编辑器和文字保留。
- 修改第二编辑器正文后，撤销恢复原文，重做恢复修改。
- 390×844 竖屏：导航、笔记列表、编辑页逐层切换；只有当前层未设置 `inert`，每层宽度与视口一致。
- 测试页面未捕获到控制台 error。测试没有修改原应用端口的用户笔记。

### 已修改但仍需专项验证

- Windows Ink：已接入 `pointerrawupdate`、合并采样、压感、掌触抑制、笔尾擦除、可配置侧键及套索删除；几何与脚本回归已通过。不同笔厂商上报的侧键位可能不同，必须在 Surface Pen/Wacom 等目标硬件上分别实测。
- 打印移除拖拽手柄后的正文网格、额外编辑器溢出、海量墨迹点范围计算。尚未输出 PDF 逐页检查；长内容与画布重叠仍有分页/裁切风险。
- 弹窗取消与外侧点击、工具栏鼠标滚轮、阅读模式禁止待办与对象菜单修改。
- 真正的触屏双指、触控笔压感与缩放后边缘拖拽，需要实机测试；改变浏览器视口不等同于触屏测试。

### 尚不能宣布正式发布的风险

- 多标签页同时编辑没有冲突合并，应避免同时编辑同一个存储源。
- 主编辑器与额外编辑器能力尚不完全一致，后者尚缺少完整的图片/公式/斜杠菜单工作流。
- 未完成 Safari、Firefox、容量不足实机场景及大规模文档性能验证。
- 浏览器存储可能被用户或系统清理，JSON 外部备份仍然必要。

运行数据回归：`node tests/regression.cjs`。
