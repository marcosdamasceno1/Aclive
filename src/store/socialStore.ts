import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import { useAuthStore } from './authStore';
import type { SocialAccount, ScheduledPost } from '../types';

const getCompanyId = () => useAuthStore.getState().currentUser?.companyId ?? null;

interface SocialState {
  accounts: SocialAccount[];
  posts: ScheduledPost[];
  loading: boolean;
  setupNeeded: boolean;
  init: () => Promise<void>;
  addAccount: (a: Omit<SocialAccount, 'id' | 'createdAt'>) => Promise<void>;
  updateAccount: (id: string, updates: Partial<SocialAccount>) => void;
  deleteAccount: (id: string) => void;
  addPost: (p: Omit<ScheduledPost, 'id' | 'createdAt'>) => void;
  updatePost: (id: string, updates: Partial<ScheduledPost>) => void;
  deletePost: (id: string) => void;
  markNotified: (id: string) => void;
}

const toDbAccount = (obj: Record<string, unknown>): Record<string, unknown> => {
  const row = toDb(obj);
  for (const col of ['company_id']) {
    if (row[col] === '' || row[col] === undefined) row[col] = null;
  }
  return row;
};

const toDbPost = (obj: Record<string, unknown>): Record<string, unknown> => {
  const row = toDb(obj);
  if (row['image_url'] === '' || row['image_url'] === undefined) row['image_url'] = null;
  if (row['notify_phone'] === '' || row['notify_phone'] === undefined) row['notify_phone'] = null;
  if (row['notified_at'] === '' || row['notified_at'] === undefined) row['notified_at'] = null;
  if (row['company_id'] === '' || row['company_id'] === undefined) row['company_id'] = null;
  return row;
};

export const useSocialStore = create<SocialState>()((set, get) => ({
  accounts: [],
  posts: [],
  loading: false,
  setupNeeded: false,

  init: async () => {
    set({ loading: true, setupNeeded: false });
    const cid = getCompanyId();

    const accountsQ = supabase.from('social_accounts').select('*').order('created_at', { ascending: false });
    const { data: accountsData, error: accountsError } = await (cid ? accountsQ.eq('company_id', cid) : accountsQ);

    if (accountsError) {
      console.warn('[social.init accounts]', accountsError.message);
      set({ loading: false, setupNeeded: true });
      return;
    }

    const postsQ = supabase.from('scheduled_posts').select('*').order('scheduled_at', { ascending: true });
    const { data: postsData, error: postsError } = await (cid ? postsQ.eq('company_id', cid) : postsQ);

    if (postsError) {
      console.warn('[social.init posts]', postsError.message);
      set({ loading: false, setupNeeded: true });
      return;
    }

    set({
      accounts: (accountsData || []).map(r => fromDb<SocialAccount>(r as Record<string, unknown>)),
      posts: (postsData || []).map(r => fromDb<ScheduledPost>(r as Record<string, unknown>)),
      loading: false,
      setupNeeded: false,
    });
  },

  addAccount: async (data) => {
    const newAccount: SocialAccount = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    set(state => ({ accounts: [newAccount, ...state.accounts] }));
    const dbRow = toDbAccount({ ...newAccount } as Record<string, unknown>);
    const cid = getCompanyId();
    if (cid) dbRow.company_id = cid;
    const { error } = await supabase.from('social_accounts').insert(dbRow);
    if (error) {
      console.error('[social.addAccount]', error);
      set(state => ({ accounts: state.accounts.filter(a => a.id !== newAccount.id) }));
    }
  },

  updateAccount: (id, updates) => {
    set(state => ({ accounts: state.accounts.map(a => a.id === id ? { ...a, ...updates } : a) }));
    supabase
      .from('social_accounts')
      .update(toDbAccount(updates as Record<string, unknown>))
      .eq('id', id)
      .then(({ error }) => { if (error) console.error('[social.updateAccount]', error); });
  },

  deleteAccount: (id) => {
    set(state => ({ accounts: state.accounts.filter(a => a.id !== id) }));
    supabase
      .from('social_accounts')
      .delete()
      .eq('id', id)
      .then(({ error }) => { if (error) console.error('[social.deleteAccount]', error); });
  },

  addPost: (data) => {
    const newPost: ScheduledPost = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    set(state => ({ posts: [...state.posts, newPost].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)) }));
    const dbRow = toDbPost({ ...newPost } as Record<string, unknown>);
    const cid = getCompanyId();
    if (cid) dbRow.company_id = cid;
    supabase
      .from('scheduled_posts')
      .insert(dbRow)
      .then(({ error }) => {
        if (error) {
          console.error('[social.addPost]', error);
          set(state => ({ posts: state.posts.filter(p => p.id !== newPost.id) }));
        }
      });
  },

  updatePost: (id, updates) => {
    set(state => ({
      posts: state.posts
        .map(p => p.id === id ? { ...p, ...updates } : p)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    }));
    supabase
      .from('scheduled_posts')
      .update(toDbPost(updates as Record<string, unknown>))
      .eq('id', id)
      .then(({ error }) => { if (error) console.error('[social.updatePost]', error); });
  },

  deletePost: (id) => {
    set(state => ({ posts: state.posts.filter(p => p.id !== id) }));
    supabase
      .from('scheduled_posts')
      .delete()
      .eq('id', id)
      .then(({ error }) => { if (error) console.error('[social.deletePost]', error); });
  },

  markNotified: (id) => {
    const notifiedAt = new Date().toISOString();
    set(state => ({ posts: state.posts.map(p => p.id === id ? { ...p, notifiedAt } : p) }));
    supabase
      .from('scheduled_posts')
      .update({ notified_at: notifiedAt })
      .eq('id', id)
      .then(({ error }) => { if (error) console.error('[social.markNotified]', error); });
  },
}));
