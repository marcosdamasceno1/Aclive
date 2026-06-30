import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb, toDb } from '../lib/dbMapper';
import { getCompanyId, companyRow, companyUpdate, companyDelete, assertCompanyData } from '../lib/companyIsolation';
import type { SocialAccount, ScheduledPost } from '../types';

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
  if (row['company_id'] === '' || row['company_id'] === undefined) delete row['company_id'];
  return row;
};

const toDbPost = (obj: Record<string, unknown>): Record<string, unknown> => {
  const row = toDb(obj);
  if (row['image_url'] === '' || row['image_url'] === undefined) row['image_url'] = null;
  if (row['notify_phone'] === '' || row['notify_phone'] === undefined) row['notify_phone'] = null;
  if (row['notified_at'] === '' || row['notified_at'] === undefined) row['notified_at'] = null;
  if (row['company_id'] === '' || row['company_id'] === undefined) delete row['company_id'];
  return row;
};

export const useSocialStore = create<SocialState>()((set, get) => ({
  accounts: [],
  posts: [],
  loading: false,
  setupNeeded: false,

  init: async () => {
    const cid = getCompanyId();
    if (!cid) { set({ accounts: [], posts: [], loading: false, setupNeeded: false }); return; }
    set({ loading: true, setupNeeded: false });

    const { data: accountsData, error: accountsError } = await supabase
      .from('social_accounts').select('*').order('created_at', { ascending: false }).eq('company_id', cid);

    if (accountsError) {
      console.warn('[social.init accounts]', accountsError.message);
      set({ loading: false, setupNeeded: true });
      return;
    }

    const { data: postsData, error: postsError } = await supabase
      .from('scheduled_posts').select('*').order('scheduled_at', { ascending: true }).eq('company_id', cid);

    if (postsError) {
      console.warn('[social.init posts]', postsError.message);
      set({ loading: false, setupNeeded: true });
      return;
    }

    const accounts = (accountsData || []).map(r => fromDb<SocialAccount>(r as Record<string, unknown>));
    const posts = (postsData || []).map(r => fromDb<ScheduledPost>(r as Record<string, unknown>));
    set({
      accounts: assertCompanyData(accounts, cid, 'social_accounts'),
      posts: assertCompanyData(posts, cid, 'scheduled_posts'),
      loading: false,
      setupNeeded: false,
    });
  },

  addAccount: async (data) => {
    const cid = getCompanyId();
    if (!cid) return;
    const newAccount: SocialAccount = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    set(state => ({ accounts: [newAccount, ...state.accounts] }));
    const { error } = await supabase.from('social_accounts').insert(
      companyRow(toDbAccount({ ...newAccount } as Record<string, unknown>), cid)
    );
    if (error) {
      console.error('[social.addAccount]', error);
      set(state => ({ accounts: state.accounts.filter(a => a.id !== newAccount.id) }));
    }
  },

  updateAccount: (id, updates) => {
    const cid = getCompanyId();
    set(state => ({ accounts: state.accounts.map(a => a.id === id ? { ...a, ...updates } : a) }));
    companyUpdate('social_accounts', id, toDbAccount(updates as Record<string, unknown>), cid ?? '')
      .then(({ error }) => { if (error) console.error('[social.updateAccount]', error); });
  },

  deleteAccount: (id) => {
    const cid = getCompanyId();
    set(state => ({ accounts: state.accounts.filter(a => a.id !== id) }));
    companyDelete('social_accounts', id, cid ?? '')
      .then(({ error }) => { if (error) console.error('[social.deleteAccount]', error); });
  },

  addPost: (data) => {
    const cid = getCompanyId();
    if (!cid) return;
    const newPost: ScheduledPost = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    set(state => ({ posts: [...state.posts, newPost].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)) }));
    supabase.from('scheduled_posts').insert(
      companyRow(toDbPost({ ...newPost } as Record<string, unknown>), cid)
    ).then(({ error }) => {
      if (error) {
        console.error('[social.addPost]', error);
        set(state => ({ posts: state.posts.filter(p => p.id !== newPost.id) }));
      }
    });
  },

  updatePost: (id, updates) => {
    const cid = getCompanyId();
    set(state => ({
      posts: state.posts
        .map(p => p.id === id ? { ...p, ...updates } : p)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    }));
    companyUpdate('scheduled_posts', id, toDbPost(updates as Record<string, unknown>), cid ?? '')
      .then(({ error }) => { if (error) console.error('[social.updatePost]', error); });
  },

  deletePost: (id) => {
    const cid = getCompanyId();
    set(state => ({ posts: state.posts.filter(p => p.id !== id) }));
    companyDelete('scheduled_posts', id, cid ?? '')
      .then(({ error }) => { if (error) console.error('[social.deletePost]', error); });
  },

  markNotified: (id) => {
    const cid = getCompanyId();
    const notifiedAt = new Date().toISOString();
    set(state => ({ posts: state.posts.map(p => p.id === id ? { ...p, notifiedAt } : p) }));
    companyUpdate('scheduled_posts', id, { notified_at: notifiedAt }, cid ?? '')
      .then(({ error }) => { if (error) console.error('[social.markNotified]', error); });
  },
}));
