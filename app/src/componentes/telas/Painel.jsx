import { cor, MONO, rotulo, meta } from '../../tema';
import { fmt0 } from '../../utils/formato';
import { nomeMes, dataCurta } from '../../api';

const RAIO = 58;
const CIRC = 2 * Math.PI * RAIO;

// Painel do mês: duas leituras, só. Onde o dinheiro foi (categorias) e quais
// lançamentos pesaram (maiores gastos). Contas fixas e parcelas não entram —
// elas são do Travado, não escolha deste mês.
export default function Painel({
  painel, mes, aoMudarMes, aoFiltrarCategoria, rotuloCategoria, corBarra,
}) {
  if (!painel) {
    return (
      <div style={{ padding: '28px 20px', fontFamily: MONO, fontSize: 11.5, opacity: 0.45, lineHeight: 1.7 }}>
        Levantando o mês…
      </div>
    );
  }

  // Arcos concatenados: cada categoria começa onde a anterior parou.
  let acumulado = 0;
  const arcos = painel.por_categoria.map((c) => {
    const comprimento = (c.percentual / 100) * CIRC;
    const deslocamento = -acumulado;
    acumulado += comprimento;
    return {
      categoria: c.categoria,
      cor: corBarra(c.categoria),
      dash: `${Math.max(0, comprimento - 2)} ${CIRC}`,
      offset: deslocamento,
    };
  });

  const maiorCategoria = painel.por_categoria.length ? painel.por_categoria[0].valor : 1;

  return (
    <div style={{ padding: '16px 16px 10px' }}>
      {/* Seletor de mês */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        border: `1px solid ${cor.linha}`, borderRadius: 16, padding: '6px 8px',
        fontFamily: MONO, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
      }}
      >
        <button type="button" onClick={() => aoMudarMes(-1)} aria-label="Mês anterior" style={{ padding: '6px 12px', minHeight: 32, display: 'flex', alignItems: 'center', color: cor.fosforo }}>◀</button>
        <span style={{ fontWeight: 600 }}>{nomeMes(mes)}</span>
        <button type="button" onClick={() => aoMudarMes(1)} aria-label="Próximo mês" style={{ padding: '6px 12px', minHeight: 32, display: 'flex', alignItems: 'center', color: cor.fosforo }}>▶</button>
      </div>

      {/* Rosca: o total no meio, repartido por categoria na borda. */}
      <div style={{
        marginTop: 14, border: `1px solid ${cor.linha}`, borderRadius: 24,
        background: 'linear-gradient(160deg,#0E1518,#070A0C)', padding: '20px 16px 18px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}
      >
        <div style={{ position: 'relative', width: 168, height: 168 }}>
          <svg viewBox="0 0 148 148" width="168" height="168" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
            <circle cx="74" cy="74" r={RAIO} fill="none" stroke="rgba(237,243,233,.08)" strokeWidth="15" />
            {arcos.map((a) => (
              <circle
                key={a.categoria}
                cx="74" cy="74" r={RAIO} fill="none" stroke={a.cor} strokeWidth="15"
                strokeDasharray={a.dash} strokeDashoffset={a.offset} strokeLinecap="butt"
              />
            ))}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <span style={rotulo({ fontSize: 9, letterSpacing: '.2em', opacity: 0.45 })}>eu gastei</span>
            <span style={{ fontWeight: 700, fontSize: 33, lineHeight: 1 }}>{fmt0(painel.total)}</span>
            <span style={meta({ fontSize: 9.5 })}>{painel.dias_com_gasto} de {painel.dias_no_ciclo} dias</span>
          </div>
        </div>
      </div>

      {/* Sem esta linha o número da rosca fica sem referência: ele é menor que
          a fatura, e a diferença é justamente o que já estava travado. */}
      <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.7, opacity: 0.42, margin: '12px 4px 0' }}>
        Soma do que você lançou entre {dataCurta(painel.inicio_ciclo)} e {dataCurta(painel.fim_ciclo)}.
        Contas fixas e parcelas não entram aqui — elas ficam no Travado.
      </div>

      {/* Por categoria — barras-régua, tocáveis: levam ao histórico filtrado. */}
      <div style={rotulo({ margin: '24px 4px 10px' })}>Por categoria</div>
      {painel.por_categoria.length === 0 && (
        <div style={{ padding: '18px 4px', fontFamily: MONO, fontSize: 11.5, opacity: 0.45 }}>Nada lançado neste ciclo ainda.</div>
      )}
      {painel.por_categoria.map((c) => (
        <button
          key={c.categoria}
          type="button"
          onClick={() => aoFiltrarCategoria(c.categoria)}
          style={{ display: 'block', width: '100%', padding: '11px 4px', borderBottom: `1px solid ${cor.trilho}`, minHeight: 44 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, flex: 'none', background: corBarra(c.categoria) }} />
            <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', flex: 1, textAlign: 'left' }}>
              {rotuloCategoria(c.categoria)}
            </span>
            <span style={meta()}>{Math.round(c.percentual)}%</span>
            <span style={{ fontWeight: 700, fontSize: 20, lineHeight: 1 }}>{fmt0(c.valor)}</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: cor.trilho, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, width: `${(c.valor / maiorCategoria) * 100}%`, background: corBarra(c.categoria) }} />
          </div>
        </button>
      ))}

      {/* Maiores gastos */}
      <div style={rotulo({ margin: '26px 4px 6px' })}>Maiores gastos</div>
      {painel.top.length === 0 && (
        <div style={{ padding: '14px 4px', fontFamily: MONO, fontSize: 11.5, opacity: 0.45 }}>Nada lançado ainda.</div>
      )}
      {painel.top.map((g, i) => (
        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 4px', borderBottom: `1px solid ${cor.trilho}` }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: cor.fosforo, width: 16 }}>{String(i + 1).padStart(2, '0')}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.descricao}</div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.42, marginTop: 2 }}>
              {rotuloCategoria(g.categoria)} · dia {g.data_gasto.slice(8, 10)}
            </div>
          </div>
          <span style={{ fontWeight: 700, fontSize: 22 }}>{fmt0(g.valor)}</span>
        </div>
      ))}
    </div>
  );
}
