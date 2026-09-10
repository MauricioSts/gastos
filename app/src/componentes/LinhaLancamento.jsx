import { useRef, useState } from 'react';
import { cor, MONO } from '../tema';
import { fmt } from '../utils/formato';

const LARGURA_ACAO = 76;
const LIMITE = -LARGURA_ACAO * 2; // as duas ações abertas
const SNAP = -60;                 // arrastou mais que isto: abre de vez

// Uma linha de gasto. O deslize horizontal revela EDITAR e EXCLUIR — o toque
// simples não faz nada, então não há como excluir sem querer.
// `touch-action: pan-y` deixa a rolagem vertical passar por cima do gesto.
export default function LinhaLancamento({ gasto, quando, corBarra, rotuloCategoria, aoEditar, aoExcluir, compacta = false }) {
  const [dx, setDx] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const x0 = useRef(0);
  const base = useRef(0); // posição em que o dedo encostou

  const fechar = () => setDx(0);

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${cor.divisor}` }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => { fechar(); aoEditar(gasto); }}
          style={{
            width: LARGURA_ACAO, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#1A2226', color: cor.tinta,
            fontFamily: MONO, fontSize: 9.5, letterSpacing: '.14em',
          }}
        >
          EDITAR
        </button>
        <button
          type="button"
          onClick={() => { fechar(); aoExcluir(gasto); }}
          style={{
            width: LARGURA_ACAO, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: cor.alerta, color: cor.fundo,
            fontFamily: MONO, fontSize: 9.5, letterSpacing: '.14em',
          }}
        >
          EXCLUIR
        </button>
      </div>

      <div
        onPointerDown={(e) => { x0.current = e.clientX; base.current = dx; setArrastando(true); }}
        onPointerMove={(e) => {
          if (!arrastando) return;
          setDx(Math.max(LIMITE, Math.min(0, base.current + e.clientX - x0.current)));
        }}
        onPointerUp={() => { setArrastando(false); setDx((d) => (d < SNAP ? LIMITE : 0)); }}
        onPointerCancel={() => { setArrastando(false); setDx(0); }}
        style={{
          position: 'relative', background: cor.fundo, display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          padding: `${compacta ? 12 : 13}px 0`, minHeight: 44, touchAction: 'pan-y',
          transform: `translateX(${dx}px)`,
          transition: arrastando ? 'none' : 'transform .26s cubic-bezier(.2,.9,.25,1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingRight: 10, minWidth: 0 }}>
          <span style={{ width: 6, height: compacta ? 24 : 26, borderRadius: 3, flex: 'none', background: corBarra }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {gasto.descricao}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.42 }}>
              {rotuloCategoria} · {quando(gasto.data_gasto)}
            </span>
          </div>
        </div>
        <span style={{ fontWeight: 700, fontSize: compacta ? 24 : 26, lineHeight: 1, flex: 'none' }}>
          {fmt(gasto.valor)}
        </span>
      </div>
    </div>
  );
}
