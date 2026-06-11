-- ============================================================
-- CARDÁPIO ON — schema do Supabase
-- Cole TODO este arquivo no Supabase Studio > SQL Editor e rode.
-- Cria as tabelas, as políticas de acesso (RLS), as funções de
-- gravação/checagem e a semente inicial do cardápio.
-- ============================================================

-- ---------- TABELAS ----------

-- E-mails autorizados a editar o cardápio (allowlist do admin).
create table if not exists public.admins (
  email text primary key
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  theme text not null default 'verde-escuro',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(10, 2) not null default 0,
  sold_out boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Bancos criados antes do campo "esgotado": adiciona a coluna sem perder dados.
alter table public.items add column if not exists sold_out boolean not null default false;

-- ---------- RLS ----------
alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;

-- Cardápio é público para leitura (qualquer celular lê).
drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories for select using (true);

drop policy if exists "public read items" on public.items;
create policy "public read items" on public.items for select using (true);

-- A tabela admins não tem policy de leitura pública: ninguém a lê pelo client.
-- A escrita do cardápio acontece só pela função replace_menu (abaixo).

-- ---------- FUNÇÕES ----------

-- Retorna true se o usuário logado está na allowlist de admins.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where email = (auth.jwt() ->> 'email')
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- Converte texto em uuid; devolve null se não for um uuid válido (itens novos
-- vêm com id temporário tipo "item-xyz", que tratamos como inserção).
create or replace function public.try_uuid(t text)
returns uuid
language plpgsql
immutable
as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

-- Grava o cardápio inteiro de forma atômica, ATUALIZANDO PELO ID (não apaga e
-- recria). Itens/categorias que já existem mantêm seu id — então mudar um preço
-- durante o evento não esvazia o carrinho de quem está com a página aberta.
-- Só executa se o usuário logado for admin. JSON no formato do app:
--   { "categorias": [ { "id?","nome","tema","itens":[ {"id?","nome","desc","preco","esgotado?"} ] } ] }
create or replace function public.replace_menu(p_menu jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cat jsonb;
  it jsonb;
  v_cat_id uuid;
  v_item_id uuid;
  cat_pos int := 0;
  it_pos int;
  keep_cat_ids uuid[] := '{}';
  keep_item_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  for cat in select * from jsonb_array_elements(p_menu -> 'categorias')
  loop
    v_cat_id := public.try_uuid(cat ->> 'id');
    if v_cat_id is not null and exists (select 1 from public.categories where id = v_cat_id) then
      update public.categories
        set name = cat ->> 'nome',
            theme = coalesce(cat ->> 'tema', 'verde-escuro'),
            position = cat_pos
        where id = v_cat_id;
    else
      insert into public.categories (name, theme, position)
        values (cat ->> 'nome', coalesce(cat ->> 'tema', 'verde-escuro'), cat_pos)
        returning id into v_cat_id;
    end if;
    keep_cat_ids := keep_cat_ids || v_cat_id;

    it_pos := 0;
    keep_item_ids := '{}';
    for it in select * from jsonb_array_elements(coalesce(cat -> 'itens', '[]'::jsonb))
    loop
      v_item_id := public.try_uuid(it ->> 'id');
      if v_item_id is not null and exists (
        select 1 from public.items where id = v_item_id and category_id = v_cat_id
      ) then
        update public.items
          set name = it ->> 'nome',
              description = coalesce(it ->> 'desc', ''),
              price = coalesce((it ->> 'preco')::numeric, 0),
              sold_out = coalesce((it ->> 'esgotado')::boolean, false),
              position = it_pos
          where id = v_item_id;
      else
        insert into public.items (category_id, name, description, price, sold_out, position)
          values (v_cat_id, it ->> 'nome', coalesce(it ->> 'desc', ''),
                  coalesce((it ->> 'preco')::numeric, 0),
                  coalesce((it ->> 'esgotado')::boolean, false), it_pos)
          returning id into v_item_id;
      end if;
      keep_item_ids := keep_item_ids || v_item_id;
      it_pos := it_pos + 1;
    end loop;

    -- remove itens que saíram desta categoria
    delete from public.items where category_id = v_cat_id and not (id = any(keep_item_ids));

    cat_pos := cat_pos + 1;
  end loop;

  -- remove categorias que saíram do cardápio (cascata apaga seus itens)
  delete from public.categories where not (id = any(keep_cat_ids));
end;
$$;

grant execute on function public.replace_menu(jsonb) to authenticated;

-- ---------- PEDIDOS ----------

-- Contador central e atômico: garante número único, sem repetir entre celulares.
create sequence if not exists public.order_number_seq;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number int not null unique,
  customer_name text not null,
  customer_email text not null default '',
  customer_phone text not null default '',
  total numeric(10, 2) not null,
  status text not null default 'NOVO',
  created_at timestamptz not null default now()
);

-- Itens guardam um SNAPSHOT (nome e preço no momento do pedido), então editar o
-- cardápio depois não altera pedidos já feitos.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  name text not null,
  unit_price numeric(10, 2) not null,
  quantity int not null,
  subtotal numeric(10, 2) not null,
  position int not null default 0
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Pedidos não têm leitura pública; só o admin enxerga (para o caixa/relatórios).
-- A criação acontece pela função create_order (security definer), não por insert direto.
drop policy if exists "admin read orders" on public.orders;
create policy "admin read orders" on public.orders for select using (public.is_admin());

drop policy if exists "admin read order_items" on public.order_items;
create policy "admin read order_items" on public.order_items for select using (public.is_admin());

-- Cria um pedido e devolve o número único. Chamável pelo cliente (anon).
-- Payload: { nome, email, telefone, total, itens:[ {nome, preco, qty, sub} ] }
create or replace function public.create_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number int;
  v_order_id uuid;
  it jsonb;
  pos int := 0;
begin
  if coalesce(trim(p ->> 'nome'), '') = '' then
    raise exception 'nome obrigatório';
  end if;
  if jsonb_array_length(coalesce(p -> 'itens', '[]'::jsonb)) = 0 then
    raise exception 'pedido vazio';
  end if;

  v_number := nextval('public.order_number_seq');

  insert into public.orders (number, customer_name, customer_email, customer_phone, total)
    values (
      v_number,
      p ->> 'nome',
      coalesce(p ->> 'email', ''),
      coalesce(p ->> 'telefone', ''),
      coalesce((p ->> 'total')::numeric, 0)
    )
    returning id into v_order_id;

  for it in select * from jsonb_array_elements(p -> 'itens')
  loop
    insert into public.order_items (order_id, name, unit_price, quantity, subtotal, position)
      values (
        v_order_id,
        it ->> 'nome',
        coalesce((it ->> 'preco')::numeric, 0),
        coalesce((it ->> 'qty')::int, 1),
        coalesce((it ->> 'sub')::numeric, 0),
        pos
      );
    pos := pos + 1;
  end loop;

  return jsonb_build_object('number', v_number);
end;
$$;

grant execute on function public.create_order(jsonb) to anon, authenticated;

-- ---------- REALTIME ----------
-- Permite que o cardápio dos clientes atualize ao vivo quando o admin salva.
do $$
begin
  alter publication supabase_realtime add table public.categories;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;

-- ---------- ALLOWLIST ----------
-- Troque pelo(s) e-mail(s) que poderão editar o cardápio:
insert into public.admins (email) values ('microzapple@gmail.com')
on conflict (email) do nothing;

-- ---------- SEMENTE INICIAL ----------
-- Função de semente (reutilizável).
create or replace function public.seed_default_menu()
returns void
language plpgsql
set search_path = public
as $$
declare cid uuid;
begin
  insert into public.categories (name, theme, position) values ('Salgados', 'verde-escuro', 0) returning id into cid;
  insert into public.items (category_id, name, description, price, position) values
    (cid, 'Pão com pernil', '', 25.0, 0),
    (cid, 'Pastel self-service', 'Monte do seu jeito', 17.0, 1),
    (cid, 'Batata frita', 'Com bacon e cheddar', 15.5, 2),
    (cid, 'Salsichão', '', 8.0, 3),
    (cid, 'Coxinha', 'Frango', 8.0, 4),
    (cid, 'Cachorro quente self-service', 'Monte do seu jeito', 15.0, 5),
    (cid, 'Caldo 250ml', 'Frango', 8.0, 6),
    (cid, 'Caldo 500ml', 'Frango', 15.0, 7);

  insert into public.categories (name, theme, position) values ('Bebidas', 'laranja', 1) returning id into cid;
  insert into public.items (category_id, name, description, price, position) values
    (cid, 'Refrigerante 200ml', '', 3.0, 0),
    (cid, 'Suco 200ml', '', 3.5, 1),
    (cid, 'Água sem gás', '', 2.5, 2),
    (cid, 'Água com gás', '', 3.0, 3);

  insert into public.categories (name, theme, position) values ('Doces', 'verde-claro', 2) returning id into cid;
  insert into public.items (category_id, name, description, price, position) values
    (cid, 'Bala', '', 0.2, 0),
    (cid, 'Fruit-tella', '', 3.5, 1),
    (cid, 'Halls', '', 2.5, 2),
    (cid, 'Prestígio', '', 4.0, 3),
    (cid, 'Kit Kat', '', 4.5, 4),
    (cid, 'Trento', '', 3.5, 5),
    (cid, 'Trident', '', 3.0, 6),
    (cid, 'Mentos', '', 3.5, 7);
end;
$$;

-- Roda a semente apenas se ainda não houver categorias (não sobrescreve edições).
do $$
begin
  if not exists (select 1 from public.categories) then
    perform public.seed_default_menu();
  end if;
end $$;
