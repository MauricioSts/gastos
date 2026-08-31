/** @type {import('tailwindcss').Config} */
// Paleta e tipografia da direcao "folha de escrituracao".
// Os valores sao exatos: nao existem variacoes, tons intermediarios
// nem escala de cinza neste app.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        papel: '#E8E2D4',          // fundo de todas as telas
        'papel-claro': '#F4EFE2',  // inputs e barras vazias
        tinta: '#16130D',          // texto, bordas, gasto livre, telas invertidas
        'tinta-clara': '#F6F1E4',  // texto sobre tinta e sobre carimbo
        carimbo: '#D2360A',        // acento unico: centavos, ritmo, destrutivas
        moldura: '#211E17',        // fundo fora do device (so no preview)
      },
      fontFamily: {
        // Big Shoulders e o heroi: exclusivo de valores em reais.
        valor: ['"Big Shoulders Display"', 'sans-serif'],
        // Plex Mono e todo o aparato contabil: labels, botoes, navegacao.
        mono: ['"IBM Plex Mono"', 'monospace'],
        // Plex Sans e so descricao de lancamento.
        sans: ['"IBM Plex Sans"', 'sans-serif'],
      },
      borderRadius: {
        // Raio zero em tudo, sempre. O unico arredondado do mock e o bezel
        // do iPhone, que nao faz parte do app.
        DEFAULT: '0',
      },
      keyframes: {
        carimbo: {
          '0%': { transform: 'scale(.9) rotate(-2deg)', opacity: '0' },
          '55%': { transform: 'scale(1.04) rotate(.5deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0)', opacity: '1' },
        },
        correr: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '44px 0' },
        },
        subirValor: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        carimbo: 'carimbo .34s cubic-bezier(.2,.9,.25,1)',
        'carimbo-rapido': 'carimbo .28s ease-out',
        correr: 'correr .7s linear infinite',
        subirValor: 'subirValor .45s cubic-bezier(.2,.9,.25,1)',
      },
    },
  },
  plugins: [],
};
