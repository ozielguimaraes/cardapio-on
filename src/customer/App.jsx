/* ===== CARDÁPIO ON — app do cliente ===== */
import React, { useState, useEffect, useRef, useMemo } from "react";
import { fmt } from "../lib/format.js";
import { loadMenu } from "../lib/menu.js";

const CART_KEY = "cardapio_on_cart_v1";

function useMenu() {
  const [state, setState] = useState({ status: "loading", menu: null, error: "" });

  const reload = () => {
    loadMenu()
      .then((menu) => setState({ status: "ready", menu, error: "" }))
      .catch((e) => setState({ status: "error", menu: null, error: e.message || String(e) }));
  };

  useEffect(() => {
    reload();
    // recarrega ao voltar pra aba (pega edições recém-feitas no admin)
    const onFocus = () => reload();
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return state;
}

function App() {
  const { status, menu, error } = useMenu();
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (e) { return {}; }
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [activeCat, setActiveCat] = useState(null);
  const [bumpId, setBumpId] = useState(null);
  const sectionRefs = useRef({});

  const categorias = menu ? menu.categorias : [];

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (categorias.length && !activeCat) setActiveCat(categorias[0].id);
  }, [categorias, activeCat]);

  // mapa id -> {item, tema}
  const lookup = useMemo(() => {
    const m = {};
    categorias.forEach((c) =>
      c.itens.forEach((it) => (m[it.id] = { ...it, cat: c.id, tema: c.tema }))
    );
    return m;
  }, [menu]);

  const setQty = (id, qty) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  };
  const add = (id) => {
    setQty(id, (cart[id] || 0) + 1);
    setBumpId(id);
    setTimeout(() => setBumpId(null), 340);
  };

  const lines = Object.entries(cart)
    .filter(([id]) => lookup[id])
    .map(([id, qty]) => ({ ...lookup[id], qty, sub: lookup[id].preco * qty }));
  const totalItens = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.sub, 0);

  // scroll spy
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY + 140;
      let cur = categorias[0]?.id;
      categorias.forEach((c) => {
        const el = sectionRefs.current[c.id];
        if (el && el.offsetTop <= y) cur = c.id;
      });
      setActiveCat(cur);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [menu]);

  const goToCat = (id) => {
    const el = sectionRefs.current[id];
    if (el) window.scrollTo({ top: el.offsetTop - 118, behavior: "smooth" });
  };

  const finalizar = (contato) => {
    let n = 0;
    try { n = parseInt(localStorage.getItem("cardapio_on_counter") || "0", 10); } catch (e) {}
    n += 1;
    localStorage.setItem("cardapio_on_counter", String(n));
    try { localStorage.setItem("cardapio_on_customer", JSON.stringify(contato)); } catch (e) {}
    setConfirm({
      num: String(n).padStart(3, "0"),
      nome: contato.nome.trim(),
      email: contato.email.trim(),
      telefone: contato.telefone.trim(),
      lines: lines.map((l) => ({ nome: l.nome, qty: l.qty, sub: l.sub })),
      total,
    });
    setSheetOpen(false);
  };

  const novoPedido = () => {
    setCart({});
    setConfirm(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <React.Fragment>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">Cardápio</span>
          <span className="brand-on">ON</span>
        </div>
        <p className="brand-sub">Escolha tudo aqui e mostre no caixa 🍔</p>
      </header>

      {status === "ready" && categorias.length > 0 && (
        <nav className="nav">
          {categorias.map((c) => (
            <button
              key={c.id}
              className={"pill" + (activeCat === c.id ? " active" : "")}
              onClick={() => goToCat(c.id)}
            >
              {c.nome}
            </button>
          ))}
        </nav>
      )}

      <main className="menu">
        {status === "loading" && (
          <div className="state-msg"><span className="e-emoji">🍔</span>Carregando o cardápio…</div>
        )}
        {status === "error" && (
          <div className="state-msg">
            <span className="e-emoji">⚠️</span>
            Não foi possível carregar o cardápio.<br />{error}
          </div>
        )}
        {status === "ready" && categorias.length === 0 && (
          <div className="state-msg"><span className="e-emoji">🍽️</span>Cardápio ainda não configurado.</div>
        )}

        {categorias.map((c) => (
          <section
            key={c.id}
            id={"sec-" + c.id}
            className="section"
            ref={(el) => (sectionRefs.current[c.id] = el)}
          >
            <div className={"cat-head theme-" + c.tema}>
              <span className="blob"></span>
              <h2>{c.nome}</h2>
              <p>{c.itens.length} {c.itens.length === 1 ? "opção" : "opções"}</p>
            </div>
            <div className={"items theme-" + c.tema}>
              {c.itens.map((it) => {
                const qty = cart[it.id] || 0;
                return (
                  <div key={it.id} className={"item" + (bumpId === it.id ? " bump" : "")}>
                    <div className="item-info">
                      <div className="item-name">{it.nome}</div>
                      {it.desc ? <div className="item-desc">{it.desc}</div> : null}
                      <div className="item-price">{fmt(it.preco)}</div>
                    </div>
                    {qty === 0 ? (
                      <button className="add-btn" onClick={() => add(it.id)} aria-label={"Adicionar " + it.nome}>+</button>
                    ) : (
                      <div className="stepper">
                        <button onClick={() => setQty(it.id, qty - 1)} aria-label="Remover um">–</button>
                        <span className="count">{qty}</span>
                        <button onClick={() => add(it.id)} aria-label="Adicionar um">+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        <a className="admin-link" href="/admin/">⚙︎ Área administrativa</a>
      </main>

      <div className={"cart-bar" + (totalItens > 0 ? " show" : "")}>
        <button className="cart-bar-inner" onClick={() => setSheetOpen(true)}>
          <span className="cart-count">{totalItens}</span>
          <span className="cart-bar-label">
            <span className="l1">Seu pedido</span>
            <span className="l2">{fmt(total)}</span>
          </span>
          <span className="cart-bar-go">Ver pedido →</span>
        </button>
      </div>

      <CartSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        lines={lines}
        total={total}
        setQty={setQty}
        onFinalize={finalizar}
      />

      <ConfirmScreen data={confirm} onNew={novoPedido} />
    </React.Fragment>
  );
}

function CartSheet({ open, onClose, lines, total, setQty, onFinalize }) {
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem("cardapio_on_customer")) || {}; } catch (e) { return {}; }
  })();
  const [nome, setNome] = useState(saved.nome || "");
  const [email, setEmail] = useState(saved.email || "");
  const [telefone, setTelefone] = useState(saved.telefone || "");
  const [touched, setTouched] = useState(false);

  const nomeOk = nome.trim().length >= 2;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const telDigits = telefone.replace(/\D/g, "");
  const telOk = telDigits.length >= 10 && telDigits.length <= 11;
  const formOk = nomeOk && emailOk && telOk;

  const fmtTel = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  };

  const submit = () => {
    setTouched(true);
    if (formOk) onFinalize({ nome, email, telefone });
  };

  return (
    <div className={"overlay" + (open ? " show" : "")} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle"></div>
        <h3 className="sheet-title">Seu pedido</h3>
        {lines.length === 0 ? (
          <div className="empty-cart">
            <div className="e-emoji">🛒</div>
            <p>Seu carrinho está vazio.<br />Escolha algo gostoso!</p>
            <button className="btn-ghost" onClick={onClose}>Voltar ao cardápio</button>
          </div>
        ) : (
          <React.Fragment>
            {lines.map((l) => (
              <div key={l.id} className="cart-line">
                <div className="ci">
                  <div className="cn">{l.nome}</div>
                  <div className="cp">{fmt(l.preco)} cada</div>
                </div>
                <div className="mini-step">
                  <button onClick={() => setQty(l.id, l.qty - 1)}>–</button>
                  <span className="c">{l.qty}</span>
                  <button onClick={() => setQty(l.id, l.qty + 1)}>+</button>
                </div>
                <div className="csub">{fmt(l.sub)}</div>
              </div>
            ))}
            <div className="total-row">
              <span className="tl">Total</span>
              <span className="tv">{fmt(total)}</span>
            </div>
            <p className="form-intro">Preencha seus dados para gerar o pedido:</p>
            <div className="field">
              <label htmlFor="nome">Nome completo</label>
              <input
                id="nome"
                type="text"
                autoComplete="name"
                className={touched && !nomeOk ? "invalid" : ""}
                placeholder="Ex: João Silva"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
              {touched && !nomeOk ? <span className="field-err">Digite seu nome</span> : null}
            </div>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                className={touched && !emailOk ? "invalid" : ""}
                placeholder="voce@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {touched && !emailOk ? <span className="field-err">E-mail inválido</span> : null}
            </div>
            <div className="field">
              <label htmlFor="tel">Telefone (com DDD)</label>
              <input
                id="tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className={touched && !telOk ? "invalid" : ""}
                placeholder="(11) 99999-9999"
                value={telefone}
                onChange={(e) => setTelefone(fmtTel(e.target.value))}
              />
              {touched && !telOk ? <span className="field-err">Telefone inválido</span> : null}
            </div>
            <button className="btn-primary" onClick={submit}>
              Gerar pedido pro caixa
            </button>
            <button className="btn-ghost" onClick={onClose}>Continuar escolhendo</button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

function ConfirmScreen({ data, onNew }) {
  return (
    <div className={"confirm" + (data ? " show" : "")}>
      {data && (
        <React.Fragment>
          <div className="confirm-top">
            <div className="confirm-check">✓</div>
            <h2>Pedido pronto!</h2>
            <p>Vá até o caixa e mostre esta tela</p>
          </div>
          <div className="order-card">
            <div className="order-num-label">Pedido nº</div>
            <div className="order-num">#{data.num}</div>
            {data.nome ? <div className="order-name">{data.nome}</div> : null}
            {data.telefone || data.email ? (
              <div className="order-contact">{[data.telefone, data.email].filter(Boolean).join(" · ")}</div>
            ) : null}
            <div className="order-items">
              {data.lines.map((l, i) => (
                <div key={i} className="oi">
                  <span className="oq">{l.qty}×</span>
                  <span className="on">{l.nome}</span>
                  <span className="ov">{fmt(l.sub)}</span>
                </div>
              ))}
            </div>
            <div className="order-total">
              <span className="l">Total a pagar</span>
              <span className="v">{fmt(data.total)}</span>
            </div>
          </div>
          <p className="confirm-hint">💳 O pagamento é feito no caixa</p>
          <div className="confirm-actions">
            <button className="btn-orange" onClick={onNew}>Fazer novo pedido</button>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

export default App;
