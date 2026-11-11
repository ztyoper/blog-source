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

## 4. 发布到重建的仓库

如果愿意公开 Astro 源码和 Markdown，请在 GitHub 新建公开的空仓库 `ztyoper.github.io`。仓库留空，首次推送会用本地 `main` 初始化它。

本地 `main` 已包含语雀导入的提交，`origin` 指向同名仓库地址。正式网址为 `https://ztyoper.github.io`，部署工作流在推送 `main` 时构建并发布 `dist`。

打开仓库的 Settings → Pages，在 Build and deployment → Source 选择 **GitHub Actions**。 [Pages 设置](https://github.com/ztyoper/ztyoper.github.io/settings/pages)

文章准备好后，在项目 PowerShell 里逐行执行。先用 `git diff --cached --stat` 检查即将提交的文件。每条命令成功后再执行下一条。

```powershell
Set-Location -LiteralPath 'D:\Desktop\博客'
git status
git remote -v
git add -A
git diff --cached --stat
git commit -m "feat: prepare Firefly blog for GitHub Pages"
git push -u origin main
```

推送后，远程 `main` 会显示 `src`、`public`、`package.json` 等新源码。GitHub Actions 会安装依赖、检查、构建并部署 `dist`。现有 `.gitignore` 已过滤 `node_modules`、`.tools`、`dist` 和本地环境变量文件。已经被 Git 跟踪的文件可用 `git rm --cached -- 文件名` 从下次提交移除并保留本地副本。 [GitHub 忽略文件说明](https://docs.github.com/en/repositories/working-with-files/managing-files/ignoring-files)

在仓库 Actions 页面查看 Deploy to GitHub Pages，等待 build 与 deploy 成功，再访问 https://ztyoper.github.io/。如果推送时要求登录 GitHub，按本机 Git 凭据管理器提示完成，不把 Token 加入 remote URL。

如果提示 non-fast-forward，先执行 `git fetch origin` 检查远程仓库里是否已有提交。

## 5. 以后日常发布

初始化迁移完成后，文章保存只更新本地；公开网站需要提交和推送：

```powershell
git add .
git commit -m "docs: publish a new post"
git push
```

图片经 PicGo 上传后已在图床，博客文章则等自动部署成功后上线。任何 draft: true 的文章都不会进入生产页面，但 .md 源文件仍会进入公开仓库；不应将草稿开关当作保密措施。

官方参考：https://docs.astro.build/en/guides/deploy/github/

## 6. 接通留言板

Firefly 的导航已有「留言」，页面地址是 `/guestbook/`。使用 Giscus 后，留言保存在 GitHub Discussions，访客通过 GitHub 登录留言。

1. 在仓库 Settings → General → Features 勾选 **Discussions**。 [仓库设置](https://github.com/ztyoper/ztyoper.github.io/settings)
2. 安装 Giscus，仅授权 `ztyoper/ztyoper.github.io`。 [安装 Giscus](https://github.com/apps/giscus)
3. 在 Giscus 配置页输入 `ztyoper/ztyoper.github.io`，选择 Discussions 分类和 `pathname` 映射。 [生成 Giscus 配置](https://giscus.app/zh-CN)
4. 将生成的 `data-repo-id`、`data-category` 和 `data-category-id` 分别填到 `src/config/commentConfig.ts` 的 `giscus.repoId`、`giscus.category` 和 `giscus.categoryId`，再将 `type` 设为 `"giscus"`。重建的仓库会有新的 ID。此设置也会启用允许评论的文章的评论区。
5. 提交并推送配置，在正式站的留言页验证登录和留言。

## 7. 更换 R2 图片域名

在 R2 的桶设置中，将自己的图片域名连接到现有桶。先用新域名打开一张原图，路径继续使用 `/PicGo/原文件名`。 [Cloudflare R2 自定义域名](https://developers.cloudflare.com/r2/buckets/public-buckets/#connect-a-bucket-to-a-custom-domain)

在博客目录执行以下命令，将示例地址换成你的新域名。

```powershell
.\scripts\package-managers\firefly\pnpm.cmd images:domain https://img.example.com
```

命令会抽查新域名上的图片内容，备份旧文件，再更新文章直链、图片映射和导入清单。备份保存在 `.tools/backups/`。更新 PicGo 的公开 URL 前缀，让新上传的图片也生成新域名链接。提交和部署博客后，确认线上图片能通过新地址打开，再决定是否关闭旧地址。
