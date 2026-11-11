# 本地搭建记录

- 目录：D:\Desktop\博客（开始前为空，没有发现适用的 AGENTS.md）。
- 原有运行时：Node.js 22.13.1、npm 10.9.2、Git 2.43.0。
- 用户在搭建过程中指定 Fuwari，已替代此前候选 AstroPaper。
- Fuwari 使用 Astro 5.13.10，兼容现有 Node；没有安装或切换系统 Node.js。
- 已用 pnpm 9.14.4 和原始锁文件安装依赖。
- 实现选择：开发模式会显示草稿，因此将上游示例连同图片移入 docs/fuwari-examples，保留参考并避免在首页发布原作者示例。
- 实现选择：站名为“ztyOper的博客”，作者与头像文字为 ztyOper，可从配置修改；不添加虚假社交链接，不替用户预选文章的公开许可协议。
- 在线后台仅准备字段配置，尚未连接 GitHub 或执行真实在线编辑。

## 当前结构

- 用户随后选择 Firefly 为默认主题，根目录已改为 CuteLeaf/Firefly，原 Fuwari 保留于 `themes/fuwari/`。
- 两套上游来源和提交已记录在 `docs/firefly-source.json` 与 `docs/template-source.json`，原示例与许可证保留。
- 项目本地使用已校验 SHA256 的官方 Node.js 24.22.2；Firefly 使用 pnpm 11.22.0，Fuwari 使用 pnpm 9.14.4。系统 Node.js 仍为 22.13.1，全局 PATH 未修改。
- `firefly.cmd` / `dev.cmd` 启动 127.0.0.1:4321，`fuwari.cmd` 启动 127.0.0.1:4322；终端保持运行，Ctrl+C 停止。正式搜索由 `preview.cmd` 构建后在 4323 预览。
- 统一编辑根目录的文章、关于正文、public/images 和 avatar.svg。同步器在 Fuwari 启动时执行，开发时每秒检查；只删除清单管理的副本，发现副本本地修改则保留并报冲突。
- 用户要求的站名与作者 ztyOper 已应用到配置、头像、公告、文章与说明。

## 验证与修复

- Firefly check：260 文件，0 errors / warnings / hints；type-check 通过；最新静态构建通过，Pagefind 索引 3 页面。
- Fuwari check：55 文件，0 errors / warnings / hints；修复 Svelte 组件 props 推断和文章归档类型问题。修复样式入口后最终静态构建退出码 0，Pagefind 索引 3 页面。
- Fuwari 最终构建发现上游 Markdown 样式依赖处理顺序：图片 glob 意外引入非图片模块，样式缺少明确入口。已限制 glob 为图片，并让 main 与 Markdown CSS 在同一 PostCSS 输入中处理；独立编译已从缺失 link 类失败变为通过。
- 内容同步测试 6/6 通过，覆盖新增、修改、删除、额外文件保留、本地冲突、路径限制和悬空 Windows junction。独立代码审查提出的悬空链接检查问题已用 lstat 预检修复。
- 浏览器已检查两套主题主页与文章、手机窄屏排版、Firefly 正式搜索及结果跳转；修改根目录文章后，两套开发页面均返回 200 并显示新内容。
- Firefly 默认首页已留在浏览器，显示 ztyOper 站名、作者及页脚；临时手机视口覆盖已重置。
- 上游 Browserslist 数据、构建分块与关闭的演示集合仍有非阻断提示；没有混用两套锁文件或为消除提示更新依赖。

Pages CMS 在线 CRUD 和 AI 助手均尚未连接；`.pages.yml` 为后续准备，不表示在线编辑已完成。

## PicGo 与首次上传准备

- 用户重新创建 blog-image 并决定继续 PicGo；新图床当前为空，原有图片 URL 示例已撤换，文档说明先创建 README 初始化 main。
- 本地 Git 已由用户初始化并有首次提交；本次只添加 origin 到 ztyoper/ztyoper.github.io 并 fetch 旧 main（f878b91），未提交、合并或推送。
- site_url 改为 https://ztyoper.github.io；部署工作流使用 main、Node 24、pnpm 11.22.0、冻结锁文件，并在部署前检查 Astro 与 TypeScript；PR 检查使用 main 和 Node 24。
- 新增图文草稿 first-photo-post.md，暂用 /avatar.svg 作示例。真实上传图床后由用户换图，并在准备发布时将 draft 改为 false。
- 最新 check、type-check、build 均通过；生产域名、草稿排除与工作流 YAML 已验证。浏览器已打开图文草稿本地预览。
- 操作说明见 docs/PicGo与首次发布.md，包含保留历史的 ours 合并和普通 push。远程 Pages 尚未启用或验证，发布和 PicGo 真实上传尚未执行。

## 语雀知识库导入

- 通过用户提供的对话 ID 定位到桌面语雀知识库转换目录，按报告导入 44 库、1,067 篇文档，加 44 库目录与总导航，共新增 1,112 Markdown。
- 原日期保留，知识库名作为分类。文章位于 src/content/posts/yuque，原图内容去重后 8,853 个、约 1,658 MiB，位于 public/images/yuque。原文件、代码、公式与原有三篇文章保留。
- Markdown AST 改写 11,095 个目标，包括缺图占位。坏链接 152 个均在源资料中缺失；远程损坏图片仍保留源地址。详情见 docs/语雀导入说明.md 与导入报告。
- 修复大量图片触发的 Fuwari 同步内存问题及启动监听时序。单元测试 20/20；完整数据集同步内存约 160 MiB，不再保存整批 Buffer 或持续无变化轮询。
- 最终 check、type-check、完整 build 均通过；Pagefind 索引 1,115 页面。完整代码/公式一致性、原图 SHA256 与改写路径存在性已验证。
- 未执行 git add/commit/push 或公开发布。GitHub Pages 1 GB 大小限制已写入首次发布指引，需先迁移大批量图片到图床。
