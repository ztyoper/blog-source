# Yuque Library Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将桌面语雀转换目录中报告列出的 44 个知识库、1,067 篇源文档完整导入现有 Firefly 博客。

**Architecture:** Markdown 进入 src/content/posts/yuque，以知识库名分类，文档 ID 生成稳定地址；每库目录与总导航保留可访问入口。图片进入 public/images/yuque，重写实际 Markdown 链接，代码和公式原样保留。来源报告、原始文件和下载缓存留在导出目录，不导入博客。

**Tech Stack:** Node.js 24、Astro 7、mdast Markdown parser、Sharp、原生 node:test。

## Constraints and review focus

- 不覆盖已有三篇博客，不修改语雀导出资料，不提交或推送。
- 日期使用原元数据；目录页面明确为导入导航。保留已有来源署名与正文。
- 输入只接受报告中的文档与每库目录，排除旧转换遗留的额外 .md、隐藏原始数据和 Cookie。
- 链接必须处理嵌套中文、编码路径、图片、参考式链接与 HTML 图片，不改代码块中的示例路径。
- 原资料缺失的图片/链接与本次转换问题分别记录；已有图片必须能在本地访问。
- 用户清理磁盘后要求继续复制，采用原图导入；已确认空间增加到约 6.8 GiB。原图约 1.7 GiB，不改用压缩。

## Task 1: Safe import and verification

- [x] 先添加链接转换、代码与公式保留、同名文档、路径边界、已有内容冲突测试，确认失败。
- [x] 实现 scripts/import-yuque.mjs，以来源清单映射源文档到稳定文章和资源地址，保留校验清单。
- [x] 导入文章、目录与图片；输出完整数量、路径和异常报告。
- [x] 执行单元测试、Astro check、type-check、build；核对 1,067 个 ID、代码/公式、图片与所有改写目标。
- [x] 浏览器检查总导航、跨文章链接、图片、代码与公式，完成一次代码审查并更新使用指南。

## Decisions and verification

- 以逐库报告为准，跳过旧转换遗留 .md。导入 1,067 源文档 + 44 目录 + 1 总导航；图片 8,853 个唯一内容，原始字节保留，约 1,658 MiB。
- 原缺失本地图片会使 Astro 抛出 ImageNotFound，故显示明确缺图占位 SVG，原路径保留在 URL 片段与报告；不伪造恢复。70 处缺图与 82 个不同的本地坏链接均来自原资料。
- 大量图片暴露旧 Fuwari 同步器一次读入整批 Buffer 的内存问题。已改为 64 KiB 分块哈希、元数据哈希缓存、单文件独占临时副本、实际副本哈希与原子替换；监听文件变化代替持续全量轮询。注册监听先于首次同步，避免启动期间编辑丢失。
- 完整集合同步实测 RSS 约 160 MiB，保留 ArrayBuffer 约 0 MiB；暖扫描约 10 秒，因此不再定时无变化全扫。
- 独立审查发现并已修复误删文章重导缺失、链接标题含 ]( 时错误替换、复制过程中源变化造成假冲突、监听注册晚于初次同步等问题。各行为均有回归或实际状态验证；20 项自动化测试通过。
- 最新 check：260 文件，0 errors/warnings/hints；type-check 及完整 build 退出 0。Pagefind 索引 1,115 页面。
- 浏览器验证了总导航到数据结构目录的 74 个文章链接、文章中 4 张本地图像实际加载、5 个代码块和 141 个公式节点、正式全文搜索命中及结果跳转。默认开发服务已恢复。
- 完整性校验：1,067 篇的 10,537 代码围栏（含 8 个 Mermaid）和 371 个 Markdown 数学节点完全一致；11,139 个博客内部路径存在。原图 8,853 个 SHA256 全部一致。
- 上游代码复制属性中的示例脚本触发了压缩器的跳过提示；确认位于 data-code 属性，不是新增的页面执行脚本。不改原代码示例。
- 仅本地导入和预览，没有提交或推送。原图超过 GitHub Pages 1 GB 正式站点限制，已在发布说明中标明先迁移图片到图床。
