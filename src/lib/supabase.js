import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Falha cedo e com mensagem clara: sem essas variáveis o app não tem de onde ler o cardápio.
  throw new Error(
    "Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (.env). Veja o README."
  );
}

export const supabase = createClient(url, anonKey);
