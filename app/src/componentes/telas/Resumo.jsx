import { fmt } from '../../utils/formato';
import { ROTULO_CAT, nomeMes } from '../../api';

// Resumo do mês. Barra-régua por categoria: segmento hachurado (comprometido)
// + segmento carimbo (livre), largura proporcional ao maior total.
// Sem donut, sem pizza, sem legenda colorida.
export default function Resumo({ resumo, mes, aoMudarMes, aoFiltrarCategoria }) {
  const categorias = resumo ? resumo.por_categoria : [];
  const maior = categorias.length ? categorias[0].total : 1;

  return (
    <div className="px-5 pt-[18px] pb-[10px]">
      <div className="flex items-center justify-between border-2 border-tinta px-3 py-2 font-mono text-[11px] tracking-[.14em] uppercase">
        <button type="button" onClick={() => aoMudarMes(-1)} aria-label="Mês anterior" className="px-[10px] py-[6px] min-h-[32px] flex items-center">
          ◀
        </button>
        <span className="font-semibold">{nomeMes(mes)}</span>
        <button type="button" onClick={() => aoMudarMes(1)} aria-label="Próximo mês" className="px-[10px] py-[6px] min-h-[32px] flex items-center">
          ▶
        </button>
      </div>

      <div className="flex mt-[14px] border-2 border-tinta">
        <div className="flex-1 px-3 py-[10px] border-r-2 border-tinta">
          <div className="font-mono text-[10px] tracking-[.16em] uppercase opacity-60">Total do mês</div>
          <div className="font-valor font-extrabold text-[38px] leading-[1.05]">
            {resumo ? fmt(resumo.total) : '—'}
          </div>
        </div>
        <div className="flex-1 px-3 py-[10px]">
          <div className="font-mono text-[10px] tracking-[.16em] uppercase opacity-60">Média diária</div>
          <div className="font-valor font-extrabold text-[38px] leading-[1.05]">
            {resumo ? fmt(resumo.media_diaria) : '—'}
          </div>
        </div>
      </div>

      <div className="font-mono text-[10px] tracking-[.2em] uppercase opacity-55 mt-[22px] mb-1">
        Por categoria
      </div>

      {categorias.length === 0 && (
        <div className="py-10 font-mono text-[12px] opacity-50 leading-[1.6] text-center">
          Nada lançado neste mês.
        </div>
      )}

      {categorias.map((c) => (
        <button
          key={c.categoria}
          type="button"
          onClick={() => aoFiltrarCategoria(c.categoria)}
          className="w-full text-left py-3 border-b border-[rgba(22,19,13,.16)] min-h-[44px]"
        >
          <div className="flex justify-between items-baseline mb-[7px]">
            <span className="font-mono text-[11px] tracking-[.14em] uppercase">
              {ROTULO_CAT[c.categoria] || c.categoria}
            </span>
            <span className="font-valor font-bold text-[26px] leading-none">{fmt(c.total)}</span>
          </div>
          <div className="flex h-3 border border-tinta bg-transparent">
            <div className="hachura" style={{ width: `${(c.comprometido / maior) * 100}%` }} />
            <div style={{ width: `${(c.livre / maior) * 100}%`, background: '#D2360A' }} />
          </div>
        </button>
      ))}
    </div>
  );
}
