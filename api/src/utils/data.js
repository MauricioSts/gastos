// Utilitarios de data no fuso America/Sao_Paulo.
// Todas as datas de gasto sao armazenadas como string YYYY-MM-DD.
const config = require('../config');

const TZ = config.timezone;

// Formata um Date como YYYY-MM-DD no fuso configurado (nao no fuso do processo).
function paraDataLocal(date) {
  // en-CA produz exatamente YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Data de hoje no fuso local.
function hoje() {
  return paraDataLocal(new Date());
}

// Data de ontem no fuso local. Subtrai 24h e reformata no fuso,
// evitando erro de virada de dia por diferenca de UTC.
function ontem() {
  return paraDataLocal(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

// Mes corrente no formato YYYY-MM.
function mesAtual() {
  return hoje().slice(0, 7);
}

// Timestamp ISO do momento da insercao.
function agoraIso() {
  return new Date().toISOString();
}

// Converte o enum data_relativa devolvido pelo LLM em data real.
// "outro" cai em hoje e sinaliza incerteza para o usuario corrigir via PATCH.
function resolverDataRelativa(relativa) {
  if (relativa === 'ontem') return { data: ontem(), incerta: false };
  if (relativa === 'hoje') return { data: hoje(), incerta: false };
  return { data: hoje(), incerta: true };
}

// Quantos dias ja decorreram do mes (para media diaria).
// Mes passado -> total de dias do mes; mes futuro -> 0.
function diasDecorridosNoMes(mes) {
  const atual = mesAtual();
  const [ano, mm] = mes.split('-').map(Number);
  const diasNoMes = new Date(Date.UTC(ano, mm, 0)).getUTCDate();
  if (mes < atual) return diasNoMes;
  if (mes > atual) return 0;
  return Number(hoje().slice(8, 10));
}

// Quantos dias tem o mes YYYY-MM.
function diasNoMes(mes) {
  const [ano, mm] = mes.split('-').map(Number);
  return new Date(Date.UTC(ano, mm, 0)).getUTCDate();
}

// Soma n meses (n pode ser negativo) a um mes YYYY-MM.
function mesSomar(mes, n) {
  const [ano, mm] = mes.split('-').map(Number);
  // Trabalha em indice absoluto de mes para nao depender de Date/fuso.
  const indice = ano * 12 + (mm - 1) + n;
  const anoFinal = Math.floor(indice / 12);
  const mesFinal = indice - anoFinal * 12 + 1;
  return `${String(anoFinal).padStart(4, '0')}-${String(mesFinal).padStart(2, '0')}`;
}

// Quantos meses vao de `de` ate `ate` (negativo se `ate` for anterior).
function diffMeses(de, ate) {
  const [anoA, mmA] = de.split('-').map(Number);
  const [anoB, mmB] = ate.split('-').map(Number);
  return (anoB * 12 + mmB) - (anoA * 12 + mmA);
}

// Dias que ainda restam no mes, contando hoje.
// Mes passado -> 0; mes futuro -> o mes inteiro.
// Contar hoje evita divisao por zero no ritmo diario do ultimo dia do mes.
function diasRestantesNoMes(mes) {
  const atual = mesAtual();
  if (mes < atual) return 0;
  if (mes > atual) return diasNoMes(mes);
  return diasNoMes(mes) - Number(hoje().slice(8, 10)) + 1;
}

// Valida o formato YYYY-MM e se o mes existe (01-12).
function mesValido(mes) {
  if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return false;
  return true;
}

// Valida o formato YYYY-MM-DD e se a data e real (rejeita 2026-02-31).
function dataValida(data) {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

// Rotulo curto de um mes YYYY-MM: "set/2026". Existe para o texto que vai
// para o usuario (e para o briefing do LLM) nao carregar numero de mes.
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function nomeMes(mes) {
  if (!mesValido(mes)) return String(mes);
  const [ano, mm] = mes.split('-');
  return `${MESES_CURTOS[Number(mm) - 1]}/${ano}`;
}

module.exports = {
  hoje, ontem, mesAtual, agoraIso, resolverDataRelativa, nomeMes,
  diasDecorridosNoMes, mesValido, dataValida, paraDataLocal,
  diasNoMes, mesSomar, diffMeses, diasRestantesNoMes,
};
