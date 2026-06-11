/* ===== CARDÁPIO ON — app admin ===== */
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase.js";
import { loadMenu, saveMenu, DEFAULT_MENU } from "../lib/menu.js";
import { priceToStr, strToPrice } from "../lib/format.js";

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function uid() { return "item-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* Verifica no servidor se o e-mail logado está na allowlist (tabela admins). */
async function checkIsAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return !!data;
}

function Login({ onOk }) {
  const [step, setStep] = useState("email"); // email | code
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const sendCode = async () => {
    const e = email.trim().toLowerCase();
    if (!emailOk) { setErr("Digite um e-mail válido"); return; }
    setBusy(true);
    setErr("");
    // O Supabase envia o e-mail com o código de 6 dígitos. Só conseguirá entrar
    // de fato quem estiver na allowlist (verificado após a confirmação do código).
    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setStep("code");
    setCooldown(30);
  };

  const verify = async () => {
    const e = email.trim().toLowerCase();
    if (code.trim().length !== 6) { setErr("Digite os 6 dígitos"); return; }
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.verifyOtp({ email: e, token: code.trim(), type: "email" });
    if (error) { setBusy(false); setErr("Código incorreto ou expirado"); return; }
    const ok = await checkIsAdmin();
    setBusy(false);
    if (!ok) {
      await supabase.auth.signOut();
      setErr("Este e-mail não tem acesso ao painel.");
      return;
    }
    onOk();
  };

  return (
    <div className="gate">
      <div className="lock">🔒</div>
      <h1>Área administrativa</h1>
      {step === "email" ? (
        <React.Fragment>
          <p>Entre com o e-mail autorizado para receber um código de acesso.</p>
          <input
            type="email"
            inputMode="email"
            className="gate-email"
            value={email}
            autoFocus
            placeholder="seu@email.com"
            onChange={(e) => { setEmail(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && sendCode()}
          />
          <div className="err">{err}</div>
          <button onClick={sendCode} disabled={busy}>{busy ? "Enviando…" : "Enviar código"}</button>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <p>Código enviado para<br /><b>{email.trim().toLowerCase()}</b></p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            className="gate-code"
            value={code}
            autoFocus
            placeholder="000000"
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && verify()}
          />
          <div className="err">{err}</div>
          <button onClick={verify} disabled={busy}>{busy ? "Verificando…" : "Entrar"}</button>
          <button className="link-btn" disabled={cooldown > 0 || busy} onClick={sendCode}>
            {cooldown > 0 ? `Reenviar código em ${cooldown}s` : "Reenviar código"}
          </button>
          <button className="link-btn" onClick={() => { setStep("email"); setCode(""); setErr(""); }}>
            Trocar e-mail
          </button>
        </React.Fragment>
      )}
      <a className="back" href="/">← Voltar ao cardápio</a>
    </div>
  );
}

function Editor({ onLogout }) {
  const [draft, setDraft] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: "", err: false });
  const toastTimer = useRef(null);

  useEffect(() => {
    loadMenu()
      .then((menu) => setDraft(menu.categorias.length ? menu : clone(DEFAULT_MENU)))
      .catch((e) => setLoadErr(e.message || String(e)));
  }, []);

  const showToast = (msg, isErr = false) => {
    setToast({ msg, err: isErr });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast({ msg: "", err: false }), 2400);
  };

  const update = (fn) => {
    setDraft((prev) => { const next = clone(prev); fn(next); return next; });
    setDirty(true);
  };

  const editItem = (ci, ii, field, value) => update((d) => { d.categorias[ci].itens[ii][field] = value; });
  const editPrice = (ci, ii, value) => update((d) => { d.categorias[ci].itens[ii].preco = strToPrice(value); });
  const delItem = (ci, ii) => update((d) => { d.categorias[ci].itens.splice(ii, 1); });
  const addItem = (ci) => update((d) => { d.categorias[ci].itens.push({ id: uid(), nome: "Novo item", desc: "", preco: 0 }); });
  const editCat = (ci, value) => update((d) => { d.categorias[ci].nome = value; });
  const delCat = (ci) => {
    if (!confirm("Remover esta categoria inteira e todos os seus itens?")) return;
    update((d) => { d.categorias.splice(ci, 1); });
  };
  const addCat = () => {
    const temas = ["verde-escuro", "laranja", "verde-claro"];
    update((d) => {
      d.categorias.push({
        id: "cat-" + Date.now().toString(36),
        nome: "Nova categoria",
        tema: temas[d.categorias.length % 3],
        itens: [],
      });
    });
  };

  const save = async () => {
    const cleaned = clone(draft);
    cleaned.categorias.forEach((c) => { c.itens = c.itens.filter((it) => it.nome && it.nome.trim()); });
    setSaving(true);
    try {
      await saveMenu(cleaned);
      setDraft(cleaned);
      setDirty(false);
      showToast("✓ Cardápio salvo!");
    } catch (e) {
      showToast("Erro ao salvar: " + (e.message || e), true);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm("Restaurar o cardápio para os preços originais? Suas alterações serão perdidas.")) return;
    setSaving(true);
    try {
      await saveMenu(DEFAULT_MENU);
      const menu = await loadMenu();
      setDraft(menu);
      setDirty(false);
      showToast("Cardápio restaurado ao original");
    } catch (e) {
      showToast("Erro ao restaurar: " + (e.message || e), true);
    } finally {
      setSaving(false);
    }
  };

  // avisa antes de sair com alterações não salvas
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  return (
    <React.Fragment>
      <header className="a-header">
        <span className="a-brand">Cardápio</span>
        <span className="a-tag">ON</span>
        <span className="a-title">Admin</span>
        <button className="a-logout" onClick={onLogout}>Sair</button>
      </header>

      <div className="a-body">
        <div className="a-note">
          <b>Como funciona:</b> tudo que você salvar aqui fica guardado <b>no servidor</b> e
          passa a aparecer <b>para todos os celulares</b> que abrirem o cardápio. As alterações
          valem na hora (o cardápio recarrega ao ser reaberto). Defina os preços <b>antes</b> de
          gerar o QR Code do evento.
        </div>

        {loadErr && <div className="a-note" style={{ background: "#fbe9e7", borderColor: "#f5c6cb", color: "#a02012" }}>Erro ao carregar: {loadErr}</div>}
        {!draft && !loadErr && <div className="a-loading">Carregando cardápio…</div>}

        {draft && draft.categorias.map((c, ci) => (
          <div className="cat-block" key={c.id}>
            <div className="cat-top">
              <span className={"cat-dot dot-" + c.tema}></span>
              <input className="cat-name-input" value={c.nome} onChange={(e) => editCat(ci, e.target.value)} />
              <button className="cat-del" onClick={() => delCat(ci)}>Remover</button>
            </div>

            {c.itens.map((it, ii) => (
              <div className="a-item" key={it.id}>
                <div className="names">
                  <input className="in-nome" value={it.nome} placeholder="Nome do item" onChange={(e) => editItem(ci, ii, "nome", e.target.value)} />
                  <input className="in-desc" value={it.desc || ""} placeholder="Descrição (opcional)" onChange={(e) => editItem(ci, ii, "desc", e.target.value)} />
                  <button
                    className={"soldout-toggle" + (it.esgotado ? " on" : "")}
                    onClick={() => editItem(ci, ii, "esgotado", !it.esgotado)}
                  >
                    {it.esgotado ? "✕ Esgotado" : "Marcar esgotado"}
                  </button>
                </div>
                <div className="price-wrap">
                  <span className="rs">R$</span>
                  <input
                    inputMode="decimal"
                    defaultValue={priceToStr(it.preco)}
                    key={it.id + "-" + it.preco}
                    onBlur={(e) => { editPrice(ci, ii, e.target.value); e.target.value = priceToStr(strToPrice(e.target.value)); }}
                    onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                  />
                </div>
                <button className="item-del" onClick={() => delItem(ci, ii)} aria-label="Remover item">🗑</button>
              </div>
            ))}

            <button className="add-item-btn" onClick={() => addItem(ci)}>+ Adicionar item em {c.nome || "categoria"}</button>
          </div>
        ))}

        {draft && <button className="add-cat-btn" onClick={addCat}>+ Adicionar nova categoria</button>}
      </div>

      {draft && (
        <div className="a-savebar">
          <button className="btn-reset" onClick={reset} disabled={saving}>Restaurar original</button>
          <button className={"btn-save" + (dirty ? "" : " saved")} onClick={save} disabled={!dirty || saving}>
            {saving ? "Salvando…" : dirty ? "Salvar alterações" : "Tudo salvo ✓"}
          </button>
        </div>
      )}

      <div className={"toast" + (toast.msg ? " show" : "") + (toast.err ? " err" : "")}>{toast.msg}</div>
    </React.Fragment>
  );
}

function Admin() {
  const [phase, setPhase] = useState("checking"); // checking | out | in

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { if (mounted) setPhase("out"); return; }
      const ok = await checkIsAdmin();
      if (!ok) await supabase.auth.signOut();
      if (mounted) setPhase(ok ? "in" : "out");
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session && mounted) setPhase("out");
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const logout = async () => { await supabase.auth.signOut(); setPhase("out"); };

  if (phase === "checking") return <div className="a-loading">Carregando…</div>;
  if (phase === "out") return <Login onOk={() => setPhase("in")} />;
  return <Editor onLogout={logout} />;
}

export default Admin;
