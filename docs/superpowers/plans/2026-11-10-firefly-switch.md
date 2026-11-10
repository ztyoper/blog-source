# Firefly Theme Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 Firefly 作为默认静态博客，保留能共享文章的一键 Fuwari 预览。

**Architecture:** Firefly 位于根目录，Fuwari 位于 `themes/fuwari/`。同步工具只管理自身记录的内容副本，根目录的 Markdown 和图片为唯一内容来源，两个启动器使用独立端口。

**Tech Stack:** 上游 Firefly / Fuwari，各自的锁文件，项目本地 Node.js 24，pnpm 11.22.0 / 9.14.4。

**Spec:** `docs/superpowers/specs/2026-11-10-firefly-switch-design.md`

## Global Constraints

- 所有项目、内容和便携运行时保存在用户指定目录，不改系统 Node.js。
- 移动前验证绝对路径位于项目内；保留 Fuwari、用户内容和上游许可证。
- 不公开发布、不配置付费模型；在线后台尚未连接。
- 遵循 Firefly 的 AGENTS.md，运行 check、type-check、build 和浏览器检查。

## Review Focus

- 新增和修改的 Markdown 能在两个主题使用。
- 删除正文、关于页和图片只影响同步器管理的副本，不能误删额外文件。
- 中文 Windows 路径和两个 pnpm 版本可以启动。
- 正式搜索、导航和窄屏页面正确。
- 文档明确一键切换范围和唯一内容编辑位置。

## Tasks

- [x] 验证并修复 Fuwari 已复现的两处类型错误，保留其原始版本记录。
- [x] 下载并验证本地 Node.js；将 Fuwari 移到 themes/fuwari，安装 Firefly 到根目录。
- [x] 配置中文 Firefly，保留主题原有外观，关闭未配置的第三方服务与演示性个人页面。
- [x] 先测试后实现共享内容同步和本地启动器，提供一键主题预览入口。
- [x] 运行两个项目的检查和静态构建，验证页面、搜索及内容编辑，更新使用指南。
- [x] 完成一次独立代码审查并处理重要问题。

用户后续要求站点和作者统一使用 `ztyOper`，已应用到两套主题、头像和示例正文。独立审查发现的悬空链接同步边界已修复，6 项回归测试通过。最终验证时还修复 Fuwari 的样式入口：限制图片 glob 的文件类型，并将共享类与 Markdown 的 @apply 使用者合并为同一 PostCSS 输入，避免依赖模块处理顺序。
