# SmartLearn AI 架构与逻辑分析指南

这份文档旨在帮助初学者理解 **SmartLearn** 项目的结构，特别是前端应用如何与 AI 模型（如 Google Gemini 和 阿里云百炼）进行交互。

---

## 1. 项目概览：它是什么？

SmartLearn 是一个 **AI Native（AI原生）** 的教育 Web 应用。
*   **传统应用**：内容存储在数据库中，由人工编写。
*   **AI Native 应用**：内容由 AI 实时生成。应用本身只是一个“壳”，负责向 AI 提问并展示 AI 的回答。

### 核心流程
1.  **用户输入**：用户告诉 App 想学什么（例如“Python 基础”）。
2.  **Prompt 构建**：App 将用户的需求包装成一段专业的**提示词（Prompt）**。
3.  **AI 推理**：AI 接收提示词，生成结构化的数据（如课程大纲 JSON）。
4.  **UI 渲染**：App 接收数据，画出漂亮的界面（进度条、卡片、测验题）。

---

## 2. 核心架构设计：AI 服务层

为了让应用既能用 Google 的模型，又能用阿里云的模型，代码使用了 **面向接口编程** 的设计思想。

### 2.1 抽象层 (`IAIService`)
想象 `IAIService` 是一个**菜单**，它规定了 AI 必须会做四道菜：
1.  `generateCoursePlan`: 生成课程大纲。
2.  `generateModuleContent`: 生成具体的学习内容。
3.  `generateQuiz`: 生成测验题。
4.  `chat`: 进行对话。

**好处**：React 组件（UI）只管照着菜单点菜，不在乎后厨是“谷歌厨师”还是“阿里厨师”在做饭。

### 2.2 实现层 (具体干活的类)

*   **`GeminiService` (Google)**:
    *   使用官方 SDK (`@google/genai`)。
    *   **特色能力**：支持 `responseSchema`（强制返回标准 JSON）和 `googleSearch`（联网搜索）。
    *   **鉴权**：使用环境变量中的 API Key。

*   **`AlibabaService` (阿里云)**:
    *   使用原生 `fetch` 请求 REST API。
    *   **兼容性**：模拟了 OpenAI 的消息格式。
    *   **处理 JSON**：由于 HTTP 接口返回的是纯文本字符串，代码里需要手动 `JSON.parse()` 解析 AI 的回复，并做了简单的容错处理（去掉 markdown 的 ```json 标记）。

### 2.3 调度层 (`useAIService` Hook)
这是一个 React Hook，它监听用户的 `settings`。用户在设置里切换模型时，这个 Hook 就把对应的“厨师”实例化并交给组件使用。

---

## 3. AI 逻辑深度解析 (小白必读)

这是本项目最核心的部分：**如何让 AI 听话？**

### 3.1 结构化输出 (Structured Output)
AI 本质上是一个聊天机器人，通常吐出的是一大段文字。但我们的前端需要渲染**进度条**、**按钮**和**选项卡**。

*   **问题**：如果 AI 回复 "首先学习变量，然后学习循环..."，前端代码很难处理。
*   **解决**：强制 AI 输出 **JSON** 格式。

**代码示例 (Gemini)**:
```typescript
responseSchema: {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    modules: { type: Type.ARRAY, ... } // 强制要求包含数组
  }
}
```
**代码示例 (阿里云/通用 Prompt)**:
```typescript
const systemPrompt = `你是一位专业的课程设计师。请输出纯 JSON 格式。
JSON 结构必须严格符合：{ "topic": "string", "modules": [...] }`;
```
通过这种方式，AI 生成的内容可以直接被前端代码读取为对象。

### 3.2 提示词工程 (Prompt Engineering)
代码中把对 AI 的指令写成了模板字符串。

*   **角色设定 (Persona)**: "你是一位专业的教育课程设计师..." —— 设定角色能让 AI 的回答更专业。
*   **上下文注入 (Context Injection)**:
    *   在聊天功能中，我们不仅仅发送用户的最后一句话。
    *   代码会构建一个 prompt：`系统指令: 当前课程主题是 ${topic}，当前模块是 ${module}。用户问: ${userMsg}`。
    *   **原理**：AI 没有记忆（或者说记忆很短），我们需要在每次请求时把“当前背景”喂给它，它才能回答得像个贴身导师。

### 3.3 联网增强 (Grounding / RAG 雏形)
在 `GeminiService` 中，我们启用了 `tools: [{ googleSearch: {} }]`。
*   **原理**：模型在回答前，会先去 Google 搜一下最新信息，然后结合搜索结果生成答案。
*   **前端处理**：代码从 `groundingMetadata` 中提取 URL，渲染成“推荐资源”卡片。这解决了 AI 容易“一本正经胡说八道”的问题。

---

## 4. 数据流与持久化

应用使用了 `localStorage` 来保存学习进度。

1.  **Hydration (注水/加载)**: 页面刷新时，`useEffect` 会从浏览器缓存读取 JSON 字符串，恢复成 React 状态（课程表、分数）。
2.  **Persistence (持久化)**: 当用户学完一个模块或考完试，状态改变，`useEffect` 自动把新状态写入缓存。

---

## 5. 总结

SmartLearn 项目展示了开发 AI 应用的三个关键步骤：

1.  **定义数据结构**：确定前端需要什么样的数据（JSON 格式）。
2.  **编写 Prompt**：用自然语言“编程”，让 AI 填充这些数据结构。
3.  **封装接口**：隔离具体的 AI 厂商差异，保持前端业务逻辑的纯净。
