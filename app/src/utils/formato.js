// Formatação de números. Todo valor em reais passa por aqui.

// 1234.5 -> "1.234,50". Null vira travessão, nunca "0,00":
// zero é uma informação, ausência é outra.
export const fmt = (v) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Sem centavos, para a decomposição e a projeção.
export const fmt0 = (v) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));

// Lê "1.234,56" ou "1234.56" e devolve número, ou null.
export function leValor(bruto) {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null;
  if (typeof bruto !== 'string') return null;
  const texto = bruto.trim().replace(/\s|r\$/gi, '');
  if (!texto) return null;
  const temVirgula = texto.includes(',');
  const normalizado = temVirgula ? texto.replace(/\./g, '').replace(',', '.') : texto;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}
