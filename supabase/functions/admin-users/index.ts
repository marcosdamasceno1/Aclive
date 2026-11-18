// admin-users — gestão de usuários (listar, criar, editar, excluir).
//
// SEGURANÇA:
// - Quem chama é identificado pelo JWT, validado no servidor (getUser).
// - Agência, papel e super admin vêm do app_metadata, que só este servidor
//   grava — nunca do user_metadata, que o próprio usuário consegue alterar.
// - Administrador de agência só enxerga e altera usuários da própria agência.
//   Só o super admin cria usuários em qualquer agência. Ninguém vira super
//   admin por aqui (isso é feito direto no banco, pelo dono do sistema).
// - O perfil em user_profiles é gravado aqui; o navegador não grava mais.
// Pode manter "Verify JWT" ligado ou desligado: a checagem é feita no código.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const respond = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ROLES = ['admin', 'manager', 'professional', 'financial'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type AuthUser = {
  id: string;
  email?: string;
  created_at?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

const claims = (u: AuthUser) => {
  const a = u.app_metadata ?? {};
  return {
    companyId: typeof a.company_id === 'string' ? a.company_id : '',
    role: typeof a.role === 'string' ? a.role : '',
    isSuper: a.super_admin === true,
  };
};

// Só o que a tela precisa: nada de identidades, provedores ou hashes.
const publicUser = (u: AuthUser) => {
  const c = claims(u);
  const a = u.app_metadata ?? {};
  return {
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    user_metadata: { name: u.user_metadata?.name ?? '' },
    app_metadata: {
      company_id: c.companyId || null,
      role: c.role || null,
      super_admin: c.isSuper,
      professional_id: a.professional_id ?? null,
      permissions: a.permissions ?? null,
    },
  };
};

const cleanPermissions = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter(p => typeof p === 'string' && p.length <= 40).slice(0, 30) : undefined;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);

  try {
    // ── Quem está chamando ──────────────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return respond({ error: 'unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user: caller }, error: callerErr } = await userClient.auth.getUser(token);
    if (callerErr || !caller) return respond({ error: 'unauthorized' }, 401);
    const me = claims(caller as AuthUser);
    if (!me.isSuper && !(me.role === 'admin' && me.companyId)) return respond({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? '');

    // Alvo de edição/exclusão: precisa ser da mesma agência (exceto super admin).
    const loadTarget = async (id: unknown): Promise<AuthUser | null> => {
      if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
      const { data } = await admin.auth.admin.getUserById(id);
      const target = data?.user as AuthUser | undefined;
      if (!target) return null;
      const t = claims(target);
      if (t.isSuper && !me.isSuper) return null;
      if (!me.isSuper && t.companyId !== me.companyId) return null;
      return target;
    };

    // ── Listar ──────────────────────────────────────────────────────────────
    if (action === 'list') {
      const all: AuthUser[] = [];
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return respond({ error: error.message }, 500);
        all.push(...(data.users as AuthUser[]));
        if (data.users.length < 1000) break;
      }
      const visible = me.isSuper ? all : all.filter(u => claims(u).companyId === me.companyId);
      return respond({ users: visible.map(publicUser) });
    }

    // ── Criar ───────────────────────────────────────────────────────────────
    if (action === 'create') {
      const companyId = me.isSuper ? String(body.companyId ?? '') : me.companyId;
      if (!UUID_RE.test(companyId)) return respond({ error: 'Agência inválida.' }, 400);
      const role = String(body.role ?? '');
      if (!ROLES.includes(role)) return respond({ error: 'Papel inválido.' }, 400);
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const name = String(body.name ?? '').trim().slice(0, 120);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return respond({ error: 'E-mail inválido.' }, 400);
      if (password.length < 8) return respond({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
      if (!name) return respond({ error: 'Informe o nome.' }, 400);

      const { data: company } = await admin.from('companies').select('id').eq('id', companyId).maybeSingle();
      if (!company) return respond({ error: 'Agência não encontrada.' }, 400);

      const permissions = role === 'admin' ? undefined : (cleanPermissions(body.permissions) ?? []);
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
        app_metadata: { company_id: companyId, role, ...(permissions ? { permissions } : {}) },
      });
      if (error || !data.user) return respond({ error: error?.message ?? 'Falha ao criar usuário.' }, 400);

      const { error: profileErr } = await admin.from('user_profiles').insert({
        id: data.user.id, company_id: companyId, name, email, role,
        permissions: permissions ?? null, active: true, created_at: data.user.created_at,
      });
      if (profileErr) console.error('[admin-users.create.profile]', profileErr.message);
      return respond({ user: publicUser(data.user as AuthUser) });
    }

    // ── Editar ──────────────────────────────────────────────────────────────
    if (action === 'update') {
      const target = await loadTarget(body.id);
      if (!target) return respond({ error: 'Usuário não encontrado.' }, 404);
      const t = claims(target);
      const appMeta: Record<string, unknown> = { ...(target.app_metadata ?? {}) };
      const userMeta: Record<string, unknown> = { ...(target.user_metadata ?? {}) };
      // Chaves antigas de autorização no user_metadata não valem mais nada: remove.
      for (const k of ['company_id', 'role', 'super_admin', 'permissions', 'professionalId']) delete userMeta[k];
      const profile: Record<string, unknown> = {};

      if (body.name !== undefined) {
        const name = String(body.name).trim().slice(0, 120);
        if (!name) return respond({ error: 'Informe o nome.' }, 400);
        userMeta.name = name; profile.name = name;
      }
      if (body.role !== undefined) {
        const role = String(body.role);
        if (!ROLES.includes(role)) return respond({ error: 'Papel inválido.' }, 400);
        if (target.id === caller.id && role !== 'admin' && !me.isSuper) {
          return respond({ error: 'Você não pode remover o próprio acesso de administrador.' }, 400);
        }
        appMeta.role = role; profile.role = role;
        if (role === 'admin') { delete appMeta.permissions; profile.permissions = null; }
      }
      if (body.permissions !== undefined && (appMeta.role ?? t.role) !== 'admin') {
        const permissions = cleanPermissions(body.permissions) ?? [];
        appMeta.permissions = permissions; profile.permissions = permissions;
      }
      if (body.professionalId !== undefined) {
        const pid = body.professionalId === null ? null : String(body.professionalId);
        if (pid !== null) {
          if (!UUID_RE.test(pid)) return respond({ error: 'Profissional inválido.' }, 400);
          const { data: prof } = await admin.from('professionals').select('id')
            .eq('id', pid).eq('company_id', t.companyId).maybeSingle();
          if (!prof) return respond({ error: 'Profissional não pertence a esta agência.' }, 400);
        }
        appMeta.professional_id = pid; profile.professional_id = pid;
      }

      const params: Record<string, unknown> = { app_metadata: appMeta, user_metadata: userMeta };
      if (body.password !== undefined && body.password !== '') {
        const password = String(body.password);
        if (password.length < 8) return respond({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
        params.password = password;
      }
      const { error } = await admin.auth.admin.updateUserById(target.id, params);
      if (error) return respond({ error: error.message }, 400);

      if (Object.keys(profile).length > 0) {
        const { error: profileErr } = await admin.from('user_profiles').update(profile).eq('id', target.id);
        if (profileErr) console.error('[admin-users.update.profile]', profileErr.message);
      }
      return respond({ ok: true });
    }

    // ── Excluir ─────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const target = await loadTarget(body.id);
      if (!target) return respond({ error: 'Usuário não encontrado.' }, 404);
      if (target.id === caller.id) return respond({ error: 'Você não pode excluir a própria conta.' }, 400);
      const { error } = await admin.auth.admin.deleteUser(target.id);
      if (error) return respond({ error: error.message }, 400);
      await admin.from('user_profiles').delete().eq('id', target.id);
      return respond({ ok: true });
    }

    return respond({ error: 'unknown_action' }, 400);
  } catch (e) {
    console.error('[admin-users]', e);
    return respond({ error: 'server_error' }, 500);
  }
});
