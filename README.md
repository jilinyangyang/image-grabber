# 图提取 ImageGrab —— 电商图片下载插件

一款 Chrome 浏览器扩展（Manifest V3）：在**淘宝 / 天猫 / 京东 / 拼多多商家版**的商品详情页右下角注入「获取图片」按钮，一键提取页面所有商品图，并在独立画廊页集中预览、自由勾选，批量下载为 **PNG** 或打包为 **ZIP**。

## 功能特性

- **一键提取**：自动扫描页面所有商品图，兼容 `<img>`、`srcset`、`data-src` 等懒加载属性及内联背景图
- **智能过滤**：自动排除图标、Logo、占位图与过小图片
- **集中预览**：新画廊页网格展示，缩略图 + 尺寸信息
- **自由勾选**：全选 / 反选 / 按需选择
- **统一 PNG**：jpg、webp 等格式经 canvas 自动转换为 PNG
- **批量下载**：文件名自动编号（商品图_001.png），支持单张或打包 ZIP

## 目录结构

```
image-grabber/
├── manifest.json      # 扩展清单（MV3）
├── content.js         # 内容脚本：注入按钮 + 提取图片
├── content.css        # 悬浮按钮样式
├── background.js      # Service Worker：存取图片列表、打开画廊页
├── gallery.html       # 画廊页
├── gallery.js         # 画廊逻辑：预览、勾选、PNG/ZIP 下载
├── gallery.css        # 画廊样式
├── icons/             # 扩展图标（16/48/128）
├── docs/              # 官网静态站
│   ├── index.html
│   ├── css/style.css
│   ├── js/main.js
│   └── downloads/     # 插件分发 ZIP
├── README.md
└── AGENTS.md
```

## 安装与使用

1. 下载并解压 `ImageGrabber.zip`（或克隆本仓库）。
2. 打开 Chrome，地址栏输入 `chrome://extensions` 回车。
3. 打开右上角「开发者模式」开关。
4. 点击「加载已解压的扩展程序」，选择解压后的文件夹。
5. 打开任意支持平台的商品详情页，点击右下角「获取图片」按钮。
6. 在画廊页勾选需要的图片，点击「下载选中 (PNG)」或「打包下载 (ZIP)」。

## 官方宣传站

双击 `docs/index.html` 即可本地预览；项目推送到 GitHub 后可在 GitHub Pages 在线访问。

## 技术说明

- 使用 **Manifest V3**：`activeTab`、`scripting`、`downloads`、`storage` 权限
- `host_permissions` 覆盖淘宝、天猫、京东、拼多多商家版域名
- 图片转 PNG 由画廊页 `fetch + createImageBitmap + canvas.toDataURL` 完成，配合 host 权限解决跨域
- 依赖为零：ZIP 打包使用内置的简化实现（Store 方式，支持 UTF-8 中文文件名）

> 仅供学习交流与个人使用，请遵守各平台服务条款与版权规定。
