# PicGo Writing and GitHub Pages Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 准备 PicGo 图文写作示例与原 GitHub Pages 仓库替换步骤，供用户按步骤完成首篇图文与首次上传。

**Architecture:** 使用现有 Firefly；正式站点设为 https://ztyoper.github.io，main 触发官方 Pages artifact 部署。图床独立使用 ztyoper/blog-image。保留旧仓库 Git 历史，通过 ours 合并保持本地新博客文件树，随后普通推送。

**Tech Stack:** Astro 7.3.2，Node.js 24，pnpm 11.22.0，GitHub Pages，PicGo GitHub 图床。

## Global Constraints

- 不删除远程仓库、不重写历史、不强制推送。
- 用户要求指引操作，本次准备本地配置与命令，不直接执行远程发布。
- Token 只由用户在 PicGo 本机输入，不读取或提交凭据。
- 保留 Fuwari 与已有内容；新图文为草稿，先用本地头像验证图片渲染。

## Review Focus

- 新建图床目前空仓库，需要 README 初始化 main；此前图片 URL 不再假定存在。
- 发布域名与用户主页仓库对应，base 为 /。
- 本地 main 与远程旧博客无共同祖先，普通 pull 会出现不相关历史，不能直接强推。
- .tools、node_modules、dist 和私密环境文件不上传。
- 草稿本地可见、生产隐藏；最终真实图床图片链接仍需用户上传后填写并验证。

## Task 1: Prepare a reviewable writing and publishing setup

**Files:** src/content/posts/first-photo-post.md，src/config/siteConfig.ts，.github/workflows/deploy.yml，.github/workflows/build.yml，docs/PicGo与首次发布.md，本地使用指南.md。

- [x] 创建带 /avatar.svg 示例的图文草稿与 PicGo 指引。
- [x] 将正式网址和 main / Node 24 / frozen lockfile 部署配置对齐；PR 检查避免重复 push 构建。
- [x] 添加并读取 origin，核对远程 main，不提交或推送。
- [x] 运行 check、type-check、build，检查草稿排除与正式 URL；以浏览器确认草稿图片。
- [x] 交付 PicGo 初始化、图片上传、换图发布与保留历史替换命令。

验证：check 为 260 文件、0 errors / warnings / hints；type-check 与完整 build 均退出 0，Pagefind 索引 3 页面。两份工作流 YAML 可解析，git diff --check 通过。dist 不含新草稿页面、首页与 sitemap 也不包含草稿，并已使用正式域名。浏览器本地文章显示标题和头像示例图。本次未运行远程 Actions、未修改 Pages 设置，真实 PicGo 上传与首次发布仍由用户按指引完成。
