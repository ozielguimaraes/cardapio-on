import { supabase } from "./supabase.js";

/* Cardápio padrão — usado pelo botão "Restaurar original" do admin e como
   semente inicial (supabase/schema.sql insere os mesmos dados). */
export const DEFAULT_MENU = {
  categorias: [
    {
      nome: "Salgados",
      tema: "verde-escuro",
      itens: [
        { nome: "Pão com pernil", desc: "", preco: 25.0 },
        { nome: "Pastel self-service", desc: "Monte do seu jeito", preco: 17.0 },
        { nome: "Batata frita", desc: "Com bacon e cheddar", preco: 15.5 },
        { nome: "Salsichão", desc: "", preco: 8.0 },
        { nome: "Coxinha", desc: "Frango", preco: 8.0 },
        { nome: "Cachorro quente self-service", desc: "Monte do seu jeito", preco: 15.0 },
        { nome: "Caldo 250ml", desc: "Frango", preco: 8.0 },
        { nome: "Caldo 500ml", desc: "Frango", preco: 15.0 },
      ],
    },
    {
      nome: "Bebidas",
      tema: "laranja",
      itens: [
        { nome: "Refrigerante 200ml", desc: "", preco: 3.0 },
        { nome: "Suco 200ml", desc: "", preco: 3.5 },
        { nome: "Água sem gás", desc: "", preco: 2.5 },
        { nome: "Água com gás", desc: "", preco: 3.0 },
      ],
    },
    {
      nome: "Doces",
      tema: "verde-claro",
      itens: [
        { nome: "Bala", desc: "", preco: 0.2 },
        { nome: "Fruit-tella", desc: "", preco: 3.5 },
        { nome: "Halls", desc: "", preco: 2.5 },
        { nome: "Prestígio", desc: "", preco: 4.0 },
        { nome: "Kit Kat", desc: "", preco: 4.5 },
        { nome: "Trento", desc: "", preco: 3.5 },
        { nome: "Trident", desc: "", preco: 3.0 },
        { nome: "Mentos", desc: "", preco: 3.5 },
      ],
    },
  ],
};

/* Lê o cardápio do Supabase e mapeia para a forma que os componentes esperam
   (nome/desc/preco/tema/itens). */
export async function loadMenu() {
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,theme,position,items(id,name,description,price,position)")
    .order("position", { ascending: true })
    .order("position", { referencedTable: "items", ascending: true });

  if (error) throw error;

  return {
    categorias: (data || []).map((c) => ({
      id: c.id,
      nome: c.name,
      tema: c.theme,
      itens: (c.items || []).map((it) => ({
        id: it.id,
        nome: it.name,
        desc: it.description || "",
        preco: Number(it.price),
      })),
    })),
  };
}

/* Grava o cardápio inteiro de forma atômica (a RPC atualiza pelo id, preservando
   itens existentes), validando se o usuário logado está na allowlist de admins. */
export async function saveMenu(menu) {
  const { error } = await supabase.rpc("replace_menu", { p_menu: menu });
  if (error) throw error;
}

/* Cria o pedido no servidor e devolve o número único.
   payload: { nome, email, telefone, total, itens:[ {nome, preco, qty, sub} ] } */
export async function createOrder(payload) {
  const { data, error } = await supabase.rpc("create_order", { p: payload });
  if (error) throw error;
  return data; // { number }
}
