import { useState, useEffect } from 'react';
import { Task } from '../types/task';
import { loadTasksFromLocalStorage, saveTasksToLocalStorage } from '../utils/storage';

export const useTasks = () => {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasksFromLocalStorage());

  useEffect(() => {
    saveTasksToLocalStorage(tasks);
  }, [tasks]);

  const addTask = (task: Task) => {
    setTasks(prev => [...prev, task]);
  };

  const updateTask = (updatedTask: Task) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  };

  const deleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const reorderTasks = (reorderedTasks: Task[]) => {
    setTasks(reorderedTasks);
  };

  return {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    reorderTasks
  };
};