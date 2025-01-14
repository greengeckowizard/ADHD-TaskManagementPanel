import { useEffect, useState } from 'react';
import { Task } from '../components/TaskPanel';
import { useWorkPatternAnalyzer } from './useWorkPatternAnalyzer';

export interface ScheduledBlock {
  taskId: string;
  startDate: Date;
  endDate: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  productivityScore?: number;
}

interface ScheduleConflict {
  taskIds: string[];
  reason: string;
  suggestion: string;
}

export interface UserWorkPatterns {
  preferredTimes: { [hour: number]: number }; // Hour -> productivity score
  taskDurations: { [taskId: string]: number }; // Average duration for similar tasks
  completionRates: { [hour: number]: number }; // Success rate by hour
  breakPatterns: { [hour: number]: boolean }; // Preferred break times
}

export const useSchedulingEngine = (tasks: Task[]) => {
  const [scheduledBlocks, setScheduledBlocks] = useState<ScheduledBlock[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [workPatterns, setWorkPatterns] = useState<UserWorkPatterns>({
    preferredTimes: {},
    taskDurations: {},
    completionRates: {},
    breakPatterns: {}
  });
  
  const { analyzeWorkPatterns, suggestTimeSlot } = useWorkPatternAnalyzer();
  
  // Update work patterns whenever tasks or scheduled blocks change
  useEffect(() => {
    const completedTasks = tasks.filter(t => t.completed);
    const patterns = analyzeWorkPatterns(completedTasks, scheduledBlocks);
    setWorkPatterns(patterns);
    
    // Update conflicts whenever scheduled blocks change
    const newConflicts = detectConflicts(scheduledBlocks);
    setConflicts(newConflicts);
  }, [tasks, scheduledBlocks]);

  const detectConflicts = (blocks: ScheduledBlock[]): ScheduleConflict[] => {
    const newConflicts: ScheduleConflict[] = [];
    
    // Check for overlapping time blocks
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const block1 = blocks[i];
        const block2 = blocks[j];
        
        if (block1.startDate < block2.endDate && block2.startDate < block1.endDate) {
          newConflicts.push({
            taskIds: [block1.taskId, block2.taskId],
            reason: 'Time block overlap detected',
            suggestion: 'Consider rescheduling one of these tasks to a different time slot'
          });
        }
      }
    }

    // Check for overloaded days (more than 8 hours of work)
    const workloadByDay = new Map<string, number>();
    blocks.forEach(block => {
      const dateKey = block.startDate.toISOString().split('T')[0];
      const hours = (block.endDate.getTime() - block.startDate.getTime()) / (1000 * 60 * 60);
      
      // Calculate cognitive load factor based on task characteristics
      const task = tasks.find(t => t.id === block.taskId);
      const cognitiveLoadFactor = task?.priority === 'high' ? 1.5 : 
                               task?.priority === 'medium' ? 1.2 : 1;
      
      const adjustedHours = hours * cognitiveLoadFactor;
      workloadByDay.set(dateKey, (workloadByDay.get(dateKey) || 0) + adjustedHours);
    });

    workloadByDay.forEach((hours, date) => {
      if (hours > 8) {
        const overloadedTasks = blocks
          .filter(block => block.startDate.toISOString().split('T')[0] === date)
          .map(block => block.taskId);
        newConflicts.push({
          taskIds: overloadedTasks,
          reason: `Workload exceeds 8 hours on ${date}`,
          suggestion: "Consider spreading these tasks across multiple days"
        });
      }
    });

    return newConflicts;
  };

  const autoScheduleTask = async (task: Task): Promise<ScheduledBlock | null> => {
    const suggestion = suggestTimeSlot(task, workPatterns, scheduledBlocks);
    
    if (suggestion) {
      const newBlock: ScheduledBlock = {
        taskId: String(task.id),
        startDate: suggestion.startDate,
        endDate: suggestion.endDate,
        estimatedDuration: workPatterns.taskDurations[task.id]
      };
      
      // Check for conflicts before adding
      const potentialConflicts = detectConflicts([...scheduledBlocks, newBlock]);
      if (potentialConflicts.length === 0) {
        setScheduledBlocks(prev => [...prev, newBlock]);
        return newBlock;
      }
    }
    
    return null;
  };

  return {
    detectConflicts,
    autoScheduleTask,
    scheduledBlocks,
    conflicts,
    workPatterns
  };
};