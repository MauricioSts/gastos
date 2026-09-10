import { useId } from 'react';

// O rosto do Minimau em viewBox quadrado — a mesma cabeça do mascote, sem
// corpo. É a logo: cabeçalho (22px), avatar da notificação e ícone do PWA.
export default function Logo({ corOlho = '#C9FF8F', tamanho = 22, style }) {
  const uid = useId().replace(/:/g, '');
  const id = (nome) => `${nome}${uid}`;

  return (
    <svg
      viewBox="0 0 168 168"
      width={tamanho}
      height={tamanho}
      aria-hidden="true"
      style={{ display: 'block', flex: 'none', ...style }}
    >
      <defs>
        <clipPath id={id('esfera')}><circle cx="84" cy="84" r="80" /></clipPath>
        <clipPath id={id('lente')}><circle cx="84" cy="76" r="44" /></clipPath>
        <radialGradient id={id('iris')} cx="40%" cy="32%" r="74%">
          <stop offset="0%" stopColor="#CDF6A2" />
          <stop offset="26%" stopColor="#79D63A" />
          <stop offset="64%" stopColor="#20560E" />
          <stop offset="100%" stopColor="#040C05" />
        </radialGradient>
        <radialGradient id={id('volume')} cx="33%" cy="24%" r="80%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity=".18" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity=".5" />
        </radialGradient>
        <linearGradient id={id('metal')} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#FBFDF8" />
          <stop offset="52%" stopColor="#DCE5D5" />
          <stop offset="100%" stopColor="#8D9A87" />
        </linearGradient>
        <linearGradient id={id('placa')} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#1B2427" />
          <stop offset="60%" stopColor="#101619" />
          <stop offset="100%" stopColor="#070B0D" />
        </linearGradient>
      </defs>

      <circle cx="84" cy="84" r="80" fill={`url(#${id('placa')})`} />
      <g clipPath={`url(#${id('esfera')})`}>
        <ellipse cx="5" cy="84" rx="29" ry="66" fill={`url(#${id('metal')})`} stroke="#080C0E" strokeWidth="1.8" />
        <ellipse cx="163" cy="84" rx="29" ry="66" fill={`url(#${id('metal')})`} stroke="#080C0E" strokeWidth="1.8" />
        <path d="M84 4 v160" stroke="#080C0E" strokeWidth="1.3" opacity=".45" />

        <g fill="none" stroke="#7CFF2E" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'mlPulso 3.2s ease-in-out infinite' }}>
          <path d="M84 12 v16 M84 20 h-18 v-14 M84 20 h18 v-14" />
          <path d="M52 40 h-16 l-9 9 v16" />
          <path d="M116 40 h16 l9 9 v16" />
          <path d="M44 112 l-12 12 v10" />
          <path d="M124 112 l12 12 v10" />
          <path d="M68 130 v14 h-16" />
          <path d="M100 130 v14 h16" />
        </g>
        <g fill="#7CFF2E">
          <circle cx="66" cy="6" r="2.8" /><circle cx="102" cy="6" r="2.8" />
          <circle cx="52" cy="144" r="2.8" /><circle cx="116" cy="144" r="2.8" />
        </g>

        <g style={{ transformOrigin: '34px 136px', animation: 'mlGira 9s linear infinite' }}>
          <circle cx="34" cy="136" r="15" fill="#0A0F11" stroke="#7CFF2E" strokeWidth="7" strokeDasharray="5 6.5" opacity=".85" />
          <circle cx="34" cy="136" r="6" fill="#7CFF2E" opacity=".9" />
        </g>
        <g style={{ transformOrigin: '134px 136px', animation: 'mlGira 9s linear infinite reverse' }}>
          <circle cx="134" cy="136" r="15" fill="#0A0F11" stroke="#7CFF2E" strokeWidth="7" strokeDasharray="5 6.5" opacity=".85" />
          <circle cx="134" cy="136" r="6" fill="#7CFF2E" opacity=".9" />
        </g>

        <circle cx="84" cy="76" r="48" fill="#1E2A2C" stroke="#080C0E" strokeWidth="2.2" />
        <circle cx="84" cy="76" r="48" fill="none" stroke="#EDF3E9" strokeWidth="2" strokeOpacity=".3" />
        <g style={{ transformOrigin: '84px 76px', animation: 'mlGira 15s linear infinite' }}>
          <circle cx="84" cy="76" r="43" fill="none" stroke="#0A0F11" strokeWidth="5.5" strokeDasharray="10 8" />
        </g>
        <circle cx="84" cy="76" r="37" fill="#070C0D" />
        <g clipPath={`url(#${id('lente')})`}>
          <g style={{ transformOrigin: '84px 76px', animation: 'mlIris 3.6s ease-in-out infinite' }}>
            <circle cx="84" cy="76" r="31" fill={`url(#${id('iris')})`} />
            <circle cx="84" cy="76" r="24" fill="none" stroke="#04120A" strokeWidth="2" strokeOpacity=".5" />
            <circle cx="84" cy="76" r="16" fill="none" stroke="#04120A" strokeWidth="2" strokeOpacity=".5" />
            <circle cx="84" cy="76" r="8.5" fill="#04100A" />
            <circle cx="84" cy="76" r="8.5" fill={corOlho} opacity=".8" />
            <circle cx="84" cy="76" r="3" fill="#F4FFE6" opacity=".9" />
          </g>
          <path d="M62 52 a30 30 0 0 1 24 -10 a34 34 0 0 0 -29 19 z" fill="#FFFFFF" opacity=".45" />
          <ellipse cx="101" cy="99" rx="11" ry="4.5" fill="#FFFFFF" opacity=".13" />
          <g style={{ animation: 'mlLidTopo 5.6s cubic-bezier(.4,0,.3,1) infinite' }}>
            <rect x="32" y="-30" width="104" height="58" fill="#141C1F" />
            <rect x="32" y="24" width="104" height="3.2" fill="#7CFF2E" opacity=".55" />
          </g>
          <g style={{ animation: 'mlLidBase 5.6s cubic-bezier(.4,0,.3,1) infinite' }}>
            <rect x="32" y="124" width="104" height="58" fill="#141C1F" />
            <rect x="32" y="124" width="104" height="3.2" fill="#7CFF2E" opacity=".4" />
          </g>
        </g>

        <circle cx="84" cy="84" r="80" fill={`url(#${id('volume')})`} />
      </g>
      <circle cx="84" cy="84" r="80" fill="none" stroke="#080C0E" strokeWidth="2.6" />
      <circle cx="84" cy="84" r="81.4" fill="none" stroke="#9BFF3B" strokeWidth="1.2" strokeOpacity=".38" />
    </svg>
  );
}
