# Ramizom PowerMind 回归记录

## 2026-09-12 — 移动端与主题启动修正

### 已修复

- **深色模式启动白闪（含桌面窗口标题栏与移动状态栏）**：`init()` 在 `applyTheme()` 之前先 `await` 了 Service Worker 查询、`caches.keys()` 和 `storage.restore()`，因此首帧一定是浅色（实测同一时刻 `body` 无主题类、`meta[theme-color]` 为浅色 `#f5eee9`）。仅把主题脚本放在 `<body>` 起始处仍不够——`<html>` 的 `color-scheme`／背景色与浏览器窗口底色发生在更早的时刻。现改为**在 `<head>` 解析期间**完成主题解析：写入 `<html>` 的 `color-scheme`／背景色／`--system-chrome-color`／`--body-font-size` 并折叠 `theme-color` 元数据；`<body>` 起始处的一行脚本再补 `theme-dark`/`theme-light` 与 `data-accent`。同时把静态 `theme-color` 改为两条带 `media="(prefers-color-scheme: …)"` 的声明，使浏览器在**任何脚本执行之前**就拿到符合系统深浅的窗口/状态栏颜色。
- **移动端每次都要求重新选择文件夹**：笔记写在用户自选文件夹里，但"记住的文件夹句柄"存于 IndexedDB，原实现有两个真实缺陷：① `rememberHandle()` 在 `request.onsuccess` 就返回，未等待事务 `oncomplete`，页面被挂起或杀掉时这次写入可能丢失；② `rememberHandle()` 一旦抛错会中断整个 `connectDataFolder()`，导致后续保存与界面更新被跳过。现改为等待事务提交（新增 `finishStore()`）、写入失败只告警不中断，并在连接文件夹与启动时调用 `navigator.storage.persist()`，避免浏览器在存储压力下清理 IndexedDB 而丢失句柄。
- **`--system-chrome-color` 双写不一致**：启动脚本写在 `<html>`，而 `updateSystemChrome()` 写在 `<body>`，切换主题色后根元素上会残留旧值。现统一写在 `<html>`。
- **安装后需要卸载重装才能更新**：此前应用不注册 Service Worker，更新只能依赖 HTTP 缓存（本项目的测试过程中就多次被 304/启发式缓存挡住，必须绕过缓存才能看到新文件）。现新增 `sw.js`：缓存应用外壳但**一律 network-first**，在线时每次启动都向服务器重新校验，缓存只在断网时兜底；`skipWaiting()` + `clients.claim()` 让新 worker 立即接管，因此重新打开应用即可拿到新版本，无需卸载、无需清缓存、也不会被钉在旧版本上。`manifest.webmanifest` 与所有图标**刻意不经过 worker**，因为 Chrome 会在后台重新读取它们来刷新已安装应用，缓存住会把名称、配色与启动图钉死。
- **Chrome 启动过渡页的 logo 是直角**：maskable 图标此前是全出血方形，Chrome 启动页不做遮罩，因此显示直角。现在 maskable 图标保留品牌圆角（与 `icon.svg`、应用内 logo 一致的 28/128），并把圆角之外的部分填充为清单的 `background_color`（`#f5eee9`）——既不会出现透明角合成黑边，启动页又是熟悉的圆角。**该填充色必须与 `manifest.webmanifest` 的 `background_color` 保持同步。**
- **移动端无法直接进入主页**：竖屏启动时强制 `state.mobileStage='workspace'`，用户先看到导航抽屉。现在改为有笔记时直接进入编辑器、无笔记时进入笔记列表，旋转屏幕时同样处理。
- **移动端设置窗口内所有下拉框被压成 10px**：`@media (max-width:430px)` 里的 `.fluent-options` 覆盖写在前、基础规则写在后，同权重下后者胜出，于是 `position/top/left/right/max-height` 被基础规则接管，但 `bottom:16px` 残留。面板因此被拉伸约束成"内容高度为 0"（仅剩 4px padding + 1px 边框 = 10px），四个下拉框全部只显示一条细缝。现已删除该失效覆盖，并让基础规则自带 `bottom:auto`，避免任何内联 `inset` 再次泄漏。
- **下拉项文字在窄屏横向溢出**：`.fluent-options button span` 只有 `flex:1`，缺少 `min-width:0`，窄屏时会撑出横向滚动条。现与 `.fluent-select span` 一致，改为 `min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`。

### 本次已验证

- **首帧主题**（系统浅色 + 已存深色/蓝色主题）：`<head>` 脚本执行后文档中只剩 1 条 `meta[theme-color]`（`media` 已移除、内容 `#202a33`）；`<body>` 起始处即为 `theme-dark`、`data-accent="blue"`，`<html>` 的 `color-scheme`／背景色／`--system-chrome-color` 同步。
- **实际合成帧**（CDP `Page.startScreencast` 自 reload 起连续采集）：61 帧**全部为深色**（平均亮度 45–46，最亮 46），不存在白色帧。
- **记住的文件夹**：向真实 IndexedDB 写入一个可结构化克隆的句柄替身并重新加载后，门禁按钮正确显示为"打开已保存的文件夹"而非"选择文件夹"，恢复路径生效。`navigator.storage.persist` 存在，当前 `persisted()` 为 `false`，配额约 3.0 GB。
- **主题色动态切换**：主题色改为青色后 `meta[theme-color]` 变为 `#202e2d`（深色）且仍只有 1 条；主题切为浅色后变为 `#e3f1ef`，即跟随**用户选择**而非系统深浅。
- 全程未捕获到 console error / pageerror / requestfailed（未连接文件夹时的 "Choose a system folder" 提示为预期行为）。
- **离线外壳与无感更新**（真实浏览器，HTTP 缓存保持开启，即普通用户状态）：`sw.js` 注册成功并接管（`scope` 为站点根、`controller` 存在），缓存中只有 `index.html`/`style.css`/`app.js`/`i18n.js`，**manifest 与图标均未被缓存**。往 `style.css` 末尾追加一条探针规则后**普通刷新**即可在页面中读到（`--pm-probe:1` 生效、样式表内可见），删除后再次刷新探针消失——无需清缓存或重装。停掉静态服务器后再次刷新，应用仍完整渲染（标题、外壳、样式、1 篇笔记、1 个编辑器），0 console error。
- **maskable 图标**：`icon-maskable-192.png` 与 `icon-maskable-512.png` 透明像素数为 **0**，四角实测为 `#f5eee9`（与清单 `background_color` 一致），中心为白色节点图形；`icon-512.png`（`any`）保留 11188 个透明圆角像素，`apple-touch-icon.png` 保持全出血。
- **移动端启动**（390×844 竖屏）：`data-mobile-stage="editor"`，工作区 `x=0`，导航与笔记层 `x=-410` 且均 `inert`，编辑器卡片宽 348px，正文字号 18px。
- **移动端三页流**：编辑器 → 返回笔记列表（`stage="notes"`，笔记层 `x=0`）→ 新建笔记（回到 `stage="editor"`，2 篇笔记）→ 输入文字成功。
- **设置下拉框**：390px 宽下 accent 面板 `clientWidth 192 / scrollWidth 192`、`clientHeight 246 / scrollHeight 246`，7 项全部可见、无横向溢出、标签不截断；320px 宽下无横向溢出，标签按省略号优雅收缩（修复前 `scrollWidth > clientWidth` 会出现横向滚动条与换行）。
- **桌面端未受影响**（1280×800）：无 `data-mobile-stage`，导航层可见、三层面板均非 `inert`，编辑器与笔记正常渲染，设置下拉框正常，0 console error。
- **运行期主题色**：在设置中切换主题色后 `meta[theme-color]` 与 `--system-chrome-color` 立即跟随（蓝 `#202a33` → 绿 `#222e25` → 黄 `#302d22`）。
- 全程未捕获到 console error / pageerror / requestfailed（未连接文件夹时出现的 "Choose a system folder" 提示为预期行为）。

### 仍需专项验证

- **移动端文件夹句柄能否真正自动恢复无法在本机验证**：桌面 Chromium 只需一次点击即可重新授权；Android Chrome 对 SAF 目录的重新授权可能仍会拉起系统文件夹选择器，而这正是"每次都要选文件夹"的观感来源。`persist()` 在本机返回 `false`（Chrome 按站点参与度决定），真机是否授予需实测。
- **安装态 PWA 的启动画面底色仍为静态**：清单里的 `background_color: #f5eee9`（浅米色）同时用于 Android 启动画面、PWA 窗口初始底色，**以及 maskable 图标的圆角填充**。因此改动这个值必须同时重新生成图标，否则启动页会露出一圈异色方角。它无法跟随用户主题，浅色与深色用户中必有一方看到不匹配的闪底，属平台限制。
- **已安装应用的后台刷新需真机确认**：Chrome 会在后台重新读取清单与图标来更新已安装应用（WebAPK），因此理论上无需卸载重装；但刷新时机由浏览器决定，实际延迟需在 Android 上验证，桌面快捷方式图标缓存同理。
- **主屏幕图标观感需真机确认**：maskable 图标的圆角现位于画布边缘；若 Android 遮罩按预期裁掉外围区域，主屏幕图标与改动前一致，否则会看到圆角外一圈浅色底板（视觉上仍成立，但属于变化）。
- **Service Worker 为新增组件**：需在真机上确认首次安装、后台更新与断网启动三条路径，并确认旧版遗留缓存被 `activate` 清理。
- **本轮未执行 `node tests/regression.cjs`**（开发机无 Node.js）。新增断言已通过静态字符串核对，上线前必须在有 Node 的机器上完整跑一遍。
- **真机确认**：上述数据来自桌面 Chromium 的窄视口，不等同于触屏设备。需在真实 Android Chrome 上确认状态栏颜色、启动进入的页面层级，以及 `(pointer: coarse)` 相关样式。
- **已安装 PWA 的启动状态栏无法跟随主题色**：安装态下 OS 启动画面与初始状态栏取自清单里静态的 `theme_color`/`background_color`（`#f5eee9`），用户选择的主题色只能从页面首帧起生效。如需彻底一致，只能让清单使用中性底色，属产品取舍。
- 另注：`updateSystemChrome()` 中浅色系的红色为 `#f5e8e5`，而静态 `meta` 与清单为 `#f5eee9`，二者略有差异（首帧前不可见）。本轮未改动，必要时可统一。

可选的后续改进（未实施）：把设置行在窄屏改为标签在上、控件在下的单列布局（原 `@media (max-width:430px)` 的意图），可让控件与下拉面板获得整行宽度。

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
