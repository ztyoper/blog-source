# PicGo 图文写作与首次发布

本文对应当前项目 `D:\Desktop\博客`。图片通过 PicGo 上传到 Cloudflare R2，博客源码与发布使用 `ztyoper/ztyoper.github.io`。

语雀导入的约 1.6 GiB 原图通过批量工具迁移至 R2；本地备份在 `.tools/backups/yuque-images/`，不随网站发布。迁移记录和恢复方法见 [语雀导入说明](语雀导入说明.md)。

## 1. 使用已配置的 R2 图床

PicGo 已配置成功，继续使用即可。`ztyoper/blog-image` 可以保留，无需为了 R2 初始化或上传这批图片到 GitHub。

## 2. 设置 PicGo

当前使用 Amazon S3 插件连接 Cloudflare R2，配置概览如下：

| 字段 | 内容 |
| --- | --- |
| 桶名 | blog |
| region | auto |
| 存储路径 | PicGo/{fullName} |
| 公开 URL 前缀 | https://pub-ccd5622eabb54b4a81678003778ddce1.r2.dev |
| Access Key / Secret | 仅在本机 PicGo 保存，不复制到博客 |

保存并设为默认图床，将复制格式选为 Markdown。上传一张自己的图片，然后把复制出的链接粘贴到浏览器，确认能直接打开图片。

S3 endpoint 用于上传，公开 URL 前缀用于浏览器看图。文章只粘贴 PicGo 返回的公开直链；不使用带密钥或签名的管理地址。

示意链接（your-photo.png 是占位文件名，必须用真实上传结果替换）：

```markdown
![图片说明](https://pub-ccd5622eabb54b4a81678003778ddce1.r2.dev/PicGo/your-photo.png)
```

官方参考：[PicGo 配置](https://picgo.github.io/PicGo-Doc/zh/guide/config.html)、[R2 公开访问](https://developers.cloudflare.com/r2/buckets/public-buckets/)。r2.dev 有开发访问限流，长期正式使用可后续绑定自己的图片域名。

## 3. 完成第一篇图文

已准备草稿 `src/content/posts/first-photo-post.md`。它先引用本地 avatar.svg 作为可显示的示例图，不代表已经上传图床。

1. 双击根目录 firefly.cmd，打开终端给出的预览地址。
2. 在本地访问 http://localhost:4321/posts/first-photo-post/。
3. 修改草稿的标题和正文。
4. 将 `![临时示例：ztyOper 博客头像](/avatar.svg)` 整行替换为 PicGo 返回的 Markdown。
5. 保存并查看预览；图床图片不必再复制进 public/images。
6. 确定要公开时将开头的 `draft: true` 改为 `draft: false`。开发模式能看到草稿，正式站点不会列出或生成草稿页面。

以后新增文章，可以复制这份 .md，修改文件名、标题、日期、分类、标签和正文。图片仍由 PicGo 上传。

## 4. 原仓库如何替换

旧仓库 main 当前保存的是已生成的旧网页，包含 2025、archives、css、fancybox、js 和 index.html。当前本地项目保存 Astro 源码。这次以本地新源码文件树替换旧网页文件树，旧文件仍可从 Git 历史找回。

已在本地添加 origin 并 fetch 旧 main，尚未提交、合并或推送本次变更。正式网址已设为 https://ztyoper.github.io，base 仍为 /；部署工作流已对齐 main、Node 24 与 pnpm 11.22.0。

先在 https://github.com/ztyoper/ztyoper.github.io/settings/pages 将 Build and deployment → Source 选择 GitHub Actions。当前公共仓库元数据 has_pages 为 false，需完成这一步，不能只上传文件就认为已开通 Pages。

文章准备好后，在项目 PowerShell 里逐行执行；上一条失败时先处理错误，不要继续：

```powershell
Set-Location -LiteralPath 'D:\Desktop\博客'
git status
git add .
git commit -m "feat: prepare Firefly blog for GitHub Pages"
git fetch origin
git merge -s ours --allow-unrelated-histories origin/main -m "chore: replace legacy blog with Firefly"
git push -u origin main
```

`-s ours` 表示这次合并完整保留本地新博客文件树，同时将旧仓库历史接到父提交中。它是此次迁移的专用步骤，不能替换成 `-X ours`，以后日常更新也不需要重复执行。这里只做普通 push，不使用 --force。

推送后，远程 main 会显示 src、public、package.json 等新源码，旧网页目录从当前分支文件树移除。无需手动删除远程仓库或逐个删除旧文件。上传的是项目源码，GitHub Actions 会安装依赖、检查、构建并部署 dist；node_modules、.tools、dist 和 .env 已被忽略。

在仓库 Actions 页面查看 Deploy to GitHub Pages，等待 build 与 deploy 成功，再访问 https://ztyoper.github.io/。如果推送时要求登录 GitHub，按本机 Git 凭据管理器提示完成，不把 Token 加入 remote URL。

若仍提示 non-fast-forward，说明远程在 fetch 后又有新提交；先检查远程变化，不改用强制推送。

## 5. 以后日常发布

初始化迁移完成后，文章保存只更新本地；公开网站需要提交和推送：

```powershell
git add .
git commit -m "docs: publish a new post"
git push
```

图片经 PicGo 上传后已在图床，博客文章则等自动部署成功后上线。任何 draft: true 的文章都不会进入生产页面，但 .md 源文件仍会进入公开仓库；不应将草稿开关当作保密措施。

官方参考：https://docs.astro.build/en/guides/deploy/github/
