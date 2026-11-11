---
title: 用 Markdown 写一篇文章
published: 2026-11-10
description: 标题、列表、链接和代码块的简单示例，写作时可以直接参考。
tags: [Markdown, 写作]
category: 使用指南
draft: false
---

Markdown 是一种用纯文本写作的方式。下面保留几种常用写法，方便开始写第一篇文章。

## 标题和段落

用 `##` 写二级标题，段落之间留一行空行。

可以写 **加粗文字**、*斜体文字*，也可以用行内代码标记，例如 `hello world`。

## 列表

- 写下今天学习的内容。
- 记录一个问题和解决方法。
- 把可以复用的步骤整理出来。

## 链接

例如：[Astro 官方文档](https://docs.astro.build/zh-cn/)。

## 代码块

在三个反引号后面注明语言，主题会进行代码高亮：

```javascript
const message = "你好，世界";
console.log(message);
```

## 表格

| 内容 | 保存位置 |
| --- | --- |
| 博客文章 | `src/content/posts/` |
| 默认主题的站点信息 | `src/config/siteConfig.ts` |
| 关于页面 | `src/content/spec/about.md` |
| 上传图片 | `public/images/` |

## 文章和草稿

文章开头的 `draft: false` 表示正式发布，改成 `draft: true` 表示草稿。可以在开发模式预览草稿，正式构建只发布非草稿文章。
