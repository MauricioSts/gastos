// Camada de API isolada. Hoje devolve dados mockados; para plugar o backend
// real basta trocar USAR_MOCK para false e definir BASE_URL / TOKEN.
const BASE_URL = ""; // ex: import.meta.env.VITE_API_URL
const TOKEN = "";
const USAR_MOCK = true;

async function req(rota, opts = {}) {
  const r = await fetch(BASE_URL + rota, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-API-Token": TOKEN, ...(opts.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.erro || "Falha na requisição"), { status: r.status, body });
  return body;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- estado mockado (espelha o modelo do backend) ----------
const db = {
  hoje: { dia: 14, dias_no_mes: 31, mes: "2026-08" },
  rendas: [{ id: 1, mes_referencia: "2026-08", descricao: "Salário", valor: 1700 }],
  contas_fixas: [
    { id: 1, descricao: "Internet", valor: 99, dia_vencimento: 10, categoria: "contas", ativa: 1 },
    { id: 2, descricao: "Luz", valor: 86, dia_vencimento: 18, categoria: "contas", ativa: 1 },
  ],
  parcelamentos: [
    { id: 1, descricao: "Celular", valor_parcela: 180, total_parcelas: 12, parcela_inicial: 9, mes_inicio: "2026-08", categoria: "compras" },
  ],
  gastos: [
    { id: 7, valor: 38.0, categoria: "alimentacao", descricao: "Almoço no Tonico", data_gasto: "2026-08-14T13:12" },
    { id: 6, valor: 21.9, categoria: "transporte", descricao: "Uber p/ escritório", data_gasto: "2026-08-14T08:41" },
    { id: 5, valor: 34.9, categoria: "assinaturas", descricao: "Spotify", data_gasto: "2026-08-13T09:00" },
    { id: 4, valor: 112.4, categoria: "compras", descricao: "Feira da Vila", data_gasto: "2026-08-13T18:20" },
    { id: 3, valor: 64.2, categoria: "transporte", descricao: "Gasolina", data_gasto: "2026-08-12T07:55" },
    { id: 2, valor: 45.0, categoria: "alimentacao", descricao: "Mercado da esquina", data_gasto: "2026-08-11T19:30" },
    { id: 1, valor: 96.0, categoria: "lazer", descricao: "Cinema + jantar", data_gasto: "2026-08-09T21:10" },
  ],
  proximoId: 8,
};

// Quantas parcelas incidem no mês pedido — calculado sob demanda, nunca gravado.
function parcelaNoMes(p, mes) {
  const dif = difMeses(p.mes_inicio, mes);
  const atual = p.parcela_inicial + dif;
  if (dif < 0 || atual > p.total_parcelas) return null;
  return { ...p, parcela_atual: atual, mes_fim: somaMes(p.mes_inicio, p.total_parcelas - p.parcela_inicial) };
}
function difMeses(a, b) {
  const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}
export function somaMes(mes, n) {
  const [y, m] = mes.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const nomeMes = (mes) => `${MESES[Number(mes.split("-")[1]) - 1]}/${mes.split("-")[0]}`;

function compromissosDoMes(mes) {
  const fixas = db.contas_fixas.filter((c) => c.ativa).map((c) => ({ ...c, tipo: "conta_fixa" }));
  const parcelas = db.parcelamentos.map((p) => parcelaNoMes(p, mes)).filter(Boolean).map((p) => ({ ...p, tipo: "parcelamento", valor: p.valor_parcela }));
  return { fixas, parcelas };
}

// ---------- rotas ----------
export async function getSaldo(mes = db.hoje.mes) {
  if (!USAR_MOCK) return req(`/api/saldo?mes=${mes}`);
  await espera(180);
  const renda_total = db.rendas.filter((r) => r.mes_referencia === mes).reduce((s, r) => s + r.valor, 0);
  const { fixas, parcelas } = compromissosDoMes(mes);
  const comprometido_contas_fixas = fixas.reduce((s, c) => s + c.valor, 0);
  const comprometido_parcelas = parcelas.reduce((s, p) => s + p.valor, 0);
  const comprometido_total = comprometido_contas_fixas + comprometido_parcelas;
  const gasto_livre = db.gastos.filter((g) => g.data_gasto.startsWith(mes)).reduce((s, g) => s + g.valor, 0);
  const disponivel = renda_total - comprometido_total - gasto_livre;
  const dias_restantes = Math.max(1, db.hoje.dias_no_mes - db.hoje.dia + 1);
  return {
    renda_total, comprometido_total, comprometido_contas_fixas, comprometido_parcelas,
    gasto_livre, disponivel,
    percentual_consumido: renda_total ? ((comprometido_total + gasto_livre) / renda_total) * 100 : 0,
    dias_restantes, ritmo_diario: disponivel / dias_restantes,
    renda_definida: renda_total > 0,
  };
}

export async function getGastos(mes = db.hoje.mes) {
  if (!USAR_MOCK) return req(`/api/gastos?mes=${mes}&limite=100`);
  await espera(140);
  return db.gastos.filter((g) => g.data_gasto.startsWith(mes));
}

export async function getResumo(mes = db.hoje.mes) {
  if (!USAR_MOCK) return req(`/api/resumo?mes=${mes}`);
  await espera(160);
  const gastos = db.gastos.filter((g) => g.data_gasto.startsWith(mes));
  const total = gastos.reduce((s, g) => s + g.valor, 0);
  const { fixas, parcelas } = compromissosDoMes(mes);
  const mapa = {};
  gastos.forEach((g) => { mapa[g.categoria] = mapa[g.categoria] || { categoria: g.categoria, livre: 0, comprometido: 0 }; mapa[g.categoria].livre += g.valor; });
  [...fixas, ...parcelas].forEach((c) => { mapa[c.categoria] = mapa[c.categoria] || { categoria: c.categoria, livre: 0, comprometido: 0 }; mapa[c.categoria].comprometido += c.valor; });
  const por_categoria = Object.values(mapa).map((c) => ({ ...c, total: c.livre + c.comprometido })).sort((a, b) => b.total - a.total);
  const totalGeral = por_categoria.reduce((s, c) => s + c.total, 0);
  por_categoria.forEach((c) => (c.percentual = totalGeral ? (c.total / totalGeral) * 100 : 0));
  return { por_categoria, total, media_diaria: total / db.hoje.dia };
}

export async function getCompromissos(mes = db.hoje.mes) {
  if (!USAR_MOCK) return req(`/api/compromissos?mes=${mes}`);
  await espera(120);
  return compromissosDoMes(mes);
}

export async function getProjecao(meses = 6) {
  if (!USAR_MOCK) return req(`/api/projecao?meses=${meses}`);
  await espera(150);
  const renda = db.rendas[0] ? db.rendas[0].valor : 0;
  return Array.from({ length: meses }, (_, i) => {
    const mes = somaMes(db.hoje.mes, i);
    const { fixas, parcelas } = compromissosDoMes(mes);
    const anterior = compromissosDoMes(somaMes(db.hoje.mes, i - 1));
    const comprometido = [...fixas, ...parcelas].reduce((s, c) => s + (c.valor || c.valor_parcela), 0);
    const termina = anterior.parcelas.filter((p) => !parcelas.some((q) => q.id === p.id));
    return { mes, comprometido, renda, sobra: renda - comprometido, termina: termina.map((t) => t.descricao) };
  });
}

// Interpretação da mensagem. No mock, heurística; no real, o LLM do backend.
export async function postGasto(mensagem) {
  if (!USAR_MOCK) return req("/api/gastos", { method: "POST", body: JSON.stringify({ mensagem }) });
  await espera(1500);
  const m = mensagem.toLowerCase();
  const num = (m.match(/(\d+[.,]?\d*)/g) || []).map((n) => parseFloat(n.replace(",", ".")));
  if (!num.length) { const e = new Error("Não identifiquei um valor nessa mensagem."); e.status = 422; throw e; }

  // A fraseologia decide, não a magnitude: "6x de 90" é parcela; "2160 em 12x" é total.
  const porParcela = m.match(/(\d+)\s*(?:x|vezes)\s*(?:de\s*)?(?:r\$\s*)?(\d+[.,]?\d*)/);
  const porTotal = m.match(/(?:r\$\s*)?(\d+[.,]?\d*)\s*(?:reais|conto|pila)?\s*(?:em|dividido em|parcelado em)\s*(\d+)\s*(?:x|vezes)/);
  const soVezes = m.match(/(\d+)\s*(?:x|vezes)/);
  if (porParcela || porTotal || soVezes) {
    let total_parcelas, valor_parcela;
    if (porParcela) {
      total_parcelas = parseInt(porParcela[1], 10);
      valor_parcela = parseFloat(porParcela[2].replace(",", "."));
    } else if (porTotal) {
      total_parcelas = parseInt(porTotal[2], 10);
      valor_parcela = parseFloat(porTotal[1].replace(",", ".")) / total_parcelas;
    } else {
      total_parcelas = parseInt(soVezes[1], 10);
      const bruto = num.find((n) => n !== total_parcelas) || 0;
      valor_parcela = bruto / total_parcelas;
    }
    return { requer_confirmacao: true, tipo: "parcelamento",
      sugestao: { descricao: limpaDescricao(mensagem), valor_parcela, total_parcelas, parcela_inicial: 1, mes_inicio: db.hoje.mes, categoria: adivinhaCategoria(m) } };
  }
  if (/todo m[êe]s|mensal|assinatura fixa|todos os meses/.test(m)) {
    return { requer_confirmacao: true, tipo: "conta_fixa",
      sugestao: { descricao: limpaDescricao(mensagem), valor: num[0], dia_vencimento: db.hoje.dia, categoria: adivinhaCategoria(m) } };
  }

  const gasto = { id: db.proximoId++, valor: num[0], categoria: adivinhaCategoria(m), descricao: limpaDescricao(mensagem), data_gasto: `2026-08-${String(db.hoje.dia).padStart(2, "0")}T12:00` };
  db.gastos.unshift(gasto);
  const saldo = await getSaldo();
  return { gasto, ...saldo, tipo: "gasto_avulso" };
}

export async function confirmarCompromisso(tipo, dados) {
  if (!USAR_MOCK) return req(tipo === "parcelamento" ? "/api/parcelamentos" : "/api/contas-fixas", { method: "POST", body: JSON.stringify(dados) });
  await espera(300);
  if (tipo === "parcelamento") db.parcelamentos.push({ id: Date.now(), ...dados });
  else db.contas_fixas.push({ id: Date.now(), ativa: 1, ...dados });
  return getSaldo();
}

export async function removerGasto(id) {
  if (!USAR_MOCK) return req(`/api/gastos/${id}`, { method: "DELETE" });
  await espera(120);
  db.gastos = db.gastos.filter((g) => g.id !== id);
  return getSaldo();
}

export async function editarGasto(id, campos) {
  if (!USAR_MOCK) return req(`/api/gastos/${id}`, { method: "PATCH", body: JSON.stringify(campos) });
  await espera(120);
  const g = db.gastos.find((x) => x.id === id);
  if (g) Object.assign(g, campos);
  return getSaldo();
}

export async function definirRenda(valor, mes = db.hoje.mes) {
  if (!USAR_MOCK) return req("/api/rendas", { method: "POST", body: JSON.stringify({ mes_referencia: mes, descricao: "Renda", valor }) });
  await espera(200);
  db.rendas = [{ id: 1, mes_referencia: mes, descricao: "Renda", valor }];
  return getSaldo(mes);
}

export async function limparRenda() { db.rendas = []; return getSaldo(); }

export async function health() {
  if (!USAR_MOCK) return req("/api/health");
  await espera(400);
  return { ok: true, modo: "mock", latencia_ms: 400 };
}

export function csv() {
  const linhas = [["data", "valor", "categoria", "descricao"], ...db.gastos.map((g) => [g.data_gasto, g.valor, g.categoria, g.descricao])];
  return linhas.map((l) => l.join(",")).join("\n");
}

const CATS = {
  alimentacao: ["almoço", "almoco", "jantar", "café", "cafe", "lanche", "mercado", "feira", "restaurante", "padaria", "pizza"],
  transporte: ["uber", "99", "ônibus", "onibus", "metrô", "metro", "gasolina", "combustível", "táxi", "taxi", "estacionamento"],
  lazer: ["cinema", "bar", "show", "viagem", "jogo", "netflix"],
  saude: ["farmácia", "farmacia", "remédio", "remedio", "médico", "medico", "dentista", "academia"],
  compras: ["roupa", "tênis", "tenis", "celular", "notebook", "amazon", "shopping"],
  contas: ["luz", "água", "agua", "internet", "aluguel", "condomínio", "gás", "telefone"],
  assinaturas: ["spotify", "assinatura", "plano", "icloud"],
  educacao: ["curso", "livro", "faculdade", "escola"],
};
function adivinhaCategoria(m) {
  for (const [cat, termos] of Object.entries(CATS)) if (termos.some((t) => m.includes(t))) return cat;
  return "outros";
}
// Ordem importa: primeiro os tokens numéricos/parcelas, depois as preposições soltas.
function limpaDescricao(msg) {
  let s = String(msg);
  s = s.replace(/\d+\s*(?:x|vezes)\s*(?:de\s*)?(?:r\$\s*)?\d+[.,]?\d*/gi, " ");
  s = s.replace(/(?:r\$\s*)?\d+[.,]?\d*\s*(?:reais|conto|pila)?\s*(?:em|dividido em|parcelado em)\s*\d+\s*(?:x|vezes)/gi, " ");
  s = s.replace(/r\$\s*\d+[.,]?\d*/gi, " ");
  s = s.replace(/\d+[.,]?\d*\s*(?:reais|real|conto|pila|paus)?/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  const inicio = /^(gastei|paguei|pago|comprei|torrei|foi|no|na|em|de|do|da|com|um|uma|meu|minha|pra|para|todo|todos|os|mês|mes)\s+/i;
  const fim = /\s+(de|em|no|na|do|da|com|por|e)$/i;
  while (inicio.test(s)) s = s.replace(inicio, "");
  while (fim.test(s)) s = s.replace(fim, "");
  s = s.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Gasto";
}
export const ROTULO_CAT = { alimentacao: "Alimentação", transporte: "Transporte", lazer: "Lazer", saude: "Saúde", compras: "Compras", contas: "Contas", assinaturas: "Assinaturas", educacao: "Educação", outros: "Outros" };
export const LISTA_CAT = Object.keys(ROTULO_CAT);
export const hoje = db.hoje;
