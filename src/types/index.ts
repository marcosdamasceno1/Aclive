export type UserRole = 'admin' | 'manager' | 'professional' | 'financial';

export type ProfessionType =
  | 'editor_video'
  | 'designer'
  | 'social_media'
  | 'traffic_manager'
  | 'copywriter'
  | 'account_manager'
  | 'financial'
  | 'manager'
  | 'other';

export type TaskType =
  | 'video'
  | 'art'
  | 'copy'
  | 'traffic'
  | 'meeting'
  | 'planning'
  | 'editing'
  | 'review'
  | 'posting'
  | 'other';

export type KanbanStatus =
  | 'new'
  | 'briefing'
  | 'production'
  | 'review'
  | 'adjustments'
  | 'approved'
  | 'completed'
  | 'paid';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type ClientStatus = 'active' | 'inactive' | 'prospect';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  professionalId?: string;
  active?: boolean;
  permissions?: string[];
  createdAt: string;
}

export interface Professional {
  id: string;
  name: string;
  profession: ProfessionType;
  email: string;
  phone: string;
  pixKey: string;
  defaultValues: Partial<Record<TaskType, number>>;
  status: 'active' | 'inactive';
  createdAt: string;
  userId?: string;
}

export interface Client {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  plan: string;
  notes: string;
  status: ClientStatus;
  createdAt: string;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface Demand {
  id: string;
  clientId: string;
  title: string;
  description: string;
  taskType: TaskType;
  professionalId: string;
  deadline: string;
  priority: Priority;
  value: number;
  status: KanbanStatus;
  comments: Comment[];
  createdAt: string;
  completedAt?: string;
  financialRegistered: boolean;
  createdBy: string;
}

export interface FinancialMovement {
  id: string;
  professionalId: string;
  demandId: string;
  demandTitle: string;
  clientId: string;
  clientName: string;
  value: number;
  type: 'credit' | 'debit' | 'income' | 'expense';
  status: 'pending' | 'paid';
  completedAt: string;
  paidAt?: string;
  paidBy?: string;
  notes?: string;
  category?: string;
}

export type LeadStatus = 'new' | 'contacted' | 'proposal' | 'client' | 'lost';

export interface Lead {
  id: string;
  name: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  status: LeadStatus;
  notes?: string;
  source: 'apify' | 'manual';
  createdAt: string;
  convertedClientId?: string;
}

export interface AuditLog {
  id: string;
  entityType: 'demand' | 'financial' | 'professional' | 'client';
  entityId: string;
  action: string;
  oldValue?: string;
  newValue?: string;
  userId: string;
  userName: string;
  createdAt: string;
}
