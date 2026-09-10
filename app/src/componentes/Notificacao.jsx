import Logo from './Logo';
import { cor, MONO } from '../tema';

// Aviso de fatura, no formato de notificação do iOS: desce do topo, avatar com
// o rosto do Minimau, e some com o ✕. É in-app — push de verdade exigiria
// servidor de notificação, e prometer isso na interface seria mentira.
export default function Notificacao({ titulo, texto, aoFechar }) {
  return (
    <div
      role="status"
      style={{
        position: 'absolute', top: 'max(52px, calc(env(safe-area-inset-top) + 40px))', left: 10, right: 10,
        zIndex: 50, borderRadius: 22, border: `1px solid rgba(155,255,59,.34)`,
        background: 'rgba(10,16,19,.94)', backdropFilter: 'blur(16px)', padding: '12px 14px',
        display: 'flex', gap: 12, alignItems: 'flex-start', boxShadow: '0 20px 44px rgba(0,0,0,.7)',
        animation: 'descer .55s cubic-bezier(.2,.9,.25,1)',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 11, flex: 'none', background: cor.fosforo,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      >
        <Logo tamanho={27} corOlho={cor.fosforoClaro} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.2em', textTransform: 'uppercase', color: cor.fosforo }}>
            Minimau
          </span>
          <span style={{ fontFamily: MONO, fontSize: 9, opacity: 0.4 }}>agora</span>
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 4 }}>{titulo}</div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.55, opacity: 0.6, marginTop: 3 }}>{texto}</div>
      </div>
      <button type="button" onClick={aoFechar} aria-label="Dispensar aviso" style={{ opacity: 0.45, padding: '0 2px', fontSize: 13 }}>✕</button>
    </div>
  );
}
