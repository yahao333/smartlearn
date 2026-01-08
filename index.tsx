import React, { useState, useEffect, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type } from "@google/genai";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { useModuleContent } from "./hooks/useModuleContent";
import type {
  AppSettings,
  CourseModule,
  CoursePlan,
  IAIService,
  Message,
  QuizData,
  ResourceLink,
  UserGoal,
} from "./lib/types";

// --- Gemini 实现 ---

class GeminiService implements IAIService {
  private client: GoogleGenAI;
  private modelReasoning = 'gemini-3-pro-preview';
  private modelChat = 'gemini-3-flash-preview';
  private modelQuiz = 'gemini-3-flash-preview';

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateCoursePlan(goal: UserGoal): Promise<CoursePlan> {
    const prompt = `
      你是一位专业的教育课程设计师。请为用户设计一个结构化的学习计划。
      主题: ${goal.topic}
      水平: ${goal.level}
      时间限制: ${goal.time}
      
      请生成JSON格式的输出，包含课程概览和具体的模块划分。
      确保内容循序渐进，适合自学。
    `;

    const response = await this.client.models.generateContent({
      model: this.modelReasoning,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            level: { type: Type.STRING },
            totalDuration: { type: Type.STRING },
            overview: { type: Type.STRING },
            modules: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  duration: { type: Type.STRING },
                  keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            }
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  }

  async generateModuleContent(topic: string, module: CourseModule): Promise<{ content: string; resources: ResourceLink[] }> {
    const prompt = `
      作为导师，请详细讲解以下模块的内容。
      主题: ${topic}
      模块: ${module.title}
      目标: ${module.description}
      关键点: ${module.keyPoints.join(', ')}

      请用Markdown格式撰写详细的教学内容。
    `;

    const response = await this.client.models.generateContent({
      model: this.modelReasoning,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const links: ResourceLink[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach(chunk => {
        if (chunk.web) {
          links.push({ title: chunk.web.title || "相关资源", uri: chunk.web.uri || "", source: "Google Search" });
        }
      });
    }
    // 去重
    const uniqueLinks = links.filter((v,i,a)=>a.findIndex(t=>(t.uri===v.uri))===i);

    return {
      content: response.text || "暂无内容",
      resources: uniqueLinks
    };
  }

  async generateQuiz(module: CourseModule): Promise<QuizData> {
    const prompt = `
      基于以下模块内容生成一个包含3道单选题的测验。
      主题: ${module.title}
      内容概要: ${module.description}
      输出JSON格式。
    `;

    const response = await this.client.models.generateContent({
      model: this.modelQuiz,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            moduleId: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  }

  async chat(messages: Message[], context: { topic: string; module: string }): Promise<string> {
    // 简化处理，只取最后一条用户消息配合 System Prompt
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.text || "";
    
    const prompt = `
      系统指令: 你是“智学伴侣”的 AI 导师。
      当前课程主题: ${context.topic}
      当前模块: ${context.module}
      用户正在学习该模块。
      用户问题: ${lastUserMsg}
    `;

    const response = await this.client.models.generateContent({
      model: this.modelChat,
      contents: prompt,
    });

    return response.text || "抱歉，我无法回答。";
  }
}

// --- 阿里云百炼 (Qwen) 实现 ---

class AlibabaService implements IAIService {
  private apiKey: string;
  private baseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
  private model = "qwen-plus"; // 使用 Qwen-Plus 模型

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchAPI(messages: any[], jsonMode: boolean = false): Promise<string> {
    if (!this.apiKey) throw new Error("请先在设置中配置阿里云 API Key");

    const headers = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };

    const body: any = {
      model: this.model,
      messages: messages,
    };

    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    console.log(`📡 调用阿里云 API (${this.model})...`);
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("阿里云 API 错误:", err);
      throw new Error(`Alibaba API Error: ${res.statusText}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  async generateCoursePlan(goal: UserGoal): Promise<CoursePlan> {
    const systemPrompt = `你是一位专业的课程设计师。请输出纯 JSON 格式。
    JSON 结构必须严格符合：
    {
      "topic": "string",
      "level": "string",
      "totalDuration": "string",
      "overview": "string",
      "modules": [
        { "id": "string", "title": "string", "description": "string", "duration": "string", "keyPoints": ["string"] }
      ]
    }`;

    const userPrompt = `设计课程。主题: ${goal.topic}, 水平: ${goal.level}, 时间: ${goal.time}`;

    const content = await this.fetchAPI([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], true);

    try {
      return JSON.parse(content);
    } catch (e) {
      console.error("解析阿里云 JSON 失败，尝试修复...", content);
      // 简单的容错，防止 markdown 代码块包裹
      const fixed = content.replace(/```json\n|\n```/g, "");
      return JSON.parse(fixed);
    }
  }

  async generateModuleContent(topic: string, module: CourseModule): Promise<{ content: string; resources: ResourceLink[] }> {
    const prompt = `
      作为导师，请详细讲解以下模块。
      主题: ${topic}
      模块: ${module.title}
      目标: ${module.description}
      关键点: ${module.keyPoints.join(', ')}
      请用 Markdown 格式。
    `;

    const content = await this.fetchAPI([{ role: "user", content: prompt }]);
    
    // 阿里云百炼标准接口暂不提供结构化 Grounding，返回空列表
    // 实际项目中可接入 Bing API 或阿里云的搜索插件
    return { content, resources: [] }; 
  }

  async generateQuiz(module: CourseModule): Promise<QuizData> {
    const systemPrompt = `生成测验 JSON。结构：
    {
      "moduleId": "string",
      "questions": [
        { "question": "string", "options": ["string"], "correctIndex": number, "explanation": "string" }
      ]
    }`;
    
    const userPrompt = `基于模块"${module.title}"生成3道单选题。描述: ${module.description}`;

    const content = await this.fetchAPI([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], true);

    try {
      return JSON.parse(content);
    } catch (e) {
      const fixed = content.replace(/```json\n|\n```/g, "");
      return JSON.parse(fixed);
    }
  }

  async chat(messages: Message[], context: { topic: string; module: string }): Promise<string> {
    const systemMsg = {
      role: "system",
      content: `你是一个 AI 导师。课程: ${context.topic}, 模块: ${context.module}。请简短耐心地回答。`
    };

    // 转换消息格式
    const apiMessages = [
      systemMsg,
      ...messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text }))
    ];

    return await this.fetchAPI(apiMessages);
  }
}

// --- Hook: useAIService ---

const useAIService = (settings: AppSettings) => {
  return useMemo(() => {
    if (settings.provider === 'alibaba') {
      console.log("🔌 切换至: Alibaba Cloud (Qwen)");
      return new AlibabaService(settings.alibabaApiKey);
    } else {
      console.log("🔌 切换至: Google Gemini");
      return new GeminiService(process.env.API_KEY || "");
    }
  }, [settings.provider, settings.alibabaApiKey]);
};

// --- 常量 ---

const STORAGE_KEY = 'smartlearn_progress_v2'; // 升级版本号以区分旧数据
const SETTINGS_KEY = 'smartlearn_settings_v1';

// --- 组件 ---

const App = () => {
  // 核心状态
  const [view, setView] = useState<'onboarding' | 'dashboard' | 'learning' | 'quiz' | 'settings'>('onboarding');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  
  // 设置状态
  const [settings, setSettings] = useState<AppSettings>({
    provider: 'gemini',
    alibabaApiKey: ''
  });

  // AI Service Hook
  const aiService = useAIService(settings);

  // 业务数据
  const [userGoal, setUserGoal] = useState<UserGoal>({ topic: '', level: '初学者', time: '2周' });
  const [coursePlan, setCoursePlan] = useState<CoursePlan | null>(null);
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [moduleScores, setModuleScores] = useState<Record<number, number>>({});
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [moduleContentsCache, setModuleContentsCache] = useState<Record<number, { content: string; resources: ResourceLink[] }>>({});
  const [quizCache, setQuizCache] = useState<Record<number, QuizData>>({});

  const {
    content: moduleContent,
    resources: moduleResources,
    loadModuleContent,
    setContent: setModuleContent,
    setResources: setModuleResources,
  } = useModuleContent({
    aiService,
    coursePlan,
    moduleContentsCache,
    setModuleContentsCache,
  });
  
  // --- 持久化逻辑 ---

  useEffect(() => {
    // 加载进度
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.coursePlan) {
          setCoursePlan(parsed.coursePlan);
          setCurrentModuleIndex(parsed.currentModuleIndex || 0);
          setModuleScores(parsed.moduleScores || {});
          setModuleContentsCache(parsed.moduleContentsCache || {});
          setQuizCache(parsed.quizCache || {});
          setView('dashboard');
        }
      } catch (e) { console.error("加载进度失败", e); }
    }

    // 加载设置
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      try {
        setSettings(prev => ({ ...prev, ...JSON.parse(savedSettings) }));
      } catch (e) { console.error("加载设置失败", e); }
    }
  }, []);

  useEffect(() => {
    if (coursePlan) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          coursePlan,
          currentModuleIndex,
          moduleScores,
          moduleContentsCache,
          quizCache
        })
      );
    }
  }, [coursePlan, currentModuleIndex, moduleScores, moduleContentsCache, quizCache]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // --- 业务逻辑 ---

  const handleResetCourse = () => {
    if (confirm("确定要结束当前课程并开始新的学习吗？")) {
      localStorage.removeItem(STORAGE_KEY);
      setCoursePlan(null);
      setModuleScores({});
      setModuleContentsCache({});
      setQuizCache({});
      setCurrentModuleIndex(0);
      setView('onboarding');
    }
  };

  const handleGenerateCourse = async () => {
    if (!userGoal.topic) return;
    if (coursePlan) {
      console.log("已存在课程计划，跳转到概览而不重新生成");
      setView('dashboard');
      return;
    }
    setLoading(true);
    setLoadingText('正在规划学习路径...');

    try {
      const plan = await aiService.generateCoursePlan(userGoal);
      setCoursePlan(plan);
      setModuleScores({});
      setView('dashboard');
    } catch (error: any) {
      console.error("生成课程失败:", error);
      alert(`生成失败: ${error.message || "请检查设置或网络"}`);
      if (settings.provider === 'alibaba' && !settings.alibabaApiKey) {
        setView('settings');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartModule = async (index: number) => {
    setCurrentModuleIndex(index);
    const module = coursePlan?.modules[index];
    if (!module) return;

    const cached = moduleContentsCache[index];
    if (cached) {
      console.log("命中缓存的模块内容，直接进入学习视图");
      await loadModuleContent(index);
      setView('learning');
      return;
    }

    setLoading(true);
    setLoadingText(`正在准备“${module.title}”的学习资料...`);
    setModuleContent('');
    setModuleResources([]);

    try {
      await loadModuleContent(index);
      setView('learning');
    } catch (error: any) {
      console.error("加载内容失败:", error);
      alert("加载内容失败，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleStartQuiz = async () => {
    const module = coursePlan?.modules[currentModuleIndex];
    if (!module) return;

    const cachedQuiz = quizCache[currentModuleIndex];
    if (cachedQuiz) {
      console.log("命中缓存的测验数据，直接进入测验视图");
      setQuizData(cachedQuiz);
      setView('quiz');
      return;
    }

    setLoading(true);
    setLoadingText('正在生成测验...');

    try {
      const data = await aiService.generateQuiz(module);
      setQuizData(data);
      setQuizCache(prev => ({ ...prev, [currentModuleIndex]: data }));
      setView('quiz');
    } catch (error) {
      console.error("生成测验失败:", error);
      alert("生成测验失败");
    } finally {
      setLoading(false);
    }
  };

  const handleQuizFinish = (correct: number, total: number) => {
    const scorePercentage = Math.round((correct / total) * 100);
    setModuleScores(prev => ({ ...prev, [currentModuleIndex]: scorePercentage }));
    setView('dashboard');
  };

  // --- 渲染逻辑 ---

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-blue-50">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xl font-medium text-blue-800 animate-pulse">{loadingText}</p>
        <p className="text-sm text-gray-500 mt-2">Current Provider: {settings.provider === 'gemini' ? 'Google Gemini' : 'Alibaba Cloud'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setView(coursePlan ? 'dashboard' : 'onboarding')}>
            <span className="text-2xl">🎓</span>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              智学伴侣 SmartLearn
            </h1>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            {coursePlan && view !== 'settings' && (
              <button onClick={handleResetCourse} className="text-red-500 hover:text-red-700 underline text-xs">
                结束课程
              </button>
            )}
            <button 
              onClick={() => setView('settings')}
              className="p-2 text-gray-500 hover:text-indigo-600 transition rounded-full hover:bg-gray-100"
              title="设置"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {view === 'settings' && (
          <SettingsView 
            settings={settings} 
            setSettings={setSettings} 
            onClose={() => setView(coursePlan ? 'dashboard' : 'onboarding')} 
          />
        )}

        {view === 'onboarding' && (
          <OnboardingView 
            userGoal={userGoal} 
            setUserGoal={setUserGoal} 
            onGenerate={handleGenerateCourse} 
          />
        )}
        
        {view === 'dashboard' && coursePlan && (
          <DashboardView 
            plan={coursePlan} 
            moduleScores={moduleScores}
            onStartModule={handleStartModule} 
          />
        )}

        {view === 'learning' && coursePlan && (
          <LearningView 
            module={coursePlan.modules[currentModuleIndex]}
            content={moduleContent}
            resources={moduleResources}
            onBack={() => setView('dashboard')}
            onTakeQuiz={handleStartQuiz}
            topic={coursePlan.topic}
            aiService={aiService} // 传递 Service 实例
          />
        )}

        {view === 'quiz' && quizData && (
          <QuizView 
            quiz={quizData} 
            onBack={() => setView('learning')}
            onFinish={handleQuizFinish} 
          />
        )}
      </main>
    </div>
  );
};

// --- 视图组件 ---

const SettingsView = ({ settings, setSettings, onClose }: { settings: AppSettings, setSettings: any, onClose: () => void }) => {
  return (
    <div className="max-w-lg mx-auto bg-white p-8 rounded-2xl shadow-lg animate-fade-in border border-gray-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">系统设置</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">AI 模型提供商</label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setSettings({...settings, provider: 'gemini'})}
              className={`p-4 rounded-xl border text-left transition ${settings.provider === 'gemini' ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <div className="font-bold text-indigo-900">Google Gemini</div>
              <div className="text-xs text-gray-500 mt-1">内置 API Key</div>
            </button>
            <button
              onClick={() => setSettings({...settings, provider: 'alibaba'})}
              className={`p-4 rounded-xl border text-left transition ${settings.provider === 'alibaba' ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <div className="font-bold text-orange-900">阿里云百炼</div>
              <div className="text-xs text-gray-500 mt-1">Qwen-Plus 模型</div>
            </button>
          </div>
        </div>

        {settings.provider === 'alibaba' && (
          <div className="animate-fade-in">
            <label className="block text-sm font-medium text-gray-700 mb-2">阿里云 API Key (DashScope)</label>
            <input 
              type="password" 
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 outline-none transition"
              placeholder="sk-..."
              value={settings.alibabaApiKey}
              onChange={(e) => setSettings({...settings, alibabaApiKey: e.target.value})}
            />
            <p className="text-xs text-gray-500 mt-2">
              请前往阿里云百炼控制台获取 API Key。您的 Key 仅存储在本地浏览器中。
            </p>
          </div>
        )}

        <div className="pt-4 border-t border-gray-100">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition"
          >
            保存并返回
          </button>
        </div>
      </div>
    </div>
  );
}

const OnboardingView = ({ userGoal, setUserGoal, onGenerate }: any) => {
  return (
    <div className="max-w-xl mx-auto bg-white p-8 rounded-2xl shadow-lg animate-fade-in border border-gray-100">
      <h2 className="text-3xl font-bold mb-6 text-center text-gray-800">开始你的学习之旅</h2>
      <p className="text-gray-500 text-center mb-8">告诉我你想学什么，我将为你量身定制课程。</p>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">学习主题</label>
          <input 
            type="text" 
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-gray-900 placeholder-gray-400"
            placeholder="例如：Python编程、西方艺术史、摄影基础..."
            value={userGoal.topic}
            onChange={(e) => setUserGoal({...userGoal, topic: e.target.value})}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">当前水平</label>
            <select 
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
              value={userGoal.level}
              onChange={(e) => setUserGoal({...userGoal, level: e.target.value})}
            >
              <option>零基础 / 初学者</option>
              <option>有一定基础 / 中级</option>
              <option>专家 / 高级</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">时间投入</label>
            <select 
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
              value={userGoal.time}
              onChange={(e) => setUserGoal({...userGoal, time: e.target.value})}
            >
              <option>1周突击</option>
              <option>2周标准</option>
              <option>1个月深入</option>
              <option>3个月长期</option>
            </select>
          </div>
        </div>

        <button 
          onClick={onGenerate}
          disabled={!userGoal.topic}
          className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-md transition transform hover:scale-[1.02] ${userGoal.topic ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg' : 'bg-gray-300 cursor-not-allowed'}`}
        >
          生成学习计划 ✨
        </button>
      </div>
    </div>
  );
};

const DashboardView = ({ plan, moduleScores, onStartModule }: { plan: CoursePlan, moduleScores: Record<number, number>, onStartModule: (i: number) => void }) => {
  const completedCount = Object.keys(moduleScores).length;
  const progressPercent = Math.round((completedCount / plan.modules.length) * 100);

  return (
    <div className="animate-fade-in">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{plan.topic} - 学习路径图</h2>
            <p className="text-gray-600 mt-1">{plan.overview}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-indigo-600">{progressPercent}%</div>
            <div className="text-xs text-gray-500">总体进度</div>
          </div>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
          <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }}></div>
        </div>

        <div className="flex gap-4 mt-4 text-sm text-gray-500">
          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full">难度: {plan.level}</span>
          <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full">时长: {plan.totalDuration}</span>
          <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full">{plan.modules.length} 个模块</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plan.modules.map((module, idx) => {
          const score = moduleScores[idx];
          const isCompleted = score !== undefined;

          return (
            <div 
              key={idx} 
              className={`bg-white p-6 rounded-xl border transition cursor-pointer flex flex-col h-full relative overflow-hidden ${isCompleted ? 'border-green-200 bg-green-50/30' : 'border-gray-200 hover:border-blue-300 hover:shadow-md'}`}
              onClick={() => onStartModule(idx)}
            >
              {isCompleted && (
                <div className="absolute top-0 right-0 bg-green-500 text-white text-xs px-2 py-1 rounded-bl-lg font-bold">
                  已完成: {score}%
                </div>
              )}
              <div className="flex justify-between items-start mb-4">
                <span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {isCompleted ? '✓' : idx + 1}
                </span>
                <span className="text-xs text-gray-400">{module.duration}</span>
              </div>
              <h3 className="text-lg font-bold mb-2 text-gray-800">{module.title}</h3>
              <p className="text-sm text-gray-500 mb-4 line-clamp-3 flex-grow">{module.description}</p>
              <div className="mt-auto pt-4 border-t border-gray-50">
                <span className={`text-sm font-medium flex items-center group ${isCompleted ? 'text-green-600' : 'text-blue-600'}`}>
                  {isCompleted ? '复习模块' : '开始学习'} <span className="ml-1 group-hover:translate-x-1 transition">→</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const LearningView = ({ module, content, resources, onBack, onTakeQuiz, topic, aiService }: any) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
      <div className="lg:col-span-2 space-y-8">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 mb-4 flex items-center text-sm transition">
            ← 返回概览
          </button>
          <div className="border-b border-gray-100 pb-6 mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">{module.title}</h2>
            <p className="text-gray-500">{module.description}</p>
          </div>
          
          <div className="prose prose-blue max-w-none">
            <MarkdownRenderer markdown={content} />
          </div>

          <div className="mt-12 pt-8 border-t border-gray-100">
            <button 
              onClick={onTakeQuiz}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              <span>📝</span> 完成学习，开始测验
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800">
            <span>📚</span> 推荐资源
          </h3>
          {resources.length > 0 ? (
            <ul className="space-y-3">
              {resources.map((res: ResourceLink, i: number) => (
                <li key={i}>
                  <a href={res.uri} target="_blank" rel="noopener noreferrer" className="block p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition border border-gray-100 group">
                    <div className="text-sm font-medium text-blue-700 group-hover:underline line-clamp-2">{res.title}</div>
                    <div className="text-xs text-gray-400 mt-1">{res.source}</div>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">暂无外部资源推荐。</p>
          )}
        </div>

        <ChatWidget topic={topic} currentModule={module.title} aiService={aiService} />
      </div>
    </div>
  );
};

const ChatWidget = ({ topic, currentModule, aiService }: { topic: string, currentModule: string, aiService: IAIService }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: `你好！我是你的 AI 导师。关于“${currentModule}”这一节，有什么不懂的随时问我！` }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
     setMessages(prev => [...prev, { role: 'model', text: `我们现在进入了“${currentModule}”。有任何问题请告诉我。` }]);
  }, [currentModule]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    
    const userMsg = input;
    const newHistory = [...messages, { role: 'user', text: userMsg } as Message];
    setMessages(newHistory);
    setInput('');
    setIsSending(true);

    try {
      const responseText = await aiService.chat(newHistory, { topic, module: currentModule });
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (err) {
      console.error("❌ 聊天错误:", err);
      setMessages(prev => [...prev, { role: 'model', text: "遇到一点连接问题，请稍后再试。" }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[500px]">
      <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-t-2xl">
        <h3 className="text-white font-bold flex items-center gap-2">
          <span>🤖</span> AI 导师在线
        </h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-white text-gray-700 border border-gray-200 rounded-bl-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-full px-3 py-1 text-xs text-gray-500 animate-pulse">
              输入中...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-3 bg-white border-t border-gray-100 rounded-b-2xl">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 px-4 py-2 border border-gray-200 rounded-full text-sm focus:outline-none focus:border-blue-500 bg-white text-gray-900"
            placeholder="提问..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-blue-700 transition disabled:bg-gray-300"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
};

const QuizView = ({ quiz, onBack, onFinish }: { quiz: QuizData, onBack: () => void, onFinish: (correct: number, total: number) => void }) => {
  const [answers, setAnswers] = useState<number[]>(new Array(quiz.questions.length).fill(-1));
  const [submitted, setSubmitted] = useState(false);
  // 新增状态：记录展开了解析的问题索引
  const [expandedExplanations, setExpandedExplanations] = useState<Set<number>>(new Set());

  const handleOptionSelect = (qIndex: number, oIndex: number) => {
    if (submitted) return;
    const newAnswers = [...answers];
    newAnswers[qIndex] = oIndex;
    setAnswers(newAnswers);
  };

  const toggleExplanation = (qIndex: number) => {
    const newSet = new Set(expandedExplanations);
    if (newSet.has(qIndex)) {
      newSet.delete(qIndex);
    } else {
      newSet.add(qIndex);
    }
    setExpandedExplanations(newSet);
  };

  const calculateScore = () => {
    let correct = 0;
    answers.forEach((ans, idx) => {
      if (ans === quiz.questions[idx].correctIndex) correct++;
    });
    return correct;
  };

  const score = submitted ? calculateScore() : 0;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
          <h2 className="text-2xl font-bold text-gray-800">阶段测验</h2>
          {submitted && (
            <div className="text-xl font-bold text-indigo-600">
              得分: {score} / {quiz.questions.length}
            </div>
          )}
        </div>

        <div className="space-y-8">
          {quiz.questions.map((q, qIdx) => {
            const isCorrect = answers[qIdx] === q.correctIndex;
            const isWrong = submitted && !isCorrect;

            return (
              <div key={qIdx} className="space-y-3">
                <p className="font-semibold text-lg text-gray-800">{qIdx + 1}. {q.question}</p>
                <div className="space-y-2">
                  {q.options.map((opt, oIdx) => {
                    let btnClass = "w-full text-left px-4 py-3 rounded-lg border transition ";
                    if (submitted) {
                      if (oIdx === q.correctIndex) btnClass += "bg-green-100 border-green-500 text-green-800";
                      else if (answers[qIdx] === oIdx && answers[qIdx] !== q.correctIndex) btnClass += "bg-red-100 border-red-500 text-red-800";
                      else btnClass += "bg-gray-50 border-gray-200 text-gray-400";
                    } else {
                      if (answers[qIdx] === oIdx) btnClass += "bg-blue-50 border-blue-500 text-blue-800 shadow-sm ring-1 ring-blue-500";
                      else btnClass += "bg-white border-gray-200 hover:bg-gray-50 text-gray-700";
                    }

                    return (
                      <button 
                        key={oIdx}
                        onClick={() => handleOptionSelect(qIdx, oIdx)}
                        className={btnClass}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {submitted && (
                  <div className="mt-3">
                    <button 
                      onClick={() => toggleExplanation(qIdx)}
                      className={`text-sm font-medium flex items-center gap-1 focus:outline-none transition-colors ${isWrong ? 'text-red-600 hover:text-red-800' : 'text-indigo-600 hover:text-indigo-800'}`}
                    >
                      <span className="transform transition-transform duration-200" style={{ transform: expandedExplanations.has(qIdx) ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span> 
                      {expandedExplanations.has(qIdx) ? '收起解析' : isWrong ? '回答错误，查看原因' : '查看解析'}
                    </button>
                    {expandedExplanations.has(qIdx) && (
                      <div className="mt-2 bg-yellow-50 p-4 rounded-lg text-sm text-yellow-800 border border-yellow-200 animate-fade-in">
                        <strong>解析：</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700">放弃并返回</button>
          {!submitted ? (
            <button 
              onClick={() => setSubmitted(true)}
              disabled={answers.includes(-1)}
              className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              提交答案
            </button>
          ) : (
            <button 
              onClick={() => onFinish(score, quiz.questions.length)}
              className="px-8 py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-900 transition shadow-md"
            >
              完成并继续
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
