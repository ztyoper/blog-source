# PicGo 图文写作与首次发布

本文对应当前项目 `D:\Desktop\博客`。图片通过 PicGo 上传到 Cloudflare R2，博客源码放在私有 `ztyoper/blog-source`，生成的网站发布到公开 `ztyoper/ztyoper.github.io`。

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

## 4. 设置私有源码与公开展示仓库

1. 在 **blog-source** 的 **Settings → General → Danger Zone → Change repository visibility** 将源码仓库设为 **Private**。确认展示仓库 **`ztyoper.github.io`** 存在且为 **Public**。如果找不到，就以这个准确名称新建一个公开空仓库。 [源码仓库设置](https://github.com/ztyoper/blog-source/settings) · [展示仓库](https://github.com/ztyoper/ztyoper.github.io)
2. 创建一个 fine-grained personal access token。**Resource owner** 选 `ztyoper`，**Repository access** 选择 **Only select repositories**，只勾选 `ztyoper.github.io`。仓库权限 **Contents** 设为 **Read and write**。 [创建令牌](https://github.com/settings/personal-access-tokens/new)
3. 在 **blog-source → Settings → Secrets and variables → Actions → New repository secret** 新建 `PAGES_PUBLISH_TOKEN`，把令牌填进 Value。发布作业会从这里读取令牌。 [添加仓库 Secret](https://github.com/ztyoper/blog-source/settings/secrets/actions)
4. 在项目 PowerShell 检查 `origin` 指向 `https://github.com/ztyoper/blog-source.git`，然后推送本地 `main`。

```powershell
Set-Location -LiteralPath 'D:\Desktop\博客'
git status
git remote -v
git push -u origin main
```

5. 在 **blog-source → Actions** 查看 **Publish Firefly to GitHub Pages**。`build` 负责检查和生成 `dist`，`publish` 将 `dist` 发布到公开仓库的 `gh-pages`。首次运行成功后才会出现这个分支。 [源码仓库 Actions](https://github.com/ztyoper/blog-source/actions)
6. 在公开仓库 **Settings → Pages → Source** 选择 **Deploy from a branch**，分支选 `gh-pages`，目录选 `/(root)`，保存并等待 Pages 部署。后续源码提交会更新生成分支，编辑入口始终使用源码仓库的 `main`。 [Pages 设置](https://github.com/ztyoper/ztyoper.github.io/settings/pages) · [正式网站](https://ztyoper.github.io/)

`gh-pages` 每次发布用新的静态文件快照替换，只保留最新生成提交。`.gitignore` 过滤本地依赖、构建产物、备份和环境变量文件。源码仓库里 `draft: true` 的草稿原文保留在私库，标记为正式发布的文章会出现在公开网站上。

## 5. 以后日常发布

手机阅读文章时，点标题附近的 **编辑本文**，登录 GitHub 后直接修改 `blog-source/main` 中的 Markdown。确认改动并提交，等待 Actions 发布。已有 `.md` 可以在源码仓库的 `src/content/posts/` 上传。

电脑编辑前先拉取手机提交的版本，在源码仓库提交并推送。

```powershell
git pull --ff-only
git add -- src/content/posts
git commit -m "docs: publish a new post"
git push
```

图片经 PicGo 上传后即可引用。文章在 GitHub Actions 与 Pages 部署成功后上线。

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
