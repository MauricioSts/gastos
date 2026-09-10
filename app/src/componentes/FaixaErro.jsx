import { cor, MONO } from '../tema';

// Aviso de erro acima da barra de entrada. Discreto de propósito: sem ícone de
// alarme — só o glifo ≠ e um ✕ para dispensar.
export default function FaixaErro({ texto, aoFechar }) {
  return (
    <div
      role="status"
      style={{
        position: 'absolute', left: 14, right: 14, bottom: 190, zIndex: 32,
        borderRadius: 16, border: `1px solid rgba(255,90,60,.5)`, background: 'rgba(24,12,10,.95)',
        padding: '12px 14px', fontFamily: MONO, fontSize: 11, lineHeight: 1.55,
        display: 'flex', gap: 10, alignItems: 'flex-start', animation: 'emergir .3s ease-out',
      }}
    >
      <span style={{ color: cor.alerta }}>≠</span>
      <span style={{ flex: 1 }}>{texto}</span>
      <button type="button" onClick={aoFechar} aria-label="Dispensar aviso" style={{ opacity: 0.5, padding: '0 4px' }}>✕</button>
    </div>
  );
}
