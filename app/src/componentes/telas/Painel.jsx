import { cor, MONO, rotulo, meta } from '../../tema';
import { fmt0 } from '../../utils/formato';
import { nomeMes, dataCurta } from '../../api';

const RAIO = 58;
const CIRC = 2 * Math.PI * RAIO;

// Painel do mês: a rosca é o gasto livre repartido por categoria — o
// comprometido não entra, porque não é escolha deste mês.
export default function Painel({
  painel, mes, mesAnterior, aoMudarMes, aoFiltrarCategoria, aoFiltrarSemana,
  rotuloCategoria, corBarra, diaHoje,
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
  const maiorDia = Math.max(1, ...painel.por_dia.map((d) => d.valor));
  const maiorSemana = Math.max(1, ...painel.por_semana.map((s) => s.valor));
  const subiu = painel.variacao != null && painel.variacao > 0;

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

      {/* Rosca + números do mês */}
      <div style={{
        marginTop: 14, border: `1px solid ${cor.linha}`, borderRadius: 24,
        background: 'linear-gradient(160deg,#0E1518,#070A0C)', padding: '18px 16px',
        display: 'flex', gap: 16, alignItems: 'center',
      }}
      >
        <div style={{ position: 'relative', width: 148, height: 148, flex: 'none' }}>
          <svg viewBox="0 0 148 148" width="148" height="148" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
            <circle cx="74" cy="74" r={RAIO} fill="none" stroke="rgba(237,243,233,.08)" strokeWidth="15" />
            {arcos.map((a) => (
              <circle
                key={a.categoria}
                cx="74" cy="74" r={RAIO} fill="none" stroke={a.cor} strokeWidth="15"
                strokeDasharray={a.dash} strokeDashoffset={a.offset} strokeLinecap="butt"
              />
            ))}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <span style={rotulo({ fontSize: 9, letterSpacing: '.2em', opacity: 0.45 })}>eu gastei</span>
            <span style={{ fontWeight: 700, fontSize: 29, lineHeight: 1 }}>{fmt0(painel.total)}</span>
            <span style={meta({ fontSize: 9.5 })}>{painel.dias_com_gasto} de {painel.dias_no_ciclo} dias</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div>
            <div style={rotulo({ fontSize: 9, letterSpacing: '.18em', opacity: 0.45 })}>Média diária</div>
            <div style={{ fontWeight: 700, fontSize: 22, lineHeight: 1.15 }}>{fmt0(painel.media_diaria)}</div>
          </div>
          <div>
            <div style={rotulo({ fontSize: 9, letterSpacing: '.18em', opacity: 0.45 })}>
              Maior dia{painel.maior_dia.valor > 0 ? ` · ${String(painel.maior_dia.dia).padStart(2, '0')}` : ''}
            </div>
            <div style={{ fontWeight: 700, fontSize: 22, lineHeight: 1.15 }}>{fmt0(painel.maior_dia.valor)}</div>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
            borderRadius: 20, padding: '5px 10px', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.04em',
            whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
            background: painel.variacao == null ? 'rgba(237,243,233,.07)' : subiu ? 'rgba(255,194,74,.12)' : 'rgba(155,255,59,.12)',
            color: painel.variacao == null ? 'rgba(237,243,233,.5)' : subiu ? cor.atencao : cor.fosforo,
          }}
          >
            {painel.variacao == null
              ? 'sem base do mês anterior'
              : `${subiu ? '▲' : '▼'} ${Math.abs(Math.round(painel.variacao))}% vs ${nomeMes(mesAnterior)}`}
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

      {/* Dia a dia do ciclo */}
      <div style={rotulo({ margin: '26px 4px 12px' })}>Dia a dia</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 96, padding: '0 2px', borderBottom: '1px solid rgba(237,243,233,.14)' }}>
        {painel.por_dia.map((d) => (
          <div key={d.data} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{
              height: d.valor ? `${Math.max(4, (d.valor / maiorDia) * 100)}%` : '2%',
              borderRadius: '2px 2px 0 0', minHeight: 2,
              background: d.dia === diaHoje ? cor.fosforoClaro : d.valor ? cor.fosforo : 'rgba(237,243,233,.12)',
            }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', opacity: 0.4 }}>
        <span>{painel.por_dia.length ? String(painel.por_dia[0].dia).padStart(2, '0') : '—'}</span>
        <span>hoje {diaHoje}</span>
        <span>{painel.por_dia.length ? String(painel.por_dia[painel.por_dia.length - 1].dia).padStart(2, '0') : '—'}</span>
      </div>

      {/* Semanas corridas do ciclo. O rótulo é a data: "S1" não diz a ninguém
          que a semana começa no dia seguinte ao fechamento da fatura. */}
      <div style={rotulo({ margin: '26px 4px 4px' })}>Por semana do ciclo</div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, lineHeight: 1.7, opacity: 0.4, margin: '0 4px 12px' }}>
        Blocos de 7 dias corridos a partir da abertura do ciclo — não são semanas
        do calendário. Toque numa semana para ver de onde saiu o valor.
      </div>
      {painel.por_semana.map((s) => (
        <button
          key={s.inicio || s.rotulo}
          type="button"
          onClick={() => aoFiltrarSemana(s)}
          style={{ display: 'block', width: '100%', minHeight: 44, padding: '10px 4px', borderBottom: `1px solid ${cor.trilho}` }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 7 }}>
            <span style={{
              fontFamily: MONO, fontSize: 10.5, letterSpacing: '.06em', flex: 1, textAlign: 'left',
              color: s.atual ? cor.fosforo : 'inherit', opacity: s.atual ? 1 : 0.75,
            }}
            >
              {dataCurta(s.inicio)} a {dataCurta(s.fim)}
            </span>
            {s.atual && (
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: cor.fosforo }}>
                em curso
              </span>
            )}
            <span style={{ fontWeight: 700, fontSize: 17, lineHeight: 1 }}>{fmt0(s.valor)}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.35 }}>›</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: cor.trilho, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, width: `${(s.valor / maiorSemana) * 100}%`,
              background: s.valor === maiorSemana && s.valor > 0 ? cor.fosforoClaro : cor.fosforo,
            }}
            />
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
