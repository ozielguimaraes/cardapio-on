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
  position int not null default 0,
  created_at timestamptz not null default now()
);

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

-- Substitui o cardápio inteiro de forma atômica. Só executa se o usuário
-- logado for admin. Recebe o JSON no mesmo formato do app:
--   { "categorias": [ { "nome","tema","itens":[ {"nome","desc","preco"} ] } ] }
create or replace function public.replace_menu(p_menu jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cat jsonb;
  it jsonb;
  new_cat_id uuid;
  cat_pos int := 0;
  it_pos int;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  delete from public.categories;  -- cascade apaga os items

  for cat in select * from jsonb_array_elements(p_menu -> 'categorias')
  loop
    insert into public.categories (name, theme, position)
    values (cat ->> 'nome', coalesce(cat ->> 'tema', 'verde-escuro'), cat_pos)
    returning id into new_cat_id;

    cat_pos := cat_pos + 1;
    it_pos := 0;

    for it in select * from jsonb_array_elements(coalesce(cat -> 'itens', '[]'::jsonb))
    loop
      insert into public.items (category_id, name, description, price, position)
      values (
        new_cat_id,
        it ->> 'nome',
        coalesce(it ->> 'desc', ''),
        coalesce((it ->> 'preco')::numeric, 0),
        it_pos
      );
      it_pos := it_pos + 1;
    end loop;
  end loop;
end;
$$;

grant execute on function public.replace_menu(jsonb) to authenticated;

-- ---------- ALLOWLIST ----------
-- Troque pelo(s) e-mail(s) que poderão editar o cardápio:
insert into public.admins (email) values ('admin@cardapioon.com.br')
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
