import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAPEIS_PERMITIDOS = new Set([
  "gestor", "operador", "tecnico", "comercial",
  "desenvolvimento", "diretoria", "compras",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ── 1. Verificar autenticação do solicitante ──────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Não autorizado" }, 401);
    }

    // Cliente com o token do usuário que está chamando (para verificar papel)
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return json({ error: "Token inválido" }, 401);
    }

    // Checar papel na tabela perfis
    const { data: perfilSolicitante } = await supabaseUser
      .from("perfis")
      .select("papel")
      .eq("id", user.id)
      .maybeSingle();

    if (!perfilSolicitante || !["gestor", "diretoria"].includes(perfilSolicitante.papel)) {
      return json({ error: "Acesso negado: apenas gestores podem criar usuários" }, 403);
    }

    // ── 2. Ler e validar o body ───────────────────────────────────────────
    const { email, senha, nome, papel, balanca } = await req.json();

    if (!email || !senha || !nome || !papel) {
      return json({ error: "Campos obrigatórios: email, senha, nome, papel" }, 400);
    }
    if (!PAPEIS_PERMITIDOS.has(papel)) {
      return json({ error: `Papel inválido: ${papel}` }, 400);
    }
    if (papel === "operador" && !balanca) {
      return json({ error: "Operador exige o campo balanca" }, 400);
    }

    // ── 3. Cliente com service_role (poder de admin) ──────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── 4. Criar usuário no Auth ──────────────────────────────────────────
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });

    if (authError) {
      // Mensagem amigável para email duplicado
      if (authError.message.toLowerCase().includes("already")) {
        return json({ error: "Este email já está cadastrado" }, 409);
      }
      return json({ error: authError.message }, 400);
    }

    const uid = authData.user.id;

    // ── 5. Criar perfil na tabela perfis ──────────────────────────────────
    const { error: perfilError } = await supabaseAdmin
      .from("perfis")
      .insert({
        id: uid,
        nome: nome.trim(),
        papel,
        balanca: papel === "operador" ? (balanca ?? null) : null,
      });

    if (perfilError) {
      // Perfil falhou — limpar o usuário do Auth para não ficar órfão
      await supabaseAdmin.auth.admin.deleteUser(uid);
      return json({ error: `Erro ao criar perfil: ${perfilError.message}` }, 500);
    }

    return json({ id: uid, email, nome, papel }, 201);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
