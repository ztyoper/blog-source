# Fuwari Local Blog Implementation Plan

> 此初始方案已由 `2026-11-10-firefly-switch.md` 接续：Firefly 位于根目录，Fuwari 作为 `themes/fuwari/` 备用项目。当前使用方式与验证记录见根目录《本地使用指南》和 `docs/local-setup-log.md`。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `D:\Desktop\博客` 搭建可预览、可写作的中文 Fuwari 静态博客。

**Architecture:** 使用上游 Fuwari 模板及锁文件，保留静态 Astro 输出。内容位于 `src/content/posts/`，站点配置位于 `src/config.ts`，另提供中文操作说明和后续在线编辑字段配置。

**Tech Stack:** Astro 5.13.10（以模板锁文件为准）、Fuwari、Node.js 22.13.1、pnpm 9.14.4。

**Spec:** `docs/superpowers/specs/2026-11-10-fuwari-local-design.md`

## Global Constraints

- 使用用户指定目录；保留既有文件和上游许可证。
- 使用现有兼容运行时，不修改系统 Node.js。
- 本次本地运行，不发布、不连接付费模型。
- 新增配置、说明和示例内容，使用真实构建和浏览器验证，不为模板编写重复单元测试。

## Review Focus

- Windows 中文路径的安装与启动。
- 中文正文、标题和导航的正确渲染。
- 桌面和窄屏布局保持可阅读。
- 搜索索引在生产预览中正常工作。
- 本地编辑和后续在线后台的能力边界说明准确。

## Task 1: 运行本地博客

**Files:** 模板文件；`src/config.ts`；`astro.config.mjs`；`src/content/posts/`；`src/content/spec/about.md`（以上游路径为准）；`.pages.yml`；`本地使用指南.md`；`dev.cmd`。

**Interfaces:** Markdown frontmatter 保持 Fuwari 原有字段：title、published、updated、description、image、tags、category、draft、lang。

- [ ] 下载上游模板至临时目录，检查目标冲突后复制到指定工作目录，记录来源提交。
- [ ] 使用 pnpm 9.14.4 及 frozen lockfile 安装依赖。
- [ ] 配置中文站点、头像、示例文章和关于页，移除展示给访客的虚假个人链接；保留上游示例为草稿参考。
- [ ] 添加启动入口、中文写作说明和后续 Pages CMS 配置，说明尚未连接仓库。
- [ ] 运行 `pnpm check` 与 `pnpm build`；检查生产首页、文章、归档、关于页、移动布局和搜索。
- [ ] 完成一次最终审查，记录验证结果并向用户交付本地地址和下一步写作操作。
