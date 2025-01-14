import { useState, useCallback } from 'react';
import { aiService } from '../lib/ai-service';

interface SchedulingSuggestion {
  suggestedStartTime: string;
  suggestedEndTime: string;
  priority: 'high' | 'medium' | 'low';
  conflictingTasks?: string[];
  rationale: string;
}

export function useAIScheduling() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSchedulingSuggestions = useCallback(async (
    taskDescription: string,
    existingSchedule: any[],
    preferences: any
  ) => {
    if (!taskDescription?.trim()) {
      throw new Error('Task description is required');
    }
    
    if (!Array.isArray(existingSchedule)) {
      throw new Error('Existing schedule must be an array');
    }
    
    if (!preferences || typeof preferences !== 'object') {
      throw new Error('Valid preferences object is required');
    }

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      await aiService.initialize();
      const prompt = `Suggest optimal scheduling for the following task:
      Task: ${taskDescription}
      Existing Schedule: ${JSON.stringify(existingSchedule)}
      User Preferences: ${JSON.stringify(preferences)}
      
      Consider:
      1. Task urgency and complexity
      2. Existing commitments
      3. User preferences and work patterns
      4. Potential scheduling conflicts
      5. Working hours and breaks
      6. Task dependencies
      7. Resource availability`;

      const response = await aiService.analyzeTask(prompt, { signal: controller.signal });
      
      if (response.status === 'error') {
        throw new Error(response.error || 'Unknown error occurred');
      }

      if (!response.content) {
        throw new Error('Empty response received from AI service');
      }

      return response.content;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get scheduling suggestions';
      setError(message);
      throw new Error(`Scheduling suggestion failed: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const optimizeSchedule = useCallback(async (
    tasks: any[],
    constraints: any
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      await aiService.initialize();
      const prompt = `Optimize the following schedule considering constraints:
      Tasks: ${JSON.stringify(tasks)}
      Constraints: ${JSON.stringify(constraints)}
      
      Provide:
      1. Optimized task sequence
      2. Time allocations
      3. Break suggestions
      4. Potential bottlenecks`;

      const response = await aiService.analyzeTask(prompt);
      
      if (response.status === 'error') {
        throw new Error(response.error);
      }

      return response.content;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to optimize schedule';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    getSchedulingSuggestions,
    optimizeSchedule,
    isLoading,
    error,
  };
}