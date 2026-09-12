// Controle do splash que vive no index.html.
//
// O splash nao e enfeite: ele e o que a pessoa ve enquanto o JS baixa, o React
// monta e o primeiro numero chega. Ele pinta no primeiro byte do HTML, antes de
// qualquer arquivo externo, e sai quando o app tem conteudo de verdade.
//
// A logo pisca duas vezes nos primeiros ~600ms. Com service worker o app fica
// pronto em ~150ms, e sair nesse instante cortaria a piscada no meio -- viraria
// um lampejo, nao uma piscada. Dai o tempo minimo: e o custo declarado de ter
// a logo piscando antes de abrir, e esta calibrado para as duas piscadas
// terminarem pouco antes dele.
const MINIMO_MS = 700;

// Marco zero: quando o modulo e avaliado, o HTML ja pintou o splash.
const inicio = Date.now();
let saindo = false;

export function esconderSplash() {
  if (saindo) return;
  saindo = true;

  const sai = () => {
    const el = document.getElementById('splash');
    if (!el) return;
    el.classList.add('sai');
    // Sair de cena nao basta: o SVG animado continuaria consumindo GPU atras
    // do app. O tempo bate com a transicao declarada no index.html.
    setTimeout(() => el.remove(), 400);
  };

  const decorrido = Date.now() - inicio;
  if (decorrido >= MINIMO_MS) sai();
  else setTimeout(sai, MINIMO_MS - decorrido);
}
