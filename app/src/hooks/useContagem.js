import { useEffect, useRef, useState } from 'react';

// Número que conta do valor anterior até o novo (count-up), com saída suave.
// A primeira renderização não anima: número que sobe ao abrir a tela parece
// que acabou de mudar, e não mudou.
export function useContagem(alvo, duracao = 500) {
  const [valor, setValor] = useState(alvo);
  const atual = useRef(alvo);

  useEffect(() => {
    const de = atual.current;
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (alvo == null || de == null || de === alvo || reduzido) {
      atual.current = alvo;
      setValor(alvo);
      return undefined;
    }

    const inicio = performance.now();
    let quadro;
    const passo = () => {
      // Relógio próprio, não o timestamp do rAF: ele pode ser de antes do
      // `inicio`, e um p negativo faz a curva disparar para longe do alvo.
      const p = Math.min(1, Math.max(0, (performance.now() - inicio) / duracao));
      const v = p < 1 ? de + (alvo - de) * (1 - (1 - p) ** 3) : alvo;
      atual.current = v;
      setValor(v);
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo, duracao]);

  return valor;
}
