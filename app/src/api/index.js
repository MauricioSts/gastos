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

const BASE_URL = import.meta.env.VITE_API_URL || '';
const TOKEN = import.meta.env.VITE_API_TOKEN || '';
export const USAR_MOCK = import.meta.env.VITE_USAR_MOCK !== 'false';

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
      headers: { 'Content-Type': 'application/json', 'X-API-Token': TOKEN, ...(opts.headers || {}) },
    });
  } catch (e) {
    throw Object.assign(new Error('Não consegui falar com o servidor.'), { status: 0, causa: e });
  }
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
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

function normalizaProjecao(p) {
  return (p.projecao || []).map((m) => ({
    mes: m.mes_referencia,
    comprometido: m.comprometido_total,
    renda: m.renda_total,
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
  return { ...janelaLocal(mes || atual), ciclo_atual: atual, configuracao: CICLO_PADRAO };
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
  return {
    mes_referencia: mes,
    ciclo: janelaLocal(mes),
    renda_total, comprometido_total, comprometido_contas_fixas, comprometido_parcelas,
    gasto_livre, disponivel,
    percentual_consumido: renda_total ? ((comprometido_total + gasto_livre) / renda_total) * 100 : 0,
    dias_restantes,
    ritmo_diario: disponivel / dias_restantes,
    renda_definida: renda_total > 0,
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
    return { mes: m, comprometido, renda, sobra: renda - comprometido, termina: termina.map((t) => t.descricao) };
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

export async function editarGasto(id, campos) {
  if (!USAR_MOCK) return req(`/api/gastos/${id}`, { method: 'PATCH', body: JSON.stringify(campos) });
  await espera(120);
  const g = db.gastos.find((x) => x.id === id);
  if (g) Object.assign(g, campos);
  return getSaldo();
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
