import LinhaLancamento from '../LinhaLancamento';
import { cor, MONO } from '../../tema';
import { fmt } from '../../utils/formato';
import { LISTA_CAT, MESES, dataCurta } from '../../api';

// Histórico: busca livre + chips de categoria, agrupado por dia com o total do
// dia. A busca é local — os gastos do ciclo já estão todos na mão.
export default function Historico({
  gastos, busca, aoBuscar, filtro, aoFiltrar, periodo, aoLimparPeriodo,
  quando, rotuloCategoria, corBarra, aoEditar, aoExcluir,
}) {
  const termo = busca.trim().toLowerCase();
  const naJanela = (g) => {
    if (!periodo) return true;
    const dia = g.data_gasto.slice(0, 10);
    return dia >= periodo.inicio && dia <= periodo.fim;
  };
  const filtrados = gastos.filter(
    (g) => (filtro === 'todas' || g.categoria === filtro)
      && naJanela(g)
      && (!termo || (g.descricao || '').toLowerCase().includes(termo)),
  );
  const totalFiltrado = filtrados.reduce((s, g) => s + g.valor, 0);

  const porDia = {};
  filtrados.forEach((g) => {
    const dia = g.data_gasto.slice(0, 10);
    (porDia[dia] = porDia[dia] || []).push(g);
  });
  const dias = Object.keys(porDia).sort().reverse();

  const chips = ['todas', ...LISTA_CAT];

  return (
    <div style={{ padding: '16px 16px 10px' }}>
      <input
        value={busca}
        onChange={(e) => aoBuscar(e.target.value)}
        placeholder="buscar lançamento…"
        aria-label="Buscar lançamento"
        style={{
          width: '100%', boxSizing: 'border-box', border: `1px solid rgba(155,255,59,.24)`,
          borderRadius: 14, background: cor.painel, padding: '12px 14px',
          fontFamily: MONO, fontSize: 16, outline: 'none', color: cor.tinta,
        }}
      />

      {periodo && (
        <button
          type="button"
          onClick={aoLimparPeriodo}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 12, minHeight: 44,
            border: `1px solid ${cor.fosforo}`, borderRadius: 14, padding: '10px 13px',
            background: 'rgba(155,255,59,.1)', fontFamily: MONO, fontSize: 10.5, letterSpacing: '.08em',
          }}
        >
          <span style={{ flex: 1, textAlign: 'left', color: cor.fosforo }}>
            semana de {dataCurta(periodo.inicio)} a {dataCurta(periodo.fim)}
          </span>
          <span style={{ fontWeight: 700 }}>{fmt(totalFiltrado)}</span>
          <span style={{ opacity: 0.6 }}>✕</span>
        </button>
      )}

      <div className="rolagem" style={{ display: 'flex', gap: 7, overflowX: 'auto', marginTop: 12, paddingBottom: 4 }}>
        {chips.map((c) => {
          const ativo = filtro === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => aoFiltrar(c)}
              style={{
                flex: 'none', padding: '8px 13px', minHeight: 36, display: 'flex', alignItems: 'center',
                borderRadius: 20, fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase',
                border: `1px solid ${ativo ? cor.fosforo : 'rgba(237,243,233,.2)'}`,
                background: ativo ? cor.fosforo : 'transparent',
                color: ativo ? cor.fundo : 'rgba(237,243,233,.75)',
              }}
            >
              {c === 'todas' ? 'todas' : rotuloCategoria(c)}
            </button>
          );
        })}
      </div>

      {dias.length === 0 ? (
        <div style={{ padding: '44px 0', fontFamily: MONO, fontSize: 11.5, opacity: 0.45, lineHeight: 1.7, textAlign: 'center' }}>
          {periodo ? 'Nenhum lançamento nesta semana.' : 'Nada com esse filtro.'}
        </div>
      ) : (
        dias.map((dia) => (
          <div key={dia} style={{ marginTop: 22 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 9.5,
              letterSpacing: '.2em', textTransform: 'uppercase', paddingBottom: 6,
              borderBottom: `1px solid rgba(155,255,59,.24)`, color: cor.fosforo,
            }}
            >
              <span>{dia.slice(8, 10)} de {MESES[Number(dia.slice(5, 7)) - 1]}</span>
              <span style={{ opacity: 0.6 }}>{fmt(porDia[dia].reduce((s, g) => s + g.valor, 0))}</span>
            </div>
            {porDia[dia].map((g) => (
              <LinhaLancamento
                key={g.id}
                gasto={g}
                compacta
                quando={quando}
                corBarra={corBarra(g.categoria)}
                rotuloCategoria={rotuloCategoria(g.categoria)}
                aoEditar={aoEditar}
                aoExcluir={aoExcluir}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
