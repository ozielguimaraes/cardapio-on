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
(validados). A confirmação mostra **número do pedido + contato** para o caixa.

**Admin** (login OTP por e-mail, restrito à allowlist): edita nome, descrição e preço,
adiciona/remove itens e categorias, e salva. O salvamento grava no Supabase via a função
`replace_menu` (atômica e protegida por `is_admin()`). A sessão dura conforme a config do
Supabase Auth.

## Limitações conhecidas (escopo atual)

- **Número do pedido** é um contador **local de cada navegador** — não é único entre
  aparelhos. Para o caixa, o nome + itens identificam o pedido. Numeração global exigiria
  persistir pedidos no banco (fora do escopo desta etapa).
- **Carrinho** fica no `localStorage` do aparelho do cliente (correto: é por pessoa). Se o
  admin reorganizar o cardápio enquanto alguém está montando a sacola, itens removidos
  somem da sacola. Por isso: ajuste os preços **antes** do evento.

## Origem

Portado de um protótipo do Claude Design (claude.ai/design) e evoluído para usar Supabase.
