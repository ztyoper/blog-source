# Firefly 默认博客与 Fuwari 备用预览

用户最新要求：改为 Firefly，能一键切换时保留 Fuwari。采用 CuteLeaf/Firefly 官方模板作为根目录默认项目；将已配置的 Fuwari 移入 `themes/fuwari/`。所有操作继续位于 `D:\Desktop\博客`。

## 同一份内容

根目录 Firefly 的 `src/content/posts/`、`src/content/spec/about.md` 和 `public/images/` 是唯一编辑入口。Fuwari 预览启动时同步上述内容，预览期间持续同步新增、修改和删除。Fuwari 对应位置为工具生成的副本，不直接编辑；上游原始内容保存在 docs 参考目录。

## 一键切换的含义

提供 Firefly、Fuwari 两个 Windows 启动入口，使用不同端口，方便同时比较。默认开发和生产构建使用 Firefly。此功能是本地启动与构建选择，不是在同一个公开网页里无构建动态换模板。

## 环境与边界

Firefly 当前要求 Node.js >=22.23.0；在项目 `.tools/` 内下载官方 Node.js 24 LTS 及本地包管理器，不改系统 PATH。Fuwari 保留原锁文件及 pnpm 9.14.4，Firefly 使用自己的锁文件及 pnpm 11.22.0。修复已复现的 Fuwari 类型检查错误。保留两套上游许可证，清理展示性的个人链接与服务配置，使用中文站点信息。

仅做本地可运行博客；GitHub、Pages CMS 与 AI 尚未连接。验证两套主题的检查、构建、文章一致性和浏览器页面。对新增同步工具，测试文件新增、修改、删除、路径约束及不误删用户额外文件。
