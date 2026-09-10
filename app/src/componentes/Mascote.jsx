import { useId } from 'react';

// O Minimau. SVG vetorial animado por CSS — nunca vídeo, GIF ou Lottie.
//
// Ele flutua (7px em 4,2s), inclina a cabeça, acena com a mão direita de
// quatro dedos (±17° em 1,15s, sem pulo) e pisca duas vezes por ciclo de 6,4s.
// A íris é a única cor que muda: `corOlho` reflete o estado do app — verde em
// repouso, laranja processando, vermelho quando o ritmo estourou.
//
// Os `id` do SVG são gerados por instância: o mesmo mascote aparece na Home e
// no Onboarding ao mesmo tempo, e `url(#...)` duplicado embaralha os clipes.
export default function Mascote({ corOlho = '#C9FF8F', largura = 104, style }) {
  const uid = useId().replace(/:/g, '');
  const id = (nome) => `${nome}${uid}`;

  return (
    <svg
      viewBox="0 0 280 306"
      width="100%"
      aria-hidden="true"
      style={{ display: 'block', width: largura, overflow: 'visible', ...style }}
    >
      <defs>
        <clipPath id={id('esfera')}><circle cx="140" cy="92" r="80" /></clipPath>
        <clipPath id={id('lente')}><circle cx="140" cy="76" r="44" /></clipPath>
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
          <stop offset="46%" stopColor="#DFE7D8" />
          <stop offset="78%" stopColor="#B4C0AC" />
          <stop offset="100%" stopColor="#8D9A87" />
        </linearGradient>
        <linearGradient id={id('metalV')} x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0%" stopColor="#F7FAF4" />
          <stop offset="52%" stopColor="#D6E0CE" />
          <stop offset="100%" stopColor="#96A390" />
        </linearGradient>
        <linearGradient id={id('placa')} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#1B2427" />
          <stop offset="60%" stopColor="#101619" />
          <stop offset="100%" stopColor="#070B0D" />
        </linearGradient>
      </defs>

      {/* A sombra respira junto com a flutuação. */}
      <ellipse
        cx="140" cy="294" rx="52" ry="7" fill="#9BFF3B" opacity=".14"
        style={{ transformOrigin: '140px 294px', animation: 'mmSombra 4.2s ease-in-out infinite' }}
      />

      <g style={{ animation: 'mmFlutuar 4.2s ease-in-out infinite' }}>
        {/* pernas */}
        <g stroke="#080C0E" strokeWidth="1.8">
          <rect x="108" y="242" width="22" height="18" rx="7" fill="#131A1D" />
          <rect x="150" y="242" width="22" height="18" rx="7" fill="#131A1D" />
          <path d="M104 258 h26 a7 7 0 0 1 7 7 v11 a6 6 0 0 1 -6 6 H100 a6 6 0 0 1 -6 -6 v-7 a11 11 0 0 1 10 -11 z" fill={`url(#${id('metal')})`} />
          <path d="M150 258 h26 a11 11 0 0 1 10 11 v7 a6 6 0 0 1 -6 6 h-30 a6 6 0 0 1 -6 -6 v-11 a7 7 0 0 1 6 -7 z" fill={`url(#${id('metal')})`} />
          <rect x="94" y="274" width="43" height="6" rx="3" fill="#0E1417" stroke="none" />
          <rect x="143" y="274" width="43" height="6" rx="3" fill="#0E1417" stroke="none" />
          <rect x="106" y="262" width="10" height="4" rx="2" fill="#9BFF3B" opacity=".85" stroke="none" />
          <rect x="164" y="262" width="10" height="4" rx="2" fill="#9BFF3B" opacity=".85" stroke="none" />
        </g>

        {/* braço esquerdo, mão aberta */}
        <g style={{ transformOrigin: '88px 192px', animation: 'mmBracoEsq 6.4s ease-in-out infinite' }}>
          <rect x="52" y="181" width="40" height="26" rx="13" fill="#131A1D" stroke="#080C0E" strokeWidth="1.6" />
          <circle cx="56" cy="196" r="13" fill="#1B2427" stroke="#080C0E" strokeWidth="1.6" />
          <rect x="43" y="192" width="27" height="46" rx="13" fill={`url(#${id('metalV')})`} stroke="#080C0E" strokeWidth="1.8" />
          <rect x="47" y="199" width="18" height="4" rx="2" fill="#9BFF3B" opacity=".7" />
          <rect x="44" y="230" width="25" height="8" rx="4" fill="#131A1D" stroke="#080C0E" strokeWidth="1.4" />
          <path d="M42 240 h29 a8 8 0 0 1 8 8 v12 a10 10 0 0 1 -10 10 H44 a8 8 0 0 1 -8 -8 v-14 a8 8 0 0 1 6 -8 z" fill={`url(#${id('metalV')})`} stroke="#080C0E" strokeWidth="1.8" />
          <g style={{ transformOrigin: '73px 246px', transform: 'rotate(24deg)' }}>
            <rect x="69" y="244" width="10.5" height="19" rx="5.25" fill={`url(#${id('metalV')})`} stroke="#080C0E" strokeWidth="1.5" />
            <path d="M71.5 253 h5.5" stroke="#080C0E" strokeWidth="1.1" opacity=".5" strokeLinecap="round" />
          </g>
          <g fill={`url(#${id('metalV')})`} stroke="#080C0E" strokeWidth="1.5">
            <g style={{ transformOrigin: '44px 268px', animation: 'mmDedo 6.4s ease-in-out infinite' }}>
              <rect x="38.5" y="266" width="11" height="16" rx="5.5" />
              <rect x="39" y="281" width="10" height="15" rx="5" />
            </g>
            <g style={{ transformOrigin: '56px 268px', animation: 'mmDedo 6.4s ease-in-out .08s infinite' }}>
              <rect x="50.5" y="267" width="11" height="17" rx="5.5" />
              <rect x="51" y="283" width="10" height="16" rx="5" />
            </g>
            <g style={{ transformOrigin: '68px 268px', animation: 'mmDedo 6.4s ease-in-out .16s infinite' }}>
              <rect x="62.5" y="266" width="11" height="16" rx="5.5" />
              <rect x="63" y="281" width="10" height="14" rx="5" />
            </g>
          </g>
          <path d="M40 248 a8 8 0 0 1 5 -5" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeOpacity=".55" strokeLinecap="round" />
        </g>

        {/* torso */}
        <g>
          <path d="M100 176 h80 a14 14 0 0 1 14 14 v30 a18 18 0 0 1 -18 18 H104 a18 18 0 0 1 -18 -18 v-30 a14 14 0 0 1 14 -14 z" fill={`url(#${id('placa')})`} stroke="#080C0E" strokeWidth="1.8" />
          <path d="M114 178 h52 a11 11 0 0 1 11 11 v25 a16 16 0 0 1 -16 16 H119 a16 16 0 0 1 -16 -16 v-25 a11 11 0 0 1 11 -11 z" fill={`url(#${id('metal')})`} stroke="#080C0E" strokeWidth="1.6" />
          <path d="M121 224 L121 192 L140 208 L159 192 L159 224" fill="none" stroke="#7CFF2E" strokeWidth="8.5" strokeLinejoin="round" strokeLinecap="round" style={{ animation: 'mmBrilhoM 2.8s ease-in-out infinite' }} />
          <path d="M121 224 L121 192 L140 208 L159 192 L159 224" fill="none" stroke="#0B1A05" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity=".45" />
          <circle cx="96" cy="200" r="8" fill="#0A0F11" stroke="#9BFF3B" strokeWidth="1.2" strokeOpacity=".45" />
          <circle cx="184" cy="200" r="8" fill="#0A0F11" stroke="#9BFF3B" strokeWidth="1.2" strokeOpacity=".45" />
          <circle cx="96" cy="200" r="2.8" fill="#9BFF3B" />
          <circle cx="184" cy="200" r="2.8" fill="#9BFF3B" />
          <rect x="102" y="230" width="76" height="8" rx="4" fill="#0A0F11" />
          <rect x="128" y="231.5" width="24" height="5" rx="2.5" fill="#9BFF3B" opacity=".55" />
          <circle cx="88" cy="192" r="17" fill="#131A1D" stroke="#080C0E" strokeWidth="1.8" />
          <circle cx="192" cy="192" r="17" fill="#131A1D" stroke="#080C0E" strokeWidth="1.8" />
          <path d="M74 186 a17 17 0 0 1 14 -11 v10 z" fill="#EDF3E9" opacity=".5" />
          <path d="M206 186 a17 17 0 0 0 -14 -11 v10 z" fill="#EDF3E9" opacity=".5" />
        </g>

        {/* cabeça */}
        <g style={{ transformOrigin: '140px 150px', animation: 'mmCabeca 6.4s ease-in-out infinite' }}>
          <circle cx="140" cy="92" r="80" fill={`url(#${id('placa')})`} />
          <g clipPath={`url(#${id('esfera')})`}>
            <ellipse cx="61" cy="92" rx="29" ry="66" fill={`url(#${id('metal')})`} stroke="#080C0E" strokeWidth="1.8" />
            <ellipse cx="219" cy="92" rx="29" ry="66" fill={`url(#${id('metal')})`} stroke="#080C0E" strokeWidth="1.8" />
            <rect x="44" y="64" width="23" height="56" rx="11.5" fill="#1B2427" stroke="#080C0E" strokeWidth="1.6" />
            <rect x="213" y="64" width="23" height="56" rx="11.5" fill="#1B2427" stroke="#080C0E" strokeWidth="1.6" />
            <rect x="49" y="73" width="13" height="38" rx="6.5" fill="#7CFF2E" opacity=".5" />
            <rect x="218" y="73" width="13" height="38" rx="6.5" fill="#7CFF2E" opacity=".5" />
            <path d="M140 12 v160" stroke="#080C0E" strokeWidth="1.3" opacity=".45" />

            {/* trilhas de circuito */}
            <g fill="none" stroke="#7CFF2E" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'mmPulso 3.2s ease-in-out infinite' }}>
              <path d="M140 20 v16 M140 28 h-18 v-14 M140 28 h18 v-14" />
              <path d="M108 46 h-16 l-9 9 v18" />
              <path d="M172 46 h16 l9 9 v18" />
              <path d="M96 74 h-14 v20 h-10" />
              <path d="M184 74 h14 v20 h10" />
              <path d="M100 116 l-13 13 v12" />
              <path d="M180 116 l13 13 v12" />
              <path d="M124 136 v16 h-16" />
              <path d="M156 136 v16 h16" />
            </g>
            <g fill="#7CFF2E">
              <circle cx="122" cy="14" r="2.8" /><circle cx="158" cy="14" r="2.8" />
              <circle cx="72" cy="94" r="2.8" /><circle cx="208" cy="94" r="2.8" />
              <circle cx="108" cy="152" r="2.8" /><circle cx="172" cy="152" r="2.8" />
            </g>
            <g fill="none" stroke="#D6FFA8" strokeWidth="1.7" strokeDasharray="5 10" strokeLinecap="round" style={{ animation: 'mmCircuito 1.9s linear infinite' }}>
              <path d="M140 20 v16" />
              <path d="M108 46 h-16 l-9 9 v18" />
              <path d="M172 46 h16 l9 9 v18" />
              <path d="M96 74 h-14 v20 h-10" />
              <path d="M184 74 h14 v20 h10" />
            </g>

            {/* engrenagens */}
            <g style={{ transformOrigin: '88px 142px', animation: 'mmEngrenagem 9s linear infinite' }}>
              <circle cx="88" cy="142" r="16" fill="#0A0F11" stroke="#7CFF2E" strokeWidth="7.5" strokeDasharray="5 6.5" opacity=".85" />
              <circle cx="88" cy="142" r="6.5" fill="#7CFF2E" opacity=".9" />
            </g>
            <g style={{ transformOrigin: '192px 142px', animation: 'mmEngrenagem 9s linear infinite reverse' }}>
              <circle cx="192" cy="142" r="16" fill="#0A0F11" stroke="#7CFF2E" strokeWidth="7.5" strokeDasharray="5 6.5" opacity=".85" />
              <circle cx="192" cy="142" r="6.5" fill="#7CFF2E" opacity=".9" />
            </g>

            {/* lente / olho */}
            <g>
              <circle cx="140" cy="76" r="48" fill="#1E2A2C" stroke="#080C0E" strokeWidth="2.2" />
              <circle cx="140" cy="76" r="48" fill="none" stroke="#EDF3E9" strokeWidth="2" strokeOpacity=".3" />
              <g style={{ transformOrigin: '140px 76px', animation: 'mmLenteGira 15s linear infinite' }}>
                <circle cx="140" cy="76" r="43" fill="none" stroke="#0A0F11" strokeWidth="5.5" strokeDasharray="10 8" />
              </g>
              <circle cx="140" cy="76" r="37" fill="#070C0D" />
              <g clipPath={`url(#${id('lente')})`}>
                <g style={{ transformOrigin: '140px 76px', animation: 'mmIris 3.6s ease-in-out infinite' }}>
                  <circle cx="140" cy="76" r="31" fill={`url(#${id('iris')})`} />
                  <circle cx="140" cy="76" r="24" fill="none" stroke="#04120A" strokeWidth="2" strokeOpacity=".5" />
                  <circle cx="140" cy="76" r="16" fill="none" stroke="#04120A" strokeWidth="2" strokeOpacity=".5" />
                  <circle cx="140" cy="76" r="8.5" fill="#04100A" />
                  <circle cx="140" cy="76" r="8.5" fill={corOlho} opacity=".8" />
                  <circle cx="140" cy="76" r="3" fill="#F4FFE6" opacity=".9" />
                </g>
                <rect x="96" y="68" width="88" height="3" fill="#D6FFA8" opacity=".4" style={{ animation: 'mmVarredura 4.6s ease-in-out infinite' }} />
                <path d="M118 52 a30 30 0 0 1 24 -10 a34 34 0 0 0 -29 19 z" fill="#FFFFFF" opacity=".45" />
                <ellipse cx="157" cy="99" rx="11" ry="4.5" fill="#FFFFFF" opacity=".13" />
                <g style={{ animation: 'mmLidTopo 6.4s cubic-bezier(.4,0,.3,1) infinite' }}>
                  <rect x="88" y="-28" width="104" height="58" fill="#141C1F" />
                  <rect x="88" y="26" width="104" height="3.2" fill="#7CFF2E" opacity=".55" />
                </g>
                <g style={{ animation: 'mmLidBase 6.4s cubic-bezier(.4,0,.3,1) infinite' }}>
                  <rect x="88" y="122" width="104" height="58" fill="#141C1F" />
                  <rect x="88" y="122" width="104" height="3.2" fill="#7CFF2E" opacity=".4" />
                </g>
              </g>
            </g>

            <circle cx="140" cy="92" r="80" fill={`url(#${id('volume')})`} />
          </g>
          <circle cx="140" cy="92" r="80" fill="none" stroke="#080C0E" strokeWidth="2.6" />
          <circle cx="140" cy="92" r="81.6" fill="none" stroke="#9BFF3B" strokeWidth="1.2" strokeOpacity=".38" />
          <path d="M129 170 h22 v9 a7 7 0 0 1 -7 7 h-8 a7 7 0 0 1 -7 -7 z" fill="#131A1D" stroke="#080C0E" strokeWidth="1.5" />
        </g>

        {/* braço direito: tchauzinho */}
        <g style={{ transformOrigin: '192px 192px', animation: 'mmAcenoBraco 3.2s ease-in-out infinite' }}>
          <rect x="188" y="180" width="42" height="26" rx="13" fill="#131A1D" stroke="#080C0E" strokeWidth="1.6" />
          <circle cx="228" cy="193" r="13.5" fill="#1B2427" stroke="#080C0E" strokeWidth="1.6" />
          <rect x="216" y="150" width="27" height="48" rx="13.5" fill={`url(#${id('metalV')})`} stroke="#080C0E" strokeWidth="1.8" />
          <rect x="219" y="157" width="18" height="4" rx="2" fill="#9BFF3B" opacity=".7" />
          <g style={{ transformOrigin: '231px 150px', animation: 'mmAcenoMao 1.15s ease-in-out infinite' }}>
            <rect x="217" y="142" width="28" height="11" rx="5.5" fill="#131A1D" stroke="#080C0E" strokeWidth="1.4" />
            <g fill={`url(#${id('metalV')})`} stroke="#080C0E" strokeWidth="1.6">
              <rect x="211.5" y="82" width="11.5" height="36" rx="5.75" />
              <rect x="223.5" y="76" width="11.5" height="42" rx="5.75" />
              <rect x="235.5" y="80" width="11.5" height="38" rx="5.75" />
              <rect x="247.5" y="88" width="11" height="30" rx="5.5" />
            </g>
            <g fill="none" stroke="#080C0E" strokeWidth="1.2" strokeLinecap="round" opacity=".5">
              <path d="M214.5 97 h5.5" /><path d="M226.5 92 h5.5" />
              <path d="M238.5 95 h5.5" /><path d="M250 102 h5" />
            </g>
            <path d="M220 104 h34 a12 12 0 0 1 12 12 v18 a14 14 0 0 1 -14 14 h-36 a14 14 0 0 1 -14 -14 v-18 a12 12 0 0 1 12 -12 z" fill={`url(#${id('metalV')})`} stroke="#080C0E" strokeWidth="1.9" />
            <rect x="224" y="122" width="30" height="6" rx="3" fill="#9BFF3B" opacity=".45" />
            <circle cx="239" cy="138" r="4" fill="#9BFF3B" opacity=".55" />
            <path d="M213 118 a11 11 0 0 1 8 -8" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeOpacity=".5" strokeLinecap="round" />
            <g style={{ transformOrigin: '212px 132px', transform: 'rotate(-26deg)' }}>
              <rect x="199" y="112" width="12" height="28" rx="6" fill={`url(#${id('metalV')})`} stroke="#080C0E" strokeWidth="1.7" />
              <path d="M202 126 h6" stroke="#080C0E" strokeWidth="1.2" strokeLinecap="round" opacity=".5" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
