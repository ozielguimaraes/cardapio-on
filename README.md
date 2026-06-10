# Cardápio ON

Cardápio digital mobile para evento. O cliente abre pelo QR Code, monta a sacola
(com total somado) e mostra o número do pedido no caixa. **Não há pagamento online** —
o pagamento é feito no caixa.

O cardápio fica num **banco central (Supabase)**: o admin edita de qualquer celular ou
computador e **todos os celulares passam a ver os preços novos**. Front-end em React +
Vite, deploy na Vercel.

## Stack

- **Front:** React 18 + Vite (duas páginas: cliente em `/` e admin em `/admin/`)
- **Dados + Auth:** Supabase (Postgres + Auth com código OTP por e-mail)
- **Deploy:** Vercel (front estático) + Supabase (backend gerenciado)

## Estrutura

```
index.html                → entry do cliente
admin/index.html          → entry do admin
src/
  styles.css              → estilo do cliente
  admin-styles.css        → estilo do admin
  lib/
    supabase.js           → client do Supabase (lê env)
    menu.js               → loadMenu / saveMenu + cardápio padrão
    format.js             → formatação de preço/telefone
  customer/ main.jsx, App.jsx   → app do cliente
  admin/    main.jsx, Admin.jsx → login OTP + edição do cardápio
supabase/schema.sql       → tabelas, RLS, funções e semente (rodar no Supabase)
```

## Setup (uma vez)

### 1. Criar o projeto no Supabase
1. Crie um projeto em <https://supabase.com>.
2. Em **SQL Editor**, cole todo o `supabase/schema.sql` e rode. Isso cria as tabelas,
   as políticas de acesso, as funções e já popula o cardápio padrão.
3. Em **Project Settings → API**, copie a `Project URL` e a chave `anon public`.

### 2. Liberar seu e-mail de admin
No `schema.sql` há uma linha:
```sql
insert into public.admins (email) values ('admin@cardapioon.com.br') ...
```
Troque pelo seu e-mail (ou rode um `insert` na tabela `admins` com o e-mail desejado).
**Só e-mails dessa tabela conseguem salvar o cardápio.**

### 3. Configurar o envio do código (OTP de 6 dígitos)
O Supabase já envia e-mails de autenticação. Por padrão o template manda um **link**;
para mandar o **código de 6 dígitos** (que é o que a tela do admin pede):
- Vá em **Authentication → Email Templates → Magic Link** e garanta que o corpo do
  e-mail contém o token, por exemplo: `Seu código: {{ .Token }}`.

> Observação: o serviço de e-mail embutido do Supabase tem limite baixo de envios (bom
> para testes/uso leve). Para volume maior, configure um SMTP próprio em
> **Authentication → SMTP Settings**.

### 4. Variáveis de ambiente
```bash
cp .env.example .env
# edite .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

## Rodar localmente

```bash
npm install
npm run dev
```
- Cliente: <http://localhost:5173/>
- Admin: <http://localhost:5173/admin/>

Build de produção: `npm run build` (gera `dist/`); `npm run preview` para servir o build.

## Deploy na Vercel

1. Suba este repositório no GitHub e importe na Vercel (framework detectado: **Vite**).
2. Em **Settings → Environment Variables**, adicione `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`.
3. Deploy. O cliente fica em `https://SEU-APP.vercel.app/` e o admin em `/admin/`.
4. Defina os preços no admin **antes** de gerar o QR Code apontando para a URL.

## Como funciona

**Cliente** (sem login): navega por categorias (scroll-spy), `+`/`–` por item, barra
flutuante com total, e para gerar o pedido informa **nome, e-mail e telefone**
(validados). Ao gerar, o pedido é criado no servidor (`create_order`) e recebe um
**número único** vindo de uma sequence do Postgres (não repete entre celulares). A
confirmação mostra esse número + contato para o caixa.

**Atualização ao vivo:** o cardápio do cliente usa Supabase Realtime — quando o admin
salva uma alteração de preço, quem está com a página aberta vê o novo valor na hora
(sem recarregar). Editar preço durante o evento é seguro: a `replace_menu` atualiza pelo
id, então itens que já estavam na sacola do cliente permanecem (só o preço muda).

**Admin** (login OTP por e-mail, restrito à allowlist): edita nome, descrição e preço,
adiciona/remove itens e categorias, e salva. O salvamento grava no Supabase via a função
`replace_menu` (atômica, atualiza pelo id, protegida por `is_admin()`). A sessão dura
conforme a config do Supabase Auth.

**Pedidos** ficam salvos nas tabelas `orders` / `order_items` (com snapshot de nome e
preço do momento). Só o admin lê (RLS). Hoje a consulta é direta no banco
(Supabase Studio); uma tela de listagem de pedidos no admin é um próximo passo possível.

## Limitações conhecidas (escopo atual)

- **Sem tela de pedidos no admin** ainda: os pedidos são gravados e consultáveis no banco,
  mas não há UI de listagem/filtro/status. É o próximo passo natural se quiser.
- **Carrinho** fica no `localStorage` do aparelho do cliente (correto: é por pessoa). Se o
  admin **remover** um item enquanto alguém o tem na sacola, ele some da sacola desse
  cliente (mudança de preço, não — essa é preservada).
- **E-mail OTP** usa o serviço embutido do Supabase (limite baixo de envios). Para volume
  de admins maior, configure SMTP próprio no Supabase.

## Origem

Portado de um protótipo do Claude Design (claude.ai/design) e evoluído para usar Supabase.
