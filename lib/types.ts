export interface CourseModule {
  id: string;
  title: string;
  description: string;
  duration: string;
  keyPoints: string[];
}

export interface CoursePlan {
  topic: string;
  level: string;
  totalDuration: string;
  overview: string;
  modules: CourseModule[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface QuizData {
  moduleId: string;
  questions: QuizQuestion[];
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}

export interface ResourceLink {
  title: string;
  uri: string;
  source?: string;
}

export interface UserGoal {
  topic: string;
  level: string;
  time: string;
}

export type AIProvider = 'gemini' | 'alibaba';

export interface AppSettings {
  provider: AIProvider;
  alibabaApiKey: string;
}

export interface IAIService {
  generateCoursePlan(goal: UserGoal): Promise<CoursePlan>;
  generateModuleContent(
    topic: string,
    module: CourseModule
  ): Promise<{ content: string; resources: ResourceLink[] }>;
  generateQuiz(module: CourseModule): Promise<QuizData>;
  chat(messages: Message[], context: { topic: string; module: string }): Promise<string>;
}

