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

export type KanbanStatus = string;

export interface KanbanStage {
  id: string;
  label: string;
  icon: string;
  color: string;
  triggersFinancial?: boolean;
  isTerminal?: boolean;
}

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
  companyId?: string;
  isSuperAdmin?: boolean;
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
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  status: LeadStatus;
  notes?: string;
  source: 'apify' | 'manual' | 'meta' | 'website';
  createdAt: string;
  convertedClientId?: string;
}

// Cartão do quadro de Demandas (gargalos) — quadro colaborativo, visível a
// todos os profissionais da agência. Independente da Esteira de Produção.
export interface DemandCard {
  id: string;
  columnId: string;         // id da coluna/etapa personalizável
  title: string;
  description?: string;
  assignedTo?: string;      // professional id (responsável, opcional)
  priority: Priority;
  createdBy: string;        // user id de quem criou
  createdByName: string;
  createdAt: string;
}

// Atendimento WhatsApp (inbox)
export interface WaChat {
  id: string;
  chatKey: string;           // telefone só dígitos
  name?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastDirection?: 'in' | 'out';
  lastInboundAt?: string;    // controla a janela de 24h da Meta
  unreadCount: number;
  createdAt: string;
}

export interface WaMessage {
  id: string;
  chatKey: string;
  direction: 'in' | 'out';
  body?: string;
  msgType: string;           // text | other
  status: string;            // received | sending | sent | delivered | read | error
  provider?: 'waha' | 'meta';
  providerMessageId?: string;
  sentAt: string;
  createdAt?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string;           // 'YYYY-MM-DD'
  endDate?: string;       // 'YYYY-MM-DD'
  color: string;          // 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'pink'
  createdBy: string;
  createdByName: string;
  assignedTo: string;     // 'all' | user_id
  assignedToName: string;
  priority: Priority;
  createdAt: string;
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

export interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  plan: string;
  active: boolean;
  createdAt: string;
  apifyMonthlyLimit?: number | null; // null/undefined = usa o padrão do backend
}

export interface SocialAccount {
  id: string;
  companyId?: string;
  username: string;
  platform: 'instagram';
  avatarColor: string; // tailwind color name like 'pink', 'purple', 'blue'
  active: boolean;
  createdAt: string;
}

export type PostStatus = 'scheduled' | 'published' | 'cancelled';

export interface ScheduledPost {
  id: string;
  companyId?: string;
  accountId: string;
  caption: string;
  hashtags: string;
  imageUrl?: string;
  scheduledAt: string; // ISO datetime string
  status: PostStatus;
  notifyWhatsapp: boolean;
  notifyPhone?: string;
  notifiedAt?: string;
  createdBy: string;
  createdAt: string;
}
