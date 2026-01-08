# 运行并部署你的 AI Studio 应用

本项目包含了在本地运行应用所需的一切配置。

在 AI Studio 中查看你的应用：[点击这里](https://ai.studio/apps/drive/173Pkz_uXR3Ej-UA4oZGaddzgSFy_0WW1)

[English](./README.md) | [简体中文](./README_zh-CN.md)

## 本地运行指南

**前置要求：** 需要安装 [Node.js](https://nodejs.org/) 环境。

### 1. 安装依赖

在终端中运行以下命令安装项目所需的依赖包：

```bash
npm install
```

### 2. 配置环境变量

在项目根目录下创建一个名为 `.env.local` 的文件，并将你的 Gemini API 密钥配置在其中：

```env
GEMINI_API_KEY=你的_API_密钥_这里
```

> **注意**：不要将你的 API 密钥提交到版本控制系统中（`.env.local` 文件默认已被忽略）。

### 3. 启动应用

运行以下命令启动本地开发服务器：

```bash
npm run dev
```

启动后，通常可以通过浏览器访问 `http://localhost:5173` 来查看应用。
