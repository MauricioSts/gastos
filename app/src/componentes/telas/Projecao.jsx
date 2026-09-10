import { cor, MONO } from '../../tema';
import { fmt0 } from '../../utils/formato';
import { nomeMes } from '../../api';

// Projeção: uma linha por mês. A barra é o travado; o que sobra é o resto.
// O selo de alívio — o mês em que uma parcela morre — é o único momento de
// respiro da tela, então ele fica sozinho, com espaço em volta.
export default function Projecao({ projecao, aoVoltar }) {
  const maior = Math.max(1, ...projecao.map((m) => m.renda || m.comprometido));

  return (
    <div style={{ padding: '16px 16px 10px' }}>
      <button
        type="button"
        onClick={aoVoltar}
        style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', opacity: 0.55, marginBottom: 18, minHeight: 32 }}
      >
        ← Travado
      </button>

      <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.75, opacity: 0.5, marginBottom: 20 }}>
        A barra cheia é o que já está travado antes do mês começar. Quando uma
        parcela morre, o Minimau avisa.
      </div>

      {projecao.length === 0 && (
        <div style={{ fontFamily: MONO, fontSize: 11.5, opacity: 0.45, lineHeight: 1.7 }}>
          Sem compromissos para projetar. Cadastre uma conta fixa ou um
          parcelamento no Travado.
        </div>
      )}

      {projecao.map((m) => (
        <div key={m.mes} style={{ padding: '12px 0', borderBottom: `1px solid ${cor.trilho}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
            <span style={{
              fontFamily: MONO, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase',
              fontWeight: m.termina.length ? 600 : 400,
            }}
            >
              {nomeMes(m.mes)}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, opacity: 0.45 }}>sobram {fmt0(m.sobra)}</span>
          </div>
          <div style={{ position: 'relative', height: 22, borderRadius: 6, background: 'rgba(237,243,233,.07)', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${Math.min(100, (m.comprometido / maior) * 100)}%`,
              background: 'linear-gradient(90deg,rgba(155,255,59,.85),rgba(111,209,31,.55))',
            }}
            />
            <div style={{
              position: 'absolute', left: 9, top: 0, bottom: 0, display: 'flex', alignItems: 'center',
              fontFamily: MONO, fontSize: 10, fontWeight: 600, color: cor.fundo,
            }}
            >
              {fmt0(m.comprometido)}
            </div>
          </div>
          {m.termina.length > 0 && (
            <div style={{
              marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 20,
              background: 'rgba(155,255,59,.14)', color: cor.fosforo, padding: '5px 11px',
              fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase',
            }}
            >
              ↓ {m.termina.join(', ')} {m.termina.length > 1 ? 'acabam' : 'acaba'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
