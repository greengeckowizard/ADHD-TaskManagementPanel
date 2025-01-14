import { useEffect, useState } from 'react';
import { getPuter } from '../../lib/puter';
import type { Task } from '../../components/TaskPanel';
import { usePredictiveAnalytics } from '../../hooks/usePredictiveAnalytics';

interface Analytics {
  bottleneckAnalysis?: {
    potentialBottlenecks: Array<{
      type: string;
      description: string;
      impact: string;
      affectedTasks: string[];
      predictedDelay: number;
      mitigationSuggestions: string[];
    }>;
    workloadForecasts: Array<{
      timeframe: string;
      predictedUtilization: number;
      riskLevel: string;
      bottleneckProbability: number;
      recommendations: string[];
    }>;
  };
  completionRate: number;
  avgCompletionTime: number;
  tasksByPriority: { high: number; medium: number; low: number };
  tasksByCategory: { work: number; personal: number; urgent: number };
  productiveHours: { hour: number; completions: number }[];
}

export function useAnalytics() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({
    completionRate: 0,
    avgCompletionTime: 0,
    tasksByPriority: { high: 0, medium: 0, low: 0 },
    tasksByCategory: { work: 0, personal: 0, urgent: 0 },
    productiveHours: Array.from({ length: 24 }, (_, i) => ({ hour: i, completions: 0 })),
  });

  useEffect(() => {
    const loadTasks = async () => {
      const puter = getPuter();
      if (puter.kv) {
        const tasksString = await puter.kv.get("tasks");
        if (tasksString) {
          const parsedTasks = JSON.parse(tasksString);
          setTasks(parsedTasks.map((task: any) => ({
            ...task,
            createdAt: new Date(task.createdAt),
            dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
          })));
        }
      }
    };
    loadTasks();
  }, []);

  const { analyzeBottlenecks } = usePredictiveAnalytics();

  useEffect(() => {
    const generateAnalytics = async () => {
      if (tasks.length === 0) return;

      const puter = getPuter();
      const prompt = `Analyze the following task data and provide analytics in JSON format. Include completion rate, average completion time in hours, tasks by priority, tasks by category, and most productive hours. Here's the task data:
      ${JSON.stringify(tasks, null, 2)}`;

      try {
        const response = await puter.ai.chat(prompt);
        const analyticsData = JSON.parse(response);
        
        const bottleneckAnalysis = await analyzeBottlenecks(
          tasks.filter(t => t.completed),  // historical tasks
          tasks.filter(t => !t.completed)  // current tasks
        ).catch(() => undefined);
        
        setAnalytics({
          ...analyticsData,
          bottleneckAnalysis: bottleneckAnalysis ? {
            potentialBottlenecks: bottleneckAnalysis.potentialBottlenecks,
            workloadForecasts: bottleneckAnalysis.workloadForecasts
          } : undefined
        });
      } catch (error) {
        console.error('Failed to generate analytics:', error);
      }
    };

    generateAnalytics();
  }, [tasks]);

  return { analytics, tasks };
}