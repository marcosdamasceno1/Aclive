import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { action, ...body } = await req.json()

    if (action === 'list') {
      const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      return respond({ users: data?.users ?? [], error })
    }

    if (action === 'create') {
      const { data, error } = await adminClient.auth.admin.createUser(body)
      return respond({ user: data?.user ?? null, error })
    }

    if (action === 'update') {
      const { id, ...params } = body
      const { error } = await adminClient.auth.admin.updateUserById(id, params)
      return respond({ error })
    }

    if (action === 'delete') {
      const { id } = body
      const { error } = await adminClient.auth.admin.deleteUser(id)
      return respond({ error })
    }

    return respond({ error: 'Unknown action' }, 400)
  } catch (e) {
    return respond({ error: String(e) }, 500)
  }
})
