import { useEffect, useState } from 'react';

// Placeholder rotativo da barra de entrada: exemplos reais do que dá para
// escrever, trocando a cada 3,2s.
const EXEMPLOS = [
  'gastei 32 no uber…',
  'almoço 24 reais',
  'comprei um fone em 6x de 90',
  'todo mês pago 99 de internet',
  'mercado 187,40',
];

export function usePlaceholder() {
  const [indice, setIndice] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIndice((i) => (i + 1) % EXEMPLOS.length), 3200);
    return () => clearInterval(t);
  }, []);
  return EXEMPLOS[indice];
}
