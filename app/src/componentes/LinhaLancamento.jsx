import { useRef, useState } from 'react';
import { fmt } from '../utils/formato';
import { ROTULO_CAT } from '../api';

// Uma linha de lançamento com ações reveladas por swipe horizontal.
// EDITAR (tinta) e EXCLUIR (carimbo) ficam por baixo, 76px cada; a linha
// desliza por cima delas.
export default function LinhaLancamento({ gasto, quando, valorFonte = 30, onEditar, onExcluir }) {
  const [dx, setDx] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const inicio = useRef(0);

  const aoDescer = (e) => {
    inicio.current = e.clientX - dx;
    setArrastando(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const aoMover = (e) => {
    if (!arrastando) return;
    // Limite -152px: a largura exata dos dois botões.
    setDx(Math.max(-152, Math.min(0, e.clientX - inicio.current)));
  };

  // Snap: passou de -60px, abre até o fim; senão volta.
  const aoSubir = () => {
    setArrastando(false);
    setDx((d) => (d < -60 ? -152 : 0));
  };

  const fechar = () => setDx(0);

  return (
    <div className="relative overflow-hidden border-b border-[rgba(22,19,13,.16)]">
      <div className="absolute inset-0 flex justify-end">
        <button
          type="button"
          onClick={() => { fechar(); onEditar(gasto); }}
          className="w-[76px] flex items-center justify-center bg-tinta text-tinta-clara font-mono text-[10px] tracking-[.14em]"
        >
          EDITAR
        </button>
        <button
          type="button"
          onClick={() => { fechar(); onExcluir(gasto); }}
          className="w-[76px] flex items-center justify-center bg-carimbo text-tinta-clara font-mono text-[10px] tracking-[.14em]"
        >
          EXCLUIR
        </button>
      </div>

      <div
        onPointerDown={aoDescer}
        onPointerMove={aoMover}
        onPointerUp={aoSubir}
        onPointerCancel={aoSubir}
        style={{
          transform: `translateX(${dx}px)`,
          // Sem transição enquanto o dedo está na tela: o movimento tem que
          // acompanhar o dedo, não perseguí-lo.
          transition: arrastando ? 'none' : 'transform .26s cubic-bezier(.2,.9,.25,1)',
        }}
        // pan-y deixa a rolagem vertical passar; só o eixo X é nosso.
        className="relative bg-papel flex justify-between items-center py-3 min-h-[44px] touch-pan-y"
      >
        <div className="flex flex-col gap-[3px] pr-[10px]">
          <span className="font-sans text-[15px] font-medium">{gasto.descricao}</span>
          <span className="font-mono text-[10px] tracking-[.12em] uppercase opacity-50">
            {ROTULO_CAT[gasto.categoria] || gasto.categoria} · {quando}
          </span>
        </div>
        <span
          className="font-valor font-bold leading-none pr-[2px]"
          style={{ fontSize: `${valorFonte}px` }}
        >
          {fmt(gasto.valor)}
        </span>
      </div>
    </div>
  );
}
