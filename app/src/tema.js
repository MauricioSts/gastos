// Vocabulário visual do Minimau. Nenhum componente inventa cor, fonte ou raio:
// tudo sai daqui. A paleta é fechada — fósforo aparece poucas vezes por tela e
// nunca como fundo de área grande.

export const cor = {
  fundo: '#05080A',
  painel: '#0B1013',
  tinta: '#EDF3E9',
  fosforo: '#9BFF3B',
  fosforoClaro: '#C9FF8F',
  atencao: '#FFC24A',
  alerta: '#FF5A3C',
  linha: 'rgba(155,255,59,.22)',
  linhaViva: 'rgba(155,255,59,.28)',
  linhaFraca: 'rgba(155,255,59,.18)',
  divisor: 'rgba(237,243,233,.09)',
  divisorForte: 'rgba(237,243,233,.12)',
  trilho: 'rgba(237,243,233,.08)',
};

export const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";
export const SANS = "'Chakra Petch', system-ui, sans-serif";

export const cardAlto = 'linear-gradient(155deg,#0E1518 0%,#080C0E 100%)';

// Label de aparato: mono, caixa alta, tracking largo. Nunca abaixo de 9.5px.
export const rotulo = (extra = {}) => ({
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: '.22em',
  textTransform: 'uppercase',
  opacity: 0.4,
  ...extra,
});

// Metadado mono em caixa normal (data, contagem, legenda).
export const meta = (extra = {}) => ({
  fontFamily: MONO,
  fontSize: 10,
  opacity: 0.45,
  ...extra,
});

// Caixa de conteúdo: 1px de borda viva, raio 22, sem sombra colorida.
export const caixa = (extra = {}) => ({
  border: `1px solid ${cor.linha}`,
  borderRadius: 22,
  background: cor.painel,
  ...extra,
});

// Alvo de toque do iOS: 44pt é o mínimo, sem exceção.
export const ALVO = 44;

// Rampa de categorias. Verde é o acento; o resto desce para o cinza-oliva —
// nenhuma categoria compete com o valor em fósforo.
export const RAMPA = [
  '#9BFF3B', '#6FD11F', '#C9FF8F', '#4E9A16', '#8FB27A',
  '#2F5C12', '#B8C9AE', '#5F7A4E', '#3D4A36',
];

// Cor estável por categoria: a mesma barra em todas as telas.
export function corCategoria(categoria, lista) {
  const i = lista.indexOf(categoria);
  return RAMPA[(i < 0 ? 8 : i) % RAMPA.length];
}
