import LinhaLancamento from '../LinhaLancamento';
import { fmt } from '../../utils/formato';
import { LISTA_CAT, ROTULO_CAT, MESES } from '../../api';

// Histórico com busca por texto, chips de categoria e agrupamento por dia.
export default function Historico({
  gastos, busca, aoBuscar, filtro, aoFiltrar, quando, aoEditar, aoExcluir,
}) {
  const termo = busca.trim().toLowerCase();
  const filtrados = gastos.filter(
    (g) =>
      (filtro === 'todas' || g.categoria === filtro) &&
      (!termo || (g.descricao || '').toLowerCase().includes(termo)),
  );

  // Agrupa por dia, do mais recente para o mais antigo.
  const porDia = {};
  filtrados.forEach((g) => {
    const d = g.data_gasto.split('T')[0];
    (porDia[d] = porDia[d] || []).push(g);
  });
  const dias = Object.keys(porDia)
    .sort()
    .reverse()
    .map((d) => ({
      chave: d,
      rotulo: `${d.split('-')[2]} de ${MESES[Number(d.split('-')[1]) - 1]}`,
      total: porDia[d].reduce((a, b) => a + b.valor, 0),
      itens: porDia[d],
    }));

  const chips = ['todas', ...LISTA_CAT];

  return (
    <div className="px-5 pt-4 pb-[10px]">
      <input
        value={busca}
        onChange={(e) => aoBuscar(e.target.value)}
        placeholder="buscar lançamento…"
        aria-label="Buscar lançamento"
        className="w-full box-border border-2 border-tinta bg-papel-claro px-[14px] py-[11px] font-mono text-[16px] outline-none text-tinta"
      />

      <div className="flex gap-[6px] overflow-x-auto mt-3 pb-1 rolagem">
        {chips.map((c) => {
          const ativo = filtro === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => aoFiltrar(c)}
              className="flex-none px-3 py-2 min-h-[36px] flex items-center border-[1.5px] border-tinta font-mono text-[10px] tracking-[.12em] uppercase"
              style={{
                background: ativo ? '#16130D' : 'transparent',
                color: ativo ? '#F6F1E4' : '#16130D',
              }}
            >
              {c === 'todas' ? 'todas' : ROTULO_CAT[c]}
            </button>
          );
        })}
      </div>

      {dias.length === 0 ? (
        <div className="py-10 font-mono text-[12px] opacity-50 leading-[1.6] text-center">
          Nenhum lançamento com esse filtro.
        </div>
      ) : (
        dias.map((d) => (
          <div key={d.chave} className="mt-5">
            <div className="flex justify-between font-mono text-[10px] tracking-[.2em] uppercase border-b-2 border-tinta pb-[5px]">
              <span>{d.rotulo}</span>
              <span className="opacity-55">{fmt(d.total)}</span>
            </div>
            {d.itens.map((g) => (
              <LinhaLancamento
                key={g.id}
                gasto={g}
                quando={quando(g.data_gasto)}
                valorFonte={28}
                onEditar={aoEditar}
                onExcluir={aoExcluir}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
