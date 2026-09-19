// Camada de API isolada. Nenhum componente fala com fetch diretamente.
//
// `USAR_MOCK` troca entre os dados de demonstração e o backend real sem que
// nenhuma tela precise mudar. O mock reproduz exatamente o estado das imagens
// de referência (renda 1.700, Internet 99, Luz 86, Celular 12x de 180 na
// parcela 9), então o app roda de pé antes de existir servidor.
//
// O backend devolve alguns campos com nomes diferentes dos que as telas usam
// (`categorias`/`contas_fixas`/`parcelamentos` em vez de
// `por_categoria`/`fixas`/`parcelas`). A tradução acontece toda aqui dentro,
// nas funções `normaliza*` — é justamente para isso que esta camada existe.

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';

const BASE_URL = import.meta.env.VITE_API_URL || '';
export const USAR_MOCK = import.meta.env.VITE_USAR_MOCK !== 'false';

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------
// O app não carrega mais token no bundle: tudo que é VITE_* fica visível para
// qualquer um que abra o DevTools. Quem entra é quem sabe usuário e senha, e o
// token de sessão que o backend devolve fica só neste navegador.
const CHAVE_SESSAO = 'minimau:sessao';

function lerSessao() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null');
    if (!s?.token || new Date(s.expira_em).getTime() <= Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export const temSessao = () => USAR_MOCK || !!lerSessao();
const tokenSessao = () => lerSessao()?.token || '';

// POST sem sessão: só as rotas de login usam.
async function postPublico(rota, dados) {
  let r;
  try {
    r = await fetch(`${BASE_URL}${rota}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });
  } catch (e) {
    throw Object.assign(new Error('Não consegui falar com o servidor.'), { status: 0, causa: e });
  }
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(corpo.erro || 'Falha no login.'), { status: r.status });
  return corpo;
}

function guardaSessao(corpo) {
  try {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(corpo));
  } catch {
    throw new Error('Este navegador não deixa guardar o login (modo privado?).');
  }
}

export async function login(usuario, senha) {
  guardaSessao(await postPublico('/api/login', { usuario, senha }));
}

// ---------------------------------------------------------------------------
// Face ID (passkey)
// ---------------------------------------------------------------------------
// A passkey mora no chaveiro do aparelho (e no iCloud); o servidor só guarda a
// chave pública. `minimau:passkey` lembra que este aparelho já tem uma, para a
// tela de login oferecer o Face ID primeiro e não insistir no convite.
const CHAVE_PASSKEY = 'minimau:passkey';

export const suportaFaceId = () => !USAR_MOCK && browserSupportsWebAuthn();

export function temFaceId() {
  try { return localStorage.getItem(CHAVE_PASSKEY) === '1'; } catch { return false; }
}

function marcaFaceId(tem) {
  try {
    if (tem) localStorage.setItem(CHAVE_PASSKEY, '1');
    else localStorage.removeItem(CHAVE_PASSKEY);
  } catch { /* só perde o atalho na tela de login */ }
}

// Traduz as recusas do navegador. Cancelar o Face ID não é erro: volta null.
function erroFaceId(e) {
  if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') return null;
  if (e?.name === 'InvalidStateError') return new Error('Este aparelho já tem Face ID cadastrado.');
  return e?.status !== undefined ? e : new Error(e?.message || 'O Face ID falhou.');
}

export async function loginFaceId() {
  const opcoes = await postPublico('/api/login/passkey/opcoes', {});
  let resposta;
  try {
    resposta = await startAuthentication({ optionsJSON: opcoes });
  } catch (e) {
    const erro = erroFaceId(e);
    if (erro) throw erro;
    return false;
  }
  try {
    guardaSessao(await postPublico('/api/login/passkey', resposta));
  } catch (e) {
    if (e.status === 401) marcaFaceId(false);
    throw e;
  }
  marcaFaceId(true);
  return true;
}

// Cadastra o Face ID deste aparelho. Exige sessão aberta. Volta false se a
// pessoa cancelou.
export async function ativarFaceId(nome) {
  const opcoes = await req('/api/passkeys/opcoes', { method: 'POST', body: '{}' });
  let resposta;
  try {
    resposta = await startRegistration({ optionsJSON: opcoes });
  } catch (e) {
    const erro = erroFaceId(e);
    if (erro?.message.startsWith('Este aparelho já')) marcaFaceId(true);
    if (erro) throw erro;
    return false;
  }
  await req('/api/passkeys', { method: 'POST', body: JSON.stringify({ resposta, nome }) });
  marcaFaceId(true);
  return true;
}

export async function getPasskeys() {
  return USAR_MOCK ? [] : req('/api/passkeys');
}

export async function removerPasskey(id) {
  await req(`/api/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Nome para reconhecer o aparelho na lista de Ajustes.
export function nomeDoAparelho() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Aparelho';
}

// Sai e apaga o retrato do último boot: ele tem saldo e gastos, e não pode
// ficar para quem pegar o aparelho depois.
export function logout() {
  try { localStorage.removeItem(CHAVE_SESSAO); } catch { /* nada a fazer */ }
  limparSnapshot();
  window.dispatchEvent(new Event('minimau:sair'));
}

// 401 com sessão = sessão expirada ou senha trocada no servidor.
function checaSessao(status) {
  if (status === 401 && !USAR_MOCK) logout();
}

const TZ = 'America/Sao_Paulo';

// ---------------------------------------------------------------------------
// Utilidades de mês e data
// ---------------------------------------------------------------------------

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const nomeMes = (mes) => `${MESES[Number(mes.split('-')[1]) - 1]}/${mes.split('-')[0]}`;

// Soma n meses (n pode ser negativo) a um mês YYYY-MM.
export function somaMes(mes, n) {
  const [ano, mm] = mes.split('-').map(Number);
  const indice = ano * 12 + (mm - 1) + n;
  const anoFinal = Math.floor(indice / 12);
  return `${anoFinal}-${String(indice - anoFinal * 12 + 1).padStart(2, '0')}`;
}

function difMeses(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

// Data de hoje no fuso do app, não no fuso do navegador.
function hojeLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function diasNoMes(mes) {
  const [ano, mm] = mes.split('-').map(Number);
  return new Date(Date.UTC(ano, mm, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------
// Ciclo da fatura
// ---------------------------------------------------------------------------
// O período de referência do app não é o mês do calendário: ele vai do dia
// seguinte ao fechamento do cartão até o fechamento seguinte. Quem manda nos
// dias é o backend (`GET /api/ciclo`); os valores abaixo só existem para o
// modo de demonstração e como último recurso se a chamada falhar.
export const CICLO_PADRAO = { dia_fechamento: 28, dia_recebimento: 30, dia_pagamento: 5 };

const diaDoMes = (mes, dia) => `${mes}-${String(Math.min(dia, diasNoMes(mes))).padStart(2, '0')}`;

function somaDias(data, n) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + n)).toISOString().slice(0, 10);
}

// Espelha `src/utils/ciclo.js` do backend. Só roda no mock.
function janelaLocal(ciclo, cfg = CICLO_PADRAO) {
  const anterior = somaMes(ciclo, -1);
  const inicio = somaDias(diaDoMes(anterior, cfg.dia_fechamento), 1);
  const mesRenda = cfg.dia_recebimento > cfg.dia_fechamento ? anterior : ciclo;
  const recebimento = diaDoMes(mesRenda, cfg.dia_recebimento);
  return {
    ciclo,
    inicio,
    fim: diaDoMes(ciclo, cfg.dia_fechamento),
    data_recebimento: recebimento < inicio ? inicio : recebimento,
    vencimento_fatura: diaDoMes(somaMes(ciclo, 1), cfg.dia_pagamento),
  };
}

function cicloLocal(data, cfg = CICLO_PADRAO) {
  const mes = data.slice(0, 7);
  const dia = Number(data.slice(8, 10));
  return dia <= Math.min(cfg.dia_fechamento, diasNoMes(mes)) ? mes : somaMes(mes, 1);
}

// "2026-08-29" -> "29/08". As telas nunca mostram data ISO.
export const dataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

async function req(rota, opts = {}) {
  let r;
  try {
    r = await fetch(BASE_URL + rota, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSessao()}`, ...(opts.headers || {}) },
    });
  } catch (e) {
    throw Object.assign(new Error('Não consegui falar com o servidor.'), { status: 0, causa: e });
  }
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    checaSessao(r.status);
    throw Object.assign(new Error(corpo.erro || 'Falha na requisição'), { status: r.status, corpo });
  }
  return corpo;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Estado mockado — espelha o modelo do backend e o conteúdo das imagens
// ---------------------------------------------------------------------------

const db = {
  hoje: { dia: 14, dias_no_mes: 31, mes: '2026-08' },
  rendas: [{ id: 1, mes_referencia: '2026-08', descricao: 'Salário', valor: 1700 }],
  contas_fixas: [
    { id: 1, descricao: 'Internet', valor: 99, dia_vencimento: 10, categoria: 'contas', ativa: 1 },
    { id: 2, descricao: 'Luz', valor: 86, dia_vencimento: 18, categoria: 'contas', ativa: 1 },
  ],
  parcelamentos: [
    { id: 1, descricao: 'Celular', valor_parcela: 180, total_parcelas: 12, parcela_inicial: 9, mes_inicio: '2026-08', categoria: 'compras' },
  ],
  gastos: [
    { id: 7, valor: 38.0, categoria: 'alimentacao', descricao: 'Almoço no Tonico', data_gasto: '2026-08-14T13:12' },
    { id: 6, valor: 21.9, categoria: 'transporte', descricao: 'Uber p/ escritório', data_gasto: '2026-08-14T08:41' },
    { id: 5, valor: 34.9, categoria: 'assinaturas', descricao: 'Spotify', data_gasto: '2026-08-13T09:00' },
    { id: 4, valor: 112.4, categoria: 'compras', descricao: 'Feira da Vila', data_gasto: '2026-08-13T18:20' },
    { id: 3, valor: 64.2, categoria: 'transporte', descricao: 'Gasolina', data_gasto: '2026-08-12T07:55' },
    { id: 2, valor: 45.0, categoria: 'alimentacao', descricao: 'Mercado da esquina', data_gasto: '2026-08-11T19:30' },
    { id: 1, valor: 96.0, categoria: 'lazer', descricao: 'Cinema + jantar', data_gasto: '2026-08-09T21:10' },
  ],
  proximoId: 8,
};

// Dia de referência: fixo no mock (para bater com as imagens), real no backend.
export const hoje = USAR_MOCK
  ? db.hoje
  : (() => {
      const d = hojeLocal();
      const mes = d.slice(0, 7);
      return { dia: Number(d.slice(8, 10)), dias_no_mes: diasNoMes(mes), mes };
    })();

// Quantas parcelas incidem no mês pedido — calculado sob demanda, nunca gravado.
function parcelaNoMes(p, mes) {
  const dif = difMeses(p.mes_inicio, mes);
  const atual = p.parcela_inicial + dif;
  if (dif < 0 || atual > p.total_parcelas) return null;
  return { ...p, parcela_atual: atual, mes_fim: somaMes(p.mes_inicio, p.total_parcelas - p.parcela_inicial) };
}

function compromissosMock(mes) {
  const fixas = db.contas_fixas.filter((c) => c.ativa).map((c) => ({ ...c, tipo: 'conta_fixa' }));
  const parcelas = db.parcelamentos
    .map((p) => parcelaNoMes(p, mes))
    .filter(Boolean)
    .map((p) => ({ ...p, tipo: 'parcelamento', valor: p.valor_parcela }));
  return { fixas, parcelas };
}

// ---------------------------------------------------------------------------
// Tradução backend → telas
// ---------------------------------------------------------------------------

// O backend grava `data_gasto` como YYYY-MM-DD e a hora em `criado_em`.
// As telas mostram "hoje 13:12", então juntamos os dois num só campo.
function normalizaGasto(g) {
  const hora = g.criado_em
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
        .format(new Date(g.criado_em))
    : '00:00';
  return { ...g, descricao: g.descricao || 'Gasto', data_gasto: `${g.data_gasto}T${hora}` };
}

function normalizaResumo(r) {
  return {
    por_categoria: (r.categorias || []).map((c) => ({
      categoria: c.categoria,
      livre: c.gasto_livre,
      comprometido: c.comprometido,
      total: c.total,
      percentual: c.percentual_do_total,
    })),
    // "Total do mês" na tela é o gasto livre: é o que a pessoa gastou.
    total: r.gasto_livre,
    media_diaria: r.media_diaria,
  };
}

function normalizaCompromissos(c) {
  return {
    fixas: c.contas_fixas || [],
    parcelas: (c.parcelamentos || []).map((p) => ({ ...p, valor_parcela: p.valor })),
  };
}

// `renda_estimada` diz que aquele mês ainda não tem renda lançada: o backend
// repetiu a última conhecida para conseguir projetar. A tela precisa dessa
// distinção, senão a sobra de um mês futuro tem o mesmo peso da do mês atual.
function normalizaProjecao(p) {
  return (p.projecao || []).map((m) => ({
    mes: m.mes_referencia,
    comprometido: m.comprometido_total,
    renda: m.renda_total,
    renda_estimada: !!m.renda_estimada,
    sobra: m.sobra_projetada,
    termina: (m.parcelamentos_terminando || []).map((t) => t.descricao),
  }));
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

// Janela do ciclo. O app chama isto ANTES de qualquer número: no dia 29 o
// ciclo aberto já é o do mês seguinte, e o cliente não tem como adivinhar.
export async function getCiclo(mes) {
  if (!USAR_MOCK) return req(`/api/ciclo${mes ? `?mes=${mes}` : ''}`);
  await espera(60);
  const atual = cicloLocal(`${db.hoje.mes}-${String(db.hoje.dia).padStart(2, '0')}`);
  return {
    ...janelaLocal(mes || atual),
    ciclo_atual: atual,
    dias_decorridos: db.hoje.dia,
    dias_restantes: Math.max(1, db.hoje.dias_no_mes - db.hoje.dia + 1),
    configuracao: { ...CICLO_PADRAO, notificar: avisoMock },
  };
}

export async function getSaldo(mes = hoje.mes) {
  if (!USAR_MOCK) return req(`/api/saldo?mes=${mes}`);
  await espera(180);
  const renda_total = db.rendas.filter((r) => r.mes_referencia === mes).reduce((s, r) => s + r.valor, 0);
  const { fixas, parcelas } = compromissosMock(mes);
  const comprometido_contas_fixas = fixas.reduce((s, c) => s + c.valor, 0);
  const comprometido_parcelas = parcelas.reduce((s, p) => s + p.valor, 0);
  const comprometido_total = comprometido_contas_fixas + comprometido_parcelas;
  const gasto_livre = db.gastos.filter((g) => g.data_gasto.startsWith(mes)).reduce((s, g) => s + g.valor, 0);
  const disponivel = renda_total - comprometido_total - gasto_livre;
  const dias_restantes = Math.max(1, db.hoje.dias_no_mes - db.hoje.dia + 1);
  const hojeIso = `${db.hoje.mes}-${String(db.hoje.dia).padStart(2, '0')}`;
  const gastoHojeMock = db.gastos
    .filter((g) => g.data_gasto.startsWith(hojeIso))
    .reduce((s, g) => s + g.valor, 0);
  return {
    mes_referencia: mes,
    ciclo: janelaLocal(mes),
    renda_total, comprometido_total, comprometido_contas_fixas, comprometido_parcelas,
    gasto_livre, disponivel,
    percentual_consumido: renda_total ? ((comprometido_total + gasto_livre) / renda_total) * 100 : 0,
    dias_restantes,
    ritmo_diario: disponivel / dias_restantes,
    renda_definida: renda_total > 0,
    gasto_hoje: gastoHojeMock,
    ritmo_restante_hoje: disponivel / dias_restantes - gastoHojeMock,
    fatura: {
      dia_fechamento: CICLO_PADRAO.dia_fechamento,
      dia_vencimento: CICLO_PADRAO.dia_pagamento,
      fecha_em: janelaLocal(mes).fim,
      vence_em: janelaLocal(mes).vencimento_fatura,
      dias_para_fechar: Math.max(0, CICLO_PADRAO.dia_fechamento - db.hoje.dia),
      total_ciclo: comprometido_total + gasto_livre,
      notificar: avisoMock,
    },
  };
}

export async function getGastos(mes = hoje.mes) {
  if (!USAR_MOCK) {
    const r = await req(`/api/gastos?mes=${mes}&limite=200`);
    return (r.gastos || []).map(normalizaGasto);
  }
  await espera(140);
  return db.gastos.filter((g) => g.data_gasto.startsWith(mes));
}

export async function getResumo(mes = hoje.mes) {
  if (!USAR_MOCK) return normalizaResumo(await req(`/api/resumo?mes=${mes}`));
  await espera(160);
  const gastos = db.gastos.filter((g) => g.data_gasto.startsWith(mes));
  const total = gastos.reduce((s, g) => s + g.valor, 0);
  const { fixas, parcelas } = compromissosMock(mes);
  const mapa = {};
  const põe = (cat) => (mapa[cat] = mapa[cat] || { categoria: cat, livre: 0, comprometido: 0 });
  gastos.forEach((g) => { põe(g.categoria).livre += g.valor; });
  [...fixas, ...parcelas].forEach((c) => { põe(c.categoria).comprometido += c.valor; });
  const por_categoria = Object.values(mapa)
    .map((c) => ({ ...c, total: c.livre + c.comprometido }))
    .sort((a, b) => b.total - a.total);
  const totalGeral = por_categoria.reduce((s, c) => s + c.total, 0);
  por_categoria.forEach((c) => { c.percentual = totalGeral ? (c.total / totalGeral) * 100 : 0; });
  return { por_categoria, total, media_diaria: total / db.hoje.dia };
}

export async function getCompromissos(mes = hoje.mes) {
  if (!USAR_MOCK) return normalizaCompromissos(await req(`/api/compromissos?mes=${mes}`));
  await espera(120);
  return compromissosMock(mes);
}

export async function getProjecao(meses = 6, mes = hoje.mes) {
  if (!USAR_MOCK) return normalizaProjecao(await req(`/api/projecao?meses=${meses}&mes=${mes}`));
  await espera(150);
  const renda = db.rendas[0] ? db.rendas[0].valor : 0;
  return Array.from({ length: meses }, (_, i) => {
    const m = somaMes(db.hoje.mes, i);
    const { fixas, parcelas } = compromissosMock(m);
    const anterior = compromissosMock(somaMes(db.hoje.mes, i - 1));
    const comprometido = [...fixas, ...parcelas].reduce((s, c) => s + c.valor, 0);
    const termina = anterior.parcelas.filter((p) => !parcelas.some((q) => q.id === p.id));
    const lancada = db.rendas.some((r) => r.mes_referencia === m);
    return {
      mes: m,
      comprometido,
      renda,
      renda_estimada: !lancada,
      sobra: renda - comprometido,
      termina: termina.map((t) => t.descricao),
    };
  });
}

// Interpretação da mensagem. No mock, heurística local; no real, o LLM do backend.
// Devolve ou { gasto, ...saldo } (já gravado) ou { requer_confirmacao, tipo, sugestao }.
export async function postGasto(mensagem) {
  if (!USAR_MOCK) {
    const r = await req('/api/gastos', { method: 'POST', body: JSON.stringify({ mensagem }) });
    if (r.requer_confirmacao) return r;
    // Entrada não tem categoria nem data de gasto: é uma linha de renda.
    if (r.tipo === 'entrada') return { ...r.saldo, entrada: r.entrada, tipo: 'entrada' };
    return { ...r.saldo, gasto: normalizaGasto(r.gasto), tipo: 'gasto_avulso' };
  }
  await espera(1500);
  const m = mensagem.toLowerCase();
  const num = (m.match(/(\d+[.,]?\d*)/g) || []).map((n) => parseFloat(n.replace(',', '.')));
  if (!num.length) throw Object.assign(new Error('Não identifiquei um valor nessa mensagem.'), { status: 422 });

  // A fraseologia decide, não a magnitude: "6x de 90" é parcela; "2160 em 12x" é total.
  const porParcela = m.match(/(\d+)\s*(?:x|vezes)\s*(?:de\s*)?(?:r\$\s*)?(\d+[.,]?\d*)/);
  const porTotal = m.match(/(?:r\$\s*)?(\d+[.,]?\d*)\s*(?:reais|conto|pila)?\s*(?:em|dividido em|parcelado em)\s*(\d+)\s*(?:x|vezes)/);
  const soVezes = m.match(/(\d+)\s*(?:x|vezes)/);
  if (porParcela || porTotal || soVezes) {
    let total_parcelas;
    let valor_parcela;
    if (porParcela) {
      total_parcelas = parseInt(porParcela[1], 10);
      valor_parcela = parseFloat(porParcela[2].replace(',', '.'));
    } else if (porTotal) {
      total_parcelas = parseInt(porTotal[2], 10);
      valor_parcela = parseFloat(porTotal[1].replace(',', '.')) / total_parcelas;
    } else {
      total_parcelas = parseInt(soVezes[1], 10);
      valor_parcela = (num.find((n) => n !== total_parcelas) || 0) / total_parcelas;
    }
    return {
      requer_confirmacao: true,
      tipo: 'parcelamento',
      sugestao: {
        descricao: limpaDescricao(mensagem), valor_parcela, total_parcelas,
        parcela_inicial: 1, mes_inicio: db.hoje.mes, categoria: adivinhaCategoria(m),
      },
    };
  }
  if (/todo m[êe]s|mensal|assinatura fixa|todos os meses/.test(m)) {
    return {
      requer_confirmacao: true,
      tipo: 'conta_fixa',
      sugestao: {
        descricao: limpaDescricao(mensagem), valor: num[0],
        dia_vencimento: db.hoje.dia, categoria: adivinhaCategoria(m),
      },
    };
  }

  const gasto = {
    id: db.proximoId++, valor: num[0], categoria: adivinhaCategoria(m),
    descricao: limpaDescricao(mensagem),
    data_gasto: `2026-08-${String(db.hoje.dia).padStart(2, '0')}T12:00`,
  };
  db.gastos.unshift(gasto);
  return { gasto, ...(await getSaldo()), tipo: 'gasto_avulso' };
}

// Grava o compromisso recorrente já revisado pelo usuário no card de sugestão.
export async function confirmarCompromisso(tipo, dados) {
  if (!USAR_MOCK) {
    return req(tipo === 'parcelamento' ? '/api/parcelamentos' : '/api/contas-fixas', {
      method: 'POST', body: JSON.stringify(dados),
    });
  }
  await espera(300);
  if (tipo === 'parcelamento') db.parcelamentos.push({ id: Date.now(), ...dados });
  else db.contas_fixas.push({ id: Date.now(), ativa: 1, ...dados });
  return getSaldo();
}

// Edição e remoção de compromissos recorrentes. O PATCH de parcelamento
// aceita `parcela_inicial` + `mes_inicio` juntos: é assim que "estou na
// parcela 9 agora" vira histórico correto, sem materializar parcela nenhuma.
export async function editarContaFixa(id, campos) {
  if (!USAR_MOCK) return req(`/api/contas-fixas/${id}`, { method: 'PATCH', body: JSON.stringify(campos) });
  await espera(150);
  const c = db.contas_fixas.find((x) => x.id === id);
  if (c) Object.assign(c, campos, { ativa: campos.ativa === false ? 0 : (campos.ativa === true ? 1 : c.ativa) });
  return getSaldo();
}

export async function removerContaFixa(id) {
  if (!USAR_MOCK) return req(`/api/contas-fixas/${id}`, { method: 'DELETE' });
  await espera(150);
  db.contas_fixas = db.contas_fixas.filter((c) => c.id !== id);
  return getSaldo();
}

export async function editarParcelamento(id, campos) {
  if (!USAR_MOCK) return req(`/api/parcelamentos/${id}`, { method: 'PATCH', body: JSON.stringify(campos) });
  await espera(150);
  const p = db.parcelamentos.find((x) => x.id === id);
  if (p) Object.assign(p, campos);
  return getSaldo();
}

export async function removerParcelamento(id) {
  if (!USAR_MOCK) return req(`/api/parcelamentos/${id}`, { method: 'DELETE' });
  await espera(150);
  db.parcelamentos = db.parcelamentos.filter((p) => p.id !== id);
  return getSaldo();
}

export async function removerGasto(id) {
  if (!USAR_MOCK) return req(`/api/gastos/${id}`, { method: 'DELETE' });
  await espera(120);
  db.gastos = db.gastos.filter((g) => g.id !== id);
  return getSaldo();
}

// A resposta traz `aprendido` quando a categoria mudou: o backend grava o termo
// da mensagem original e o próximo lançamento com ele já sai certo.
export async function editarGasto(id, campos) {
  if (!USAR_MOCK) return req(`/api/gastos/${id}`, { method: 'PATCH', body: JSON.stringify(campos) });
  await espera(120);
  const g = db.gastos.find((x) => x.id === id);
  let aprendido = null;
  if (g && campos.categoria && campos.categoria !== g.categoria && g.descricao) {
    aprendido = { termo: g.descricao.toLowerCase(), categoria: campos.categoria };
    vocabularioMock = [
      { id: Date.now(), ...aprendido, usos: 0, vezes: 1, origem: 'edicao' },
      ...vocabularioMock.filter((t) => t.termo !== aprendido.termo),
    ];
  }
  if (g) Object.assign(g, campos);
  return { gasto: g, aprendido, saldo: await getSaldo() };
}

// ---------------------------------------------------------------------------
// Vocabulário aprendido
// ---------------------------------------------------------------------------
// Como o usuário chama as coisas. Cresce sozinho a cada categoria corrigida e
// pode ser ensinado ou esquecido na tela de ajustes.
let vocabularioMock = [];

export async function getVocabulario() {
  if (!USAR_MOCK) return (await req('/api/vocabulario')).termos || [];
  await espera(80);
  return vocabularioMock;
}

export async function ensinarTermo(termo, categoria) {
  if (!USAR_MOCK) {
    return (await req('/api/vocabulario', { method: 'POST', body: JSON.stringify({ termo, categoria }) })).termo;
  }
  await espera(80);
  const t = { id: Date.now(), termo: termo.trim().toLowerCase(), categoria, usos: 0, vezes: 1, origem: 'manual' };
  vocabularioMock = [t, ...vocabularioMock.filter((x) => x.termo !== t.termo)];
  return t;
}

export async function esquecerTermo(id) {
  if (!USAR_MOCK) return req(`/api/vocabulario/${id}`, { method: 'DELETE' });
  await espera(80);
  vocabularioMock = vocabularioMock.filter((t) => t.id !== id);
  return { removido: true };
}

// Entradas de renda do mês, em ordem de valor.
export async function getRendas(mes = hoje.mes) {
  if (!USAR_MOCK) {
    const r = await req(`/api/rendas?mes=${mes}`);
    return { total: r.renda_total, definida: r.renda_definida, entradas: r.rendas || [] };
  }
  await espera(100);
  const entradas = db.rendas.filter((r) => r.mes_referencia === mes);
  return {
    total: entradas.reduce((s, r) => s + r.valor, 0),
    definida: entradas.length > 0,
    entradas,
  };
}

// A renda fixa do mês — o salário. É uma entre várias linhas possíveis, então
// esta função edita SÓ a linha "Renda" e nunca toca nas outras: um pix
// registrado pelo chat também é renda, e salvar o salário não pode apagá-lo.
export async function definirRenda(valor, mes = hoje.mes) {
  if (!USAR_MOCK) {
    const atuais = await req(`/api/rendas?mes=${mes}`);
    const principal = (atuais.rendas || []).find((r) => r.descricao === 'Renda');
    if (principal) {
      return req(`/api/rendas/${principal.id}`, { method: 'PATCH', body: JSON.stringify({ valor }) });
    }
    return req('/api/rendas', {
      method: 'POST',
      body: JSON.stringify({ mes_referencia: mes, descricao: 'Renda', valor }),
    });
  }
  await espera(200);
  const principal = db.rendas.find((r) => r.mes_referencia === mes && r.descricao === 'Renda');
  if (principal) principal.valor = valor;
  else db.rendas.push({ id: Date.now(), mes_referencia: mes, descricao: 'Renda', valor });
  return getSaldo(mes);
}

// Corrige o valor de uma entrada (o card de confirmação deixa editar).
export async function editarRenda(id, campos) {
  if (!USAR_MOCK) return req(`/api/rendas/${id}`, { method: 'PATCH', body: JSON.stringify(campos) });
  await espera(120);
  const r = db.rendas.find((x) => x.id === id);
  if (r) Object.assign(r, campos);
  return getSaldo();
}

// Remove uma entrada específica (um pix lançado errado, por exemplo).
export async function removerRenda(id, mes = hoje.mes) {
  if (!USAR_MOCK) return req(`/api/rendas/${id}`, { method: 'DELETE' });
  await espera(120);
  db.rendas = db.rendas.filter((r) => r.id !== id);
  return getSaldo(mes);
}

export async function limparRenda(mes = hoje.mes) {
  if (!USAR_MOCK) {
    const atuais = await req(`/api/rendas?mes=${mes}`);
    await Promise.all((atuais.rendas || []).map((r) => req(`/api/rendas/${r.id}`, { method: 'DELETE' })));
    return getSaldo(mes);
  }
  db.rendas = [];
  return getSaldo(mes);
}

export async function health() {
  const t0 = Date.now();
  if (!USAR_MOCK) {
    try {
      const h = await req('/api/health');
      return {
        ok: h.status === 'ok',
        modo: h.ollama && h.ollama.modelo ? h.ollama.modelo : 'api',
        latencia_ms: Date.now() - t0,
      };
    } catch {
      return { ok: false, modo: 'api', latencia_ms: Date.now() - t0 };
    }
  }
  await espera(400);
  return { ok: true, modo: 'mock', latencia_ms: Date.now() - t0 };
}

// CSV do mês, montado a partir do que já está na tela.
export function csv(gastos) {
  const linhas = [
    ['data', 'valor', 'categoria', 'descricao'],
    ...(gastos || (USAR_MOCK ? db.gastos : [])).map((g) => [
      g.data_gasto, g.valor, g.categoria, `"${String(g.descricao || '').replace(/"/g, '""')}"`,
    ]),
  ];
  return linhas.map((l) => l.join(',')).join('\n');
}

// ---------------------------------------------------------------------------
// Heurísticas usadas apenas pelo mock
// ---------------------------------------------------------------------------

const CATS = {
  alimentacao: ['almoço', 'almoco', 'jantar', 'café', 'cafe', 'lanche', 'mercado', 'feira', 'restaurante', 'padaria', 'pizza'],
  transporte: ['uber', 'ônibus', 'onibus', 'metrô', 'metro', 'gasolina', 'combustível', 'táxi', 'taxi', 'estacionamento'],
  lazer: ['cinema', 'bar', 'show', 'viagem', 'jogo'],
  saude: ['farmácia', 'farmacia', 'remédio', 'remedio', 'médico', 'medico', 'dentista', 'academia'],
  compras: ['roupa', 'tênis', 'tenis', 'celular', 'notebook', 'fone', 'amazon', 'shopping'],
  contas: ['luz', 'água', 'agua', 'internet', 'aluguel', 'condomínio', 'gás', 'telefone'],
  assinaturas: ['spotify', 'netflix', 'assinatura', 'plano', 'icloud'],
  educacao: ['curso', 'livro', 'faculdade', 'escola'],
};

function adivinhaCategoria(m) {
  for (const [cat, termos] of Object.entries(CATS)) if (termos.some((t) => m.includes(t))) return cat;
  return 'outros';
}

// Ordem importa: primeiro os tokens numéricos/parcelas, depois as preposições soltas.
function limpaDescricao(msg) {
  let s = String(msg);
  s = s.replace(/\d+\s*(?:x|vezes)\s*(?:de\s*)?(?:r\$\s*)?\d+[.,]?\d*/gi, ' ');
  s = s.replace(/(?:r\$\s*)?\d+[.,]?\d*\s*(?:reais|conto|pila)?\s*(?:em|dividido em|parcelado em)\s*\d+\s*(?:x|vezes)/gi, ' ');
  s = s.replace(/r\$\s*\d+[.,]?\d*/gi, ' ');
  s = s.replace(/\d+[.,]?\d*\s*(?:reais|real|conto|pila|paus)?/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const inicio = /^(gastei|paguei|pago|comprei|torrei|foi|no|na|em|de|do|da|com|um|uma|meu|minha|pra|para|todo|todos|os|mês|mes)\s+/i;
  const fim = /\s+(de|em|no|na|do|da|com|por|e)$/i;
  while (inicio.test(s)) s = s.replace(inicio, '');
  while (fim.test(s)) s = s.replace(fim, '');
  s = s.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Gasto';
}

export const ROTULO_CAT = {
  alimentacao: 'Alimentação', transporte: 'Transporte', lazer: 'Lazer', saude: 'Saúde',
  compras: 'Compras', contas: 'Contas', assinaturas: 'Assinaturas', educacao: 'Educação', outros: 'Outros',
};
export const LISTA_CAT = Object.keys(ROTULO_CAT);

// ---------------------------------------------------------------------------
// Painel do mês
// ---------------------------------------------------------------------------
// Com backend o painel vem pronto de `GET /api/dashboard`. No mock ele é
// derivado aqui, a partir dos gastos do ciclo (e do ciclo anterior, só para a
// variação): nenhuma tela faz conta de agregação.

// Todos os dias do ciclo, do início ao fim, como YYYY-MM-DD.
function diasDoCiclo(ciclo) {
  const dias = [];
  let d = ciclo.inicio;
  // Guarda de segurança: nenhum ciclo passa de 40 dias.
  for (let i = 0; i < 40 && d <= ciclo.fim; i += 1) {
    dias.push(d);
    d = somaDias(d, 1);
  }
  return dias;
}

// Marca a semana do ciclo que contém hoje: sem isso as cinco faixas de datas
// parecem todas igualmente relevantes.
function marcaSemanaAtual(semanas) {
  const h = hojeLocal();
  return (semanas || []).map((s) => ({ ...s, atual: s.inicio <= h && h <= s.fim }));
}

// Tradução do dashboard do backend para os nomes que as telas usam.
function normalizaPainel(d) {
  return {
    total: d.total,
    inicio_ciclo: d.ciclo.inicio,
    fim_ciclo: d.ciclo.fim,
    media_diaria: d.media_diaria,
    maior_dia: d.maior_dia,
    dias_com_gasto: d.dias_com_gasto,
    dias_no_ciclo: d.dias_no_ciclo,
    por_categoria: d.por_categoria,
    por_dia: d.dia_a_dia,
    por_semana: marcaSemanaAtual(d.semanas),
    top: d.maiores,
    variacao: d.comparativo.variacao,
    mes_anterior: d.comparativo.mes_anterior,
  };
}

export async function getPainel(mes = hoje.mes) {
  if (!USAR_MOCK) return normalizaPainel(await req(`/api/dashboard?mes=${mes}`));
  const anterior = somaMes(mes, -1);
  const [resumo, gastos, gastosAnteriores, janela] = await Promise.all([
    getResumo(mes), getGastos(mes), getGastos(anterior), getCiclo(mes),
  ]);

  const dias = diasDoCiclo(janela);
  const porDia = dias.map((data) => ({ data, dia: Number(data.slice(8, 10)), valor: 0 }));
  const indice = Object.fromEntries(porDia.map((d, i) => [d.data, i]));

  gastos.forEach((g) => {
    const i = indice[g.data_gasto.slice(0, 10)];
    // Gasto lançado fora da janela (mês do calendário ≠ ciclo) entra no
    // primeiro dia em vez de sumir do gráfico.
    porDia[i === undefined ? 0 : i].valor += g.valor;
  });

  const total = gastos.reduce((s, g) => s + g.valor, 0);
  const totalAnterior = gastosAnteriores.reduce((s, g) => s + g.valor, 0);
  const comGasto = porDia.filter((d) => d.valor > 0);
  const maior = porDia.reduce((a, b) => (b.valor > a.valor ? b : a), porDia[0] || { valor: 0, dia: 0 });

  // Semanas de 7 dias corridos dentro da janela, não semanas do calendário.
  const porSemana = [];
  for (let i = 0; i < porDia.length; i += 7) {
    const faixa = porDia.slice(i, i + 7);
    porSemana.push({
      rotulo: `S${porSemana.length + 1}`,
      inicio: faixa[0].data,
      fim: faixa[faixa.length - 1].data,
      valor: faixa.reduce((s, d) => s + d.valor, 0),
    });
  }

  // A rosca mostra gasto livre: o comprometido não é escolha do mês.
  const livre = (resumo.por_categoria || []).filter((c) => c.livre > 0);
  const somaLivre = livre.reduce((s, c) => s + c.livre, 0);

  return {
    total,
    inicio_ciclo: janela.inicio,
    fim_ciclo: janela.fim,
    media_diaria: comGasto.length ? total / comGasto.length : 0,
    maior_dia: { dia: maior.dia, valor: maior.valor },
    dias_com_gasto: comGasto.length,
    dias_no_ciclo: porDia.length,
    por_categoria: livre
      .map((c) => ({
        categoria: c.categoria,
        valor: c.livre,
        percentual: somaLivre ? (c.livre / somaLivre) * 100 : 0,
      }))
      .sort((a, b) => b.valor - a.valor),
    por_dia: porDia,
    por_semana: marcaSemanaAtual(porSemana),
    top: [...gastos].sort((a, b) => b.valor - a.valor).slice(0, 5),
    // Sem base no ciclo anterior a comparação seria ruído, então some.
    variacao: totalAnterior > 0 ? ((total - totalAnterior) / totalAnterior) * 100 : null,
    mes_anterior: anterior,
  };
}

// ---------------------------------------------------------------------------
// Fatura
// ---------------------------------------------------------------------------
// O ciclo vem do backend; o resto (quantos dias faltam, se avisa) é local.

// O aviso de fatura é configuração do servidor (`fatura_notificar`), não do
// navegador: assim o ajuste segue a pessoa entre celular e desktop. No mock
// ele vive em memória.
let avisoMock = true;

export async function definirAviso(ligado) {
  if (!USAR_MOCK) {
    const r = await req('/api/fatura', { method: 'PATCH', body: JSON.stringify({ notificar: ligado }) });
    return r.configuracao.notificar;
  }
  await espera(80);
  avisoMock = ligado;
  return avisoMock;
}

// Dia em que a fatura fecha. Mudar isto reescreve a janela de todos os ciclos —
// o backend não materializa a que mês cada gasto pertence.
export async function definirFechamento(dia) {
  if (!USAR_MOCK) {
    const r = await req('/api/fatura', { method: 'PATCH', body: JSON.stringify({ dia_fechamento: dia }) });
    return r.configuracao;
  }
  await espera(80);
  CICLO_PADRAO.dia_fechamento = dia;
  return { ...CICLO_PADRAO, notificar: avisoMock };
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
// Uma requisição para tudo que a primeira tela precisa.
//
// Antes o boot era `/api/ciclo` e SÓ DEPOIS sete chamadas em paralelo: duas
// rodadas de rede em série, porque nenhum número pode ser pedido antes de
// saber qual ciclo está aberto (dia 29 já é o ciclo seguinte). No celular,
// cada rodada custa um ida-e-volta completo — e a primeira ainda paga DNS e
// TLS do domínio da API. Colapsar em `/api/boot` corta uma rodada inteira.

const CHAVE_SNAPSHOT = 'minimau_boot';
// Retrato mais velho que isto não é mostrado nem por um instante: é melhor a
// tela de carregando do que um saldo da semana passada com cara de atual.
const VALIDADE_SNAPSHOT_MS = 7 * 24 * 60 * 60 * 1000;

// Último boot bem-sucedido, para a tela abrir com número em vez de vazio.
// localStorage pode estourar cota ou estar bloqueado (Safari privado): falhar
// aqui não pode derrubar o app, só faz perder a abertura instantânea.
export function lerSnapshot() {
  try {
    const bruto = localStorage.getItem(CHAVE_SNAPSHOT);
    if (!bruto) return null;
    const { em, mes, dados, fechamento } = JSON.parse(bruto);
    if (!em || !dados) return null;
    if (Date.now() - new Date(em).getTime() > VALIDADE_SNAPSHOT_MS) return null;
    // O ciclo pode ter virado desde o último uso, e aí o retrato é de outro
    // período: saldo do ciclo passado com cara de atual é o erro mais caro que
    // esta tela pode cometer. O dia de fechamento vem gravado no próprio
    // snapshot (o usuário pode tê-lo mudado), então a conta local bate com a
    // do backend.
    const cfg = { ...CICLO_PADRAO, dia_fechamento: fechamento || CICLO_PADRAO.dia_fechamento };
    if (mes !== cicloLocal(hojeLocal(), cfg)) return null;
    return { ...dados, snapshot: true, snapshot_em: em };
  } catch {
    return null;
  }
}

function gravarSnapshot(mes, dados, fechamento) {
  try {
    localStorage.setItem(CHAVE_SNAPSHOT, JSON.stringify({
      em: new Date().toISOString(), mes, dados, fechamento,
    }));
  } catch {
    // Sem espaço ou sem permissão: segue sem snapshot.
  }
}

export function limparSnapshot() {
  try {
    localStorage.removeItem(CHAVE_SNAPSHOT);
  } catch {
    // nada a fazer
  }
}

// Tudo do ciclo em uma resposta. `mes` ausente = ciclo aberto, decidido pelo
// backend (que é quem conhece o dia de fechamento e o fuso).
export async function getBoot(mes) {
  if (!USAR_MOCK) {
    const d = await req(`/api/boot${mes ? `?mes=${mes}` : ''}`);
    const pronto = {
      ciclo: d.ciclo,
      cicloAtual: d.ciclo.ciclo_atual,
      mes: d.saldo.mes_referencia,
      saldo: d.saldo,
      gastos: (d.gastos || []).map(normalizaGasto),
      painel: normalizaPainel(d.dashboard),
      compromissos: normalizaCompromissos(d.compromissos),
      projecao: normalizaProjecao(d.projecao),
      rendas: { total: d.rendas.renda_total, definida: d.rendas.renda_definida, entradas: d.rendas.rendas || [] },
    };
    // Só o ciclo aberto vira snapshot: mês navegado à mão não é o que a
    // próxima abertura do app deve mostrar.
    if (pronto.mes === pronto.cicloAtual) {
      gravarSnapshot(pronto.mes, pronto, d.ciclo.configuracao?.dia_fechamento);
    }
    return pronto;
  }

  // No mock não existe rodada de rede para economizar: o ganho é só no real.
  const janela = await getCiclo(mes);
  const alvo = mes || janela.ciclo_atual;
  const [saldo, gastos, painel, comp, projecao, rendas] = await Promise.all([
    getSaldo(alvo), getGastos(alvo), getPainel(alvo),
    getCompromissos(alvo), getProjecao(6, alvo), getRendas(alvo),
  ]);
  return {
    ciclo: janela,
    cicloAtual: janela.ciclo_atual,
    mes: alvo,
    saldo,
    gastos,
    painel,
    compromissos: comp,
    projecao,
    rendas,
  };
}

// ---------------------------------------------------------------------------
// Consultor financeiro
// ---------------------------------------------------------------------------
// "Quando vale a pena comprar X de Y?"
//
// A resposta chega em duas partes, e é de propósito: a análise (veredito,
// folga, mês em que a compra cabe) é conta de banco e volta em milissegundos;
// o texto é escrito pelo LLM local, que em CPU gera ~10 tokens/s. Mostrar a
// decisão na hora e deixar a frase aparecer escrevendo é a diferença entre um
// app que responde e um app que fica pensando dez segundos.
//
// `aoAnalise` recebe os números; `aoTexto` recebe cada pedaço de frase.
export async function consultar({ pergunta, mes, aoAnalise, aoTexto, sinal }) {
  if (USAR_MOCK) {
    await espera(220);
    const { valor } = leCompraMock(pergunta);
    const analise = {
      consulta_id: Date.now(),
      tipo: valor ? 'compra' : 'geral',
      veredito: valor ? (valor <= 200 ? 'cabe_agora' : 'esperar') : 'contexto',
      titulo: valor ? (valor <= 200 ? 'Cabe agora, à vista.' : 'Melhor esperar.') : null,
      analise: { valor, a_vista: { cabe: valor <= 200, folga_util: 200 }, retrato: { folga_atual: 200, media_diaria: 25 } },
    };
    if (aoAnalise) aoAnalise(analise);
    const frase = valor
      ? `No modo demonstração a folga é fixa em R$ 200,00, então ${valor <= 200 ? 'cabe' : 'não cabe'}.`
      : 'No modo demonstração não há números reais para analisar.';
    for (const parte of frase.split(' ')) {
      await espera(35);
      if (aoTexto) aoTexto(`${parte} `);
    }
    return { ...analise, texto: frase };
  }

  const r = await fetch(`${BASE_URL}/api/consultor/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSessao()}` },
    body: JSON.stringify({ pergunta, ...(mes ? { mes } : {}) }),
    signal: sinal,
  }).catch((e) => {
    throw Object.assign(new Error('Não consegui falar com o servidor.'), { status: 0, causa: e });
  });

  // Validação falha antes de o stream abrir, e volta como JSON normal.
  if (!r.ok) {
    checaSessao(r.status);
    const corpo = await r.json().catch(() => ({}));
    throw Object.assign(new Error(corpo.erro || 'Falha ao consultar.'), { status: r.status });
  }

  const leitor = r.body.getReader();
  const decodificador = new TextDecoder();
  let buffer = '';
  let analise = null;
  let texto = '';

  // SSE: eventos separados por linha em branco, cada um com `event:` e `data:`.
  const processar = (bloco) => {
    let evento = 'message';
    const dados = [];
    for (const linha of bloco.split('\n')) {
      if (linha.startsWith('event:')) evento = linha.slice(6).trim();
      else if (linha.startsWith('data:')) dados.push(linha.slice(5).trim());
    }
    if (!dados.length) return;
    let d;
    try { d = JSON.parse(dados.join('\n')); } catch { return; }

    if (evento === 'analise') { analise = d; if (aoAnalise) aoAnalise(d); }
    else if (evento === 'pedaco') { texto += d.texto; if (aoTexto) aoTexto(d.texto); }
    else if (evento === 'fim') { texto = d.texto || texto; }
    else if (evento === 'erro') { throw Object.assign(new Error(d.erro || 'Falha ao gerar o conselho.'), { status: 500 }); }
  };

  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    buffer += decodificador.decode(value, { stream: true });
    const blocos = buffer.split('\n\n');
    buffer = blocos.pop() || '';
    blocos.forEach(processar);
  }
  if (buffer.trim()) processar(buffer);

  return { ...(analise || {}), texto };
}

// "Ajudou" (1) ou "errou" (-1). A resposta marcada como errada fica na fila de
// casos do backend (casos-reclamados.js) para virar teste antes do conserto.
export async function avaliarConsulta(id, nota, comentario) {
  if (!USAR_MOCK) {
    return req(`/api/consultor/${id}/avaliacao`, {
      method: 'POST', body: JSON.stringify({ nota, ...(comentario ? { comentario } : {}) }),
    });
  }
  await espera(80);
  return { consulta: { id, nota, comentario: comentario || null } };
}

// Leitura de valor da pergunta, só para o modo demonstração. No real quem lê é
// o backend, que também decide o veredito.
function leCompraMock(pergunta) {
  const m = String(pergunta || '').match(/(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)/);
  return { valor: m ? leValorSimples(m[1]) : null };
}

function leValorSimples(bruto) {
  const t = bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto.replace(/\.(?=\d{3}\b)/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Caixinhas
// ---------------------------------------------------------------------------
// Divisão LÓGICA da sobra do ciclo entre objetivos. O dinheiro físico fica
// todo numa Caixinha Turbo do Nubank; as caixas do app só dizem quanto dele é
// de cada objetivo. Regra, meta da reserva e teto são do backend
// (`src/services/caixinhasService.js`); o mock espelha a mesma regra só para o
// modo de demonstração.

// Reparte `total` centavos na proporção dos pesos sem perder nem criar
// centavo (método do maior resto). A tela usa para transformar percentual
// editado em valor exato — é o valor, e não o percentual, que vai para o
// backend: 0,01% de 1.500 são 15 centavos.
export function repartirCentavos(total, pesos) {
  const soma = pesos.reduce((a, p) => a + p, 0);
  if (total <= 0 || soma <= 0) return pesos.map(() => 0);
  const brutos = pesos.map((p) => (total * p) / soma);
  const partes = brutos.map(Math.floor);
  let resto = total - partes.reduce((a, p) => a + p, 0);
  const ordem = brutos.map((b, i) => [b - Math.floor(b), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; resto > 0; k += 1, resto -= 1) partes[ordem[k % ordem.length][1]] += 1;
  return partes;
}

const caixasMock = {
  multiplicador: 2,
  despesaMedia: 1450,
  objetivos: [
    { id: 1, nome: 'Reserva de emergência', e_reserva: true, saldo_atual: 1200, valor_meta: null, peso: null },
    { id: 2, nome: 'Viagem', e_reserva: false, saldo_atual: 800, valor_meta: 3000, peso: null },
    { id: 3, nome: 'Curso de inglês', e_reserva: false, saldo_atual: 150, valor_meta: null, peso: null },
  ],
  alocacoes: [],
  sobraFechada: 420,
  proximoId: 4,
};

const LIMITE_TURBO_MOCK = { limite: 5000, alerta: 0.8, cdi: 115, excedente: 100 };

function objetivosMock() {
  const metaReserva = caixasMock.despesaMedia * caixasMock.multiplicador;
  return caixasMock.objetivos.map((o) => ({ ...o, meta: o.e_reserva ? metaReserva : o.valor_meta }));
}

const faltaMock = (o) => (o.meta == null ? Infinity : Math.max(0, Math.round((o.meta - o.saldo_atual) * 100)));

// Espelha `dividir` do backend. Só roda no mock.
function dividirMock(valor) {
  const objetivos = objetivosMock();
  const total = Math.round(valor * 100);
  const reserva = objetivos.find((o) => o.e_reserva);
  const abertos = objetivos.filter((o) => !o.e_reserva && faltaMock(o) > 0);
  const centavos = new Map(objetivos.map((o) => [o.id, 0]));
  let regra = 'so_reserva';
  let paraReserva = total;
  if (abertos.length && faltaMock(reserva) > 0) {
    regra = 'reserva_abaixo_da_meta';
    paraReserva = Math.min(Math.round(total * 0.75), Math.max(faltaMock(reserva), Math.round(total * 0.2)));
  } else if (abertos.length) {
    regra = 'reserva_na_meta';
    paraReserva = Math.round(total * 0.2);
  }
  let restante = total - paraReserva;
  let rodada = abertos;
  while (restante > 0 && rodada.length) {
    const definidos = rodada.map((o) => o.peso).filter((p) => p != null);
    const media = definidos.length ? definidos.reduce((a, p) => a + p, 0) / definidos.length : 1;
    const pesos = rodada.map((o) => (o.peso == null ? media : o.peso));
    const partes = repartirCentavos(restante, pesos.some((p) => p > 0) ? pesos : pesos.map(() => 1));
    const cheios = rodada.filter((o, i) => partes[i] >= faltaMock(o));
    if (!cheios.length) {
      rodada.forEach((o, i) => centavos.set(o.id, partes[i]));
      restante = 0;
      break;
    }
    cheios.forEach((o) => { centavos.set(o.id, faltaMock(o)); restante -= faltaMock(o); });
    rodada = rodada.filter((o) => !cheios.includes(o));
  }
  centavos.set(reserva.id, paraReserva + restante);
  const lista = objetivos.map((o) => centavos.get(o.id));
  const pcts = lista.map((c) => Math.round((c / total) * 10000) / 100);
  const dif = Math.round((100 - pcts.reduce((a, p) => a + p, 0)) * 100) / 100;
  if (dif) pcts[lista.indexOf(Math.max(...lista))] += dif;
  return {
    valor,
    regra,
    divisao: objetivos.map((o, i) => ({
      objetivo_id: o.id, nome: o.nome, e_reserva: o.e_reserva, percentual: Math.round(pcts[i] * 100) / 100, valor: lista[i] / 100,
    })),
  };
}

async function resumoMock() {
  const objetivos = objetivosMock();
  const total = Math.round(objetivos.reduce((a, o) => a + o.saldo_atual, 0) * 100) / 100;
  const { limite, alerta, cdi, excedente } = LIMITE_TURBO_MOCK;
  const atual = cicloLocal(`${db.hoje.mes}-${String(db.hoje.dia).padStart(2, '0')}`);
  const fechado = somaMes(atual, -1);
  const dividida = caixasMock.alocacoes.some((a) => a.mes_referencia === fechado);
  const reserva = objetivos.find((o) => o.e_reserva);
  return {
    total_guardado: total,
    objetivos: objetivos.map((o) => ({
      id: o.id, nome: o.nome, e_reserva: o.e_reserva, saldo_atual: o.saldo_atual, meta: o.meta,
      falta: o.meta == null ? null : Math.max(0, o.meta - o.saldo_atual),
      percentual_concluido: o.meta ? Math.round((o.saldo_atual / o.meta) * 1000) / 10 : null,
      peso: o.peso,
    })),
    reserva: {
      multiplicador: caixasMock.multiplicador,
      multiplicador_min: 1,
      multiplicador_max: 6,
      despesa_media: { valor: caixasMock.despesaMedia, base: 'ciclos_fechados', ciclos_considerados: 3 },
      meta: reserva.meta,
      atingida: reserva.saldo_atual >= reserva.meta,
    },
    limite: {
      total_guardado: total,
      limite,
      gatilho_alerta: limite * alerta,
      percentual_do_limite: Math.round((total / limite) * 10000) / 100,
      perto_do_limite: total > limite * alerta,
      acima_do_limite: total > limite,
      folga_ate_limite: Math.max(0, limite - total),
      excedente: Math.max(0, total - limite),
      rendimento_cdi: cdi,
      rendimento_excedente_cdi: excedente,
    },
    sobra: {
      mes_referencia: fechado,
      ciclo: janelaLocal(fechado),
      renda_definida: true,
      sobra: caixasMock.sobraFechada,
      dividida,
      pode_dividir: !dividida,
      ciclo_aberto: {
        mes_referencia: atual,
        fecha_em: janelaLocal(atual).fim,
        libera_em: somaDias(janelaLocal(atual).fim, 1),
        previsao: (await getSaldo(atual)).disponivel,
      },
    },
    alocacoes: caixasMock.alocacoes,
  };
}

// Tudo da tela de caixinhas: objetivos, meta da reserva, teto da Caixinha
// Turbo, sobra do último ciclo fechado e histórico de divisões.
export async function getCaixinhas() {
  if (!USAR_MOCK) return req('/api/caixinhas');
  await espera(120);
  return resumoMock();
}

// Sugestão de divisão. Sem `valor`, sobre a sobra do ciclo `mes` (padrão: o
// último fechado); com `valor`, simula — é assim que a previsão do ciclo
// aberto vira uma prévia antes do fechamento.
export async function sugerirDivisao({ valor, mes } = {}) {
  if (!USAR_MOCK) {
    return req('/api/caixinhas/sugestao', {
      method: 'POST',
      body: JSON.stringify({ ...(valor != null ? { valor } : {}), ...(mes ? { mes_referencia: mes } : {}) }),
    });
  }
  await espera(90);
  return { mes_referencia: mes || null, ...dividirMock(valor != null ? valor : caixasMock.sobraFechada) };
}

// Grava a divisão. `divisao` leva `valor` exato por objetivo; o backend
// confere que soma a sobra do ciclo ao centavo. Devolve { alocacao, resumo }.
export async function confirmarDivisao(mes, divisao) {
  if (!USAR_MOCK) {
    return req('/api/caixinhas/divisoes', {
      method: 'POST', body: JSON.stringify({ mes_referencia: mes, divisao }),
    });
  }
  await espera(250);
  divisao.forEach((d) => {
    const o = caixasMock.objetivos.find((x) => x.id === d.objetivo_id);
    if (o) o.saldo_atual = Math.round((o.saldo_atual + d.valor) * 100) / 100;
  });
  const total = divisao.reduce((a, d) => a + d.valor, 0);
  const alocacao = {
    mes_referencia: mes, total_sobra: total, criado_em: new Date().toISOString(),
    divisoes: divisao.filter((d) => d.valor > 0).map((d) => ({
      ...d, nome: caixasMock.objetivos.find((o) => o.id === d.objetivo_id)?.nome || '—',
      percentual: Math.round((d.valor / total) * 10000) / 100,
    })),
  };
  caixasMock.alocacoes.unshift(alocacao);
  return { alocacao, resumo: await resumoMock() };
}

export async function desfazerDivisao(mes) {
  if (!USAR_MOCK) return req(`/api/caixinhas/divisoes/${mes}`, { method: 'DELETE' });
  await espera(150);
  const a = caixasMock.alocacoes.find((x) => x.mes_referencia === mes);
  (a?.divisoes || []).forEach((d) => {
    const o = caixasMock.objetivos.find((x) => x.id === d.objetivo_id);
    if (o) o.saldo_atual = Math.max(0, Math.round((o.saldo_atual - d.valor) * 100) / 100);
  });
  caixasMock.alocacoes = caixasMock.alocacoes.filter((x) => x !== a);
  return { removido: true, mes_referencia: mes, resumo: await resumoMock() };
}

// Meses de despesa média que a reserva precisa cobrir (1 a 6). Devolve o resumo.
export async function definirMultiplicadorReserva(multiplicador) {
  if (!USAR_MOCK) {
    return req('/api/caixinhas/reserva', { method: 'PATCH', body: JSON.stringify({ multiplicador }) });
  }
  await espera(80);
  caixasMock.multiplicador = multiplicador;
  return resumoMock();
}

export async function criarObjetivo(dados) {
  if (!USAR_MOCK) return req('/api/objetivos', { method: 'POST', body: JSON.stringify(dados) });
  await espera(150);
  const objetivo = {
    id: caixasMock.proximoId++, e_reserva: false, saldo_atual: 0, valor_meta: null, peso: null, ...dados,
  };
  caixasMock.objetivos.push(objetivo);
  return { objetivo, resumo: await resumoMock() };
}

export async function editarObjetivo(id, campos) {
  if (!USAR_MOCK) return req(`/api/objetivos/${id}`, { method: 'PATCH', body: JSON.stringify(campos) });
  await espera(120);
  const objetivo = caixasMock.objetivos.find((o) => o.id === id);
  if (objetivo) Object.assign(objetivo, campos);
  return { objetivo, resumo: await resumoMock() };
}

export async function removerObjetivo(id) {
  if (!USAR_MOCK) return req(`/api/objetivos/${id}`, { method: 'DELETE' });
  await espera(120);
  const objetivo = caixasMock.objetivos.find((o) => o.id === id);
  if (objetivo && objetivo.saldo_atual > 0) {
    throw Object.assign(new Error(`"${objetivo.nome}" ainda tem saldo. Zere antes de remover.`), { status: 409 });
  }
  caixasMock.objetivos = caixasMock.objetivos.filter((o) => o.id !== id);
  return { removido: true, objetivo, resumo: await resumoMock() };
}
