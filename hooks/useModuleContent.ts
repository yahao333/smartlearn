import { useCallback, useState } from 'react';
import type { CoursePlan, IAIService, ResourceLink } from '../lib/types';

export function useModuleContent(params: {
  aiService: IAIService;
  coursePlan: CoursePlan | null;
  moduleContentsCache: Record<number, { content: string; resources: ResourceLink[] }>;
  setModuleContentsCache: React.Dispatch<
    React.SetStateAction<Record<number, { content: string; resources: ResourceLink[] }>>
  >;
}) {
  const { aiService, coursePlan, moduleContentsCache, setModuleContentsCache } = params;
  const [content, setContent] = useState<string>('');
  const [resources, setResources] = useState<ResourceLink[]>([]);

  const loadModuleContent = useCallback(
    async (index: number) => {
      const module = coursePlan?.modules[index];
      if (!coursePlan || !module) {
        throw new Error('课程信息缺失，无法加载模块内容');
      }

      const cached = moduleContentsCache[index];
      if (cached) {
        setContent(cached.content);
        setResources(cached.resources);
        return cached;
      }

      const result = await aiService.generateModuleContent(coursePlan.topic, module);
      setContent(result.content);
      setResources(result.resources);
      setModuleContentsCache((prev) => ({ ...prev, [index]: result }));
      return result;
    },
    [aiService, coursePlan, moduleContentsCache, setModuleContentsCache]
  );

  return {
    content,
    resources,
    loadModuleContent,
    setContent,
    setResources,
  };
}

