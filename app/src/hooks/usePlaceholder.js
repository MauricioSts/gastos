import { useEffect, useState } from 'react';

// Placeholder rotativo da barra de entrada: exemplos reais do que dá para
// escrever, trocando a cada 3,2s.
//
// A mesma barra faz duas coisas diferentes: na maioria das telas ela lança
// gasto, e no consultor ela faz pergunta. O placeholder é o que avisa disso —
// sem ele a pessoa digitaria "almoço 24" esperando registrar e receberia um
// conselho.
const EXEMPLOS = {
  lancamento: [
    'gastei 32 no uber…',
    'almoço 24 reais',
    'comprei um fone em 6x de 90',
    'todo mês pago 99 de internet',
    'mercado 187,40',
  ],
  conselho: [
    'vale a pena comprar um fone de 300?',
    'quanto posso gastar hoje?',
    'cabe um monitor de 1200 em 6x?',
    'quando cabe um notebook de 3500?',
  ],
};

export function usePlaceholder(modo = 'lancamento') {
  const [indice, setIndice] = useState(0);
  const lista = EXEMPLOS[modo] || EXEMPLOS.lancamento;
  useEffect(() => {
    setIndice(0);
    const t = setInterval(() => setIndice((i) => i + 1), 3200);
    return () => clearInterval(t);
  }, [modo]);
  return lista[indice % lista.length];
}
