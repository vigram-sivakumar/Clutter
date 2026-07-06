import { Task } from '../models/Tasks';

export const tasks: Task[] = [
  // Today
  {
    id: 'task-1',
    title: 'Review design system',
    dueDate: '2026-07-06',
    isCompleted: false,
  },
  {
    id: 'task-2',
    title: 'Reply to client emails',
    dueDate: '2026-07-06',
    isCompleted: true,
  },

  // Overdue
  {
    id: 'task-3',
    title: 'Finalize onboarding flow',
    dueDate: '2026-07-05',
    isCompleted: false,
  },
  {
    id: 'task-4',
    title: 'Update project roadmap',
    dueDate: '2026-07-04',
    isCompleted: false,
  },
  {
    id: 'task-5',
    title: 'Prepare sprint retrospective',
    dueDate: '2026-07-04',
    isCompleted: false,
  },

  // Upcoming
  {
    id: 'task-6',
    title: 'Create wireframes',
    dueDate: '2026-07-08',
    isCompleted: false,
  },
  {
    id: 'task-7',
    title: 'Research competitors',
    dueDate: '2026-07-08',
    isCompleted: false,
  },
  {
    id: 'task-8',
    title: 'Write documentation',
    dueDate: '2026-07-10',
    isCompleted: false,
  },
  {
    id: 'task-9',
    title: 'Plan next sprint',
    dueDate: '2026-07-15',
    isCompleted: false,
  },

  // Completed
  {
    id: 'task-10',
    title: 'Fix sidebar layout',
    dueDate: '2026-07-03',
    isCompleted: true,
  },
  {
    id: 'task-11',
    title: 'Clean up CSS variables',
    dueDate: '2026-07-02',
    isCompleted: true,
  },
  {
    id: 'task-12',
    title: 'Publish design guidelines',
    dueDate: '2026-07-02',
    isCompleted: true,
  },
];
