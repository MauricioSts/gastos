import Mascote from '../Mascote';
import LinhaLancamento from '../LinhaLancamento';
import { cor, MONO, cardAlto, rotulo, meta } from '../../tema';
import { fmt, fmt0 } from '../../utils/formato';

// Régua do mês: 24 blocos. Travado em verde escuro, gasto livre em fósforo,
// o que sobra fica vazio. É a única leitura do mês inteiro que cabe numa linha.
function blocosDoMes(saldo) {
  if (!saldo || !saldo.renda_total) return [];
  const travados = Math.round((saldo.comprometido_total / saldo.renda_total) * 24);
  const livres = Math.round((saldo.gasto_livre / saldo.renda_total) * 24);
  return Array.from({ length: 24 }, (_, i) => {
    if (i < travados) return { fundo: 'rgba(155,255,59,.28)', borda: 'rgba(155,255,59,.5)' };
    if (i < travados + livres) return { fundo: cor.fosforo, borda: cor.fosforo };
    return { fundo: 'transparent', borda: 'rgba(237,243,233,.14)' };
  });
}

export default function Home({
  saldo, gastos, gastoHoje, sobraHoje, estado, fala, corOlho,
  quando, rotuloCategoria, corBarra, aoEditar, aoExcluir,
}) {
  const disponivel = saldo ? saldo.disponivel : null;
  const [inteiro, centavos] = fmt(disponivel).split(',');
  const estourou = sobraHoje < 0;
  const ritmo = saldo ? saldo.ritmo_diario : 0;
  const pctHoje = ritmo > 0 ? Math.min(100, (gastoHoje / ritmo) * 100) : 0;
  const recentes = gastos.slice(0, 5);

  return (
    <div style={{ padding: '0 0 8px' }}>
      {/* 1. O Minimau fala pelo estado do mês, nunca por texto fixo. */}
      <div
        style={{
          margin: '16px 16px 0', position: 'relative', border: `1px solid ${cor.linha}`,
          borderRadius: 22, background: cardAlto, padding: '16px 16px 16px 12px',
          display: 'flex', gap: 12, alignItems: 'center', overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', right: -30, top: -30, width: 120, height: 120, borderRadius: 60,
          background: 'radial-gradient(closest-side,rgba(155,255,59,.16),transparent)',
        }}
        />
        <Mascote corOlho={corOlho} largura={104} style={{ flex: 'none', margin: '-10px -6px -14px -6px', pointerEvents: 'none' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.22em', textTransform: 'uppercase', color: cor.fosforo, opacity: 0.8 }}>
            {estado}
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.35, marginTop: 6, textWrap: 'pretty' }}>{fala}</div>
        </div>
      </div>

      {/* 2. O número herói é o disponível de fato — nunca a renda bruta. */}
      <div style={{ padding: '22px 20px 0' }}>
        <div style={rotulo({ fontSize: 10, letterSpacing: '.24em', opacity: 0.45 })}>Disponível de fato</div>
        <div
          key={String(disponivel)}
          style={{ display: 'flex', alignItems: 'flex-end', gap: 7, marginTop: 2, animation: 'subirValor .5s cubic-bezier(.2,.9,.25,1)' }}
        >
          <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, paddingBottom: 14, opacity: 0.5 }}>R$</span>
          <span style={{ fontWeight: 700, fontSize: 82, lineHeight: 0.86, letterSpacing: '-.02em' }}>
            {inteiro}
            <span style={{ color: cor.fosforo }}>,{centavos}</span>
          </span>
        </div>
        {/* 3. Decomposição sempre visível: sem ela o herói é um número solto. */}
        <div style={{ fontFamily: MONO, fontSize: 11, marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
          <span style={{ opacity: 0.4 }}>Renda</span>
          <span style={{ fontWeight: 600 }}>{saldo ? fmt0(saldo.renda_total) : '—'}</span>
          <span style={{ opacity: 0.3 }}>−</span>
          <span style={{ opacity: 0.4 }}>Travado</span>
          <span style={{ fontWeight: 600, color: cor.fosforo }}>{saldo ? fmt0(saldo.comprometido_total) : '—'}</span>
          <span style={{ opacity: 0.3 }}>−</span>
          <span style={{ opacity: 0.4 }}>Gasto</span>
          <span style={{ fontWeight: 600 }}>{saldo ? fmt0(saldo.gasto_livre) : '—'}</span>
        </div>
      </div>

      {/* 4. Régua do mês */}
      <div style={{ padding: '18px 20px 0' }}>
        <div style={{ display: 'flex', gap: 2, height: 14 }}>
          {blocosDoMes(saldo).map((b, i) => (
            <div key={i} style={{ flex: 1, borderRadius: 2, border: `1px solid ${b.borda}`, background: b.fundo }} />
          ))}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 9,
          fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.6,
        }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(155,255,59,.28)', border: '1px solid rgba(155,255,59,.5)' }} />
            travado
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: cor.fosforo }} />
            eu gastei
          </span>
          <span>{saldo ? saldo.dias_restantes : '—'}d restantes</span>
        </div>
      </div>

      {/* 5. Ritmo do dia x o que sobrou dele */}
      <div style={{ margin: '20px 16px 0', border: `1px solid ${cor.linha}`, borderRadius: 22, overflow: 'hidden', background: cor.painel }}>
        <div style={{ display: 'flex' }}>
          <div style={{ flex: 1, padding: '13px 16px', borderRight: '1px solid rgba(237,243,233,.1)' }}>
            <div style={rotulo({ letterSpacing: '.2em', opacity: 0.45 })}>Ritmo do dia</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 5 }}>
              <span style={{ fontWeight: 700, fontSize: 34, lineHeight: 1 }}>{saldo ? fmt(ritmo) : '—'}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', opacity: 0.45 }}>/DIA</span>
            </div>
          </div>
          <div style={{ flex: 1, padding: '13px 16px', background: estourou ? 'rgba(255,90,60,.1)' : 'rgba(155,255,59,.08)' }}>
            <div style={rotulo({
              letterSpacing: '.2em', opacity: 1,
              color: estourou ? 'rgba(255,90,60,.8)' : 'rgba(155,255,59,.75)',
            })}
            >
              {estourou ? 'Passou hoje' : 'Sobra hoje'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 5 }}>
              <span style={{ fontWeight: 700, fontSize: 34, lineHeight: 1, color: estourou ? cor.alerta : cor.fosforo }}>
                {saldo ? fmt(Math.abs(sobraHoje)) : '—'}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', color: estourou ? 'rgba(255,90,60,.8)' : 'rgba(155,255,59,.75)' }}>
                HOJE
              </span>
            </div>
          </div>
        </div>
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(237,243,233,.09)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${pctHoje}%`, background: estourou ? cor.alerta : cor.fosforo, borderRadius: 4 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, ...meta({ opacity: 0.5 }) }}>
            <span>gastei {fmt(gastoHoje)} hoje</span>
            <span>{estourou ? 'ritmo do dia estourado' : `${Math.round(pctHoje)}% do ritmo usado`}</span>
          </div>
        </div>
      </div>

      {/* 6. Últimos lançamentos */}
      <div style={{ padding: '24px 20px 0' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', paddingBottom: 8,
          borderBottom: '1px solid rgba(237,243,233,.12)', ...rotulo(),
        }}
        >
          <span>Últimos lançamentos</span>
          <span>Valor</span>
        </div>
        {recentes.length === 0 ? (
          <div style={{ padding: '28px 0', fontFamily: MONO, fontSize: 11.5, opacity: 0.45, lineHeight: 1.7 }}>
            Memória vazia.
            <br />
            Diga o primeiro gasto ao Minimau ali embaixo.
          </div>
        ) : (
          recentes.map((g) => (
            <LinhaLancamento
              key={g.id}
              gasto={g}
              quando={quando}
              corBarra={corBarra(g.categoria)}
              rotuloCategoria={rotuloCategoria(g.categoria)}
              aoEditar={aoEditar}
              aoExcluir={aoExcluir}
            />
          ))
        )}
      </div>
    </div>
  );
}
