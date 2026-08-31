import { useEffect } from 'react';

// No iOS o teclado não redimensiona a viewport: ele cobre a tela. Sem isto a
// barra de entrada fica escondida atrás do teclado. `visualViewport` diz quanto
// da tela sumiu, e empurramos a barra para cima na mesma medida.
export function useTecladoIOS() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;

    const ajustar = () => {
      const coberto = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--teclado', `${coberto}px`);
    };

    ajustar();
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    return () => {
      vv.removeEventListener('resize', ajustar);
      vv.removeEventListener('scroll', ajustar);
    };
  }, []);
}
