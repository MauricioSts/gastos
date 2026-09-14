// Voo da moeda até a caixinha: sai do botão de depósito e cai no card em arco,
// como o arquivar do Gmail — não em linha reta.
//
// Imperativo de propósito. A moeda vive 650ms e nunca é estado da tela: passar
// por React a cada quadro só custaria renderização para um enfeite. O CSS
// (`voarArco`, `cardPulse`) mora em index.css.
import { MONO } from '../tema';

// `origem` pode ser o elemento do botão ou um DOMRect já medido — o botão do
// modal some antes do voo, então quem chama mede antes de fechar.
// `containerEl` precisa ser posicionado (relative/fixed): a moeda é absoluta
// dentro dele. `alvoEl` é onde a moeda pousa dentro do card (o saldo): mirar o
// centro de um card de largura inteira, logo acima de um botão também
// centralizado, dá dx zero — e sem deslocamento lateral o arco vira uma reta.
export function dispararAnimacaoDeposito(origem, cardEl, containerEl, { arcoAltura, alvoEl, aoChegar } = {}) {
  const de = origem instanceof Element ? origem.getBoundingClientRect() : origem;
  const destino = (alvoEl || cardEl).getBoundingClientRect();
  const base = containerEl.getBoundingClientRect();

  const startX = de.left - base.left + de.width / 2;
  const startY = de.top - base.top + de.height / 2;
  const endX = destino.left - base.left + destino.width / 2;
  const endY = destino.top - base.top + destino.height / 2;

  const dx = endX - startX;
  const dy = endY - startY;

  // Ponto médio elevado = arco. Sem altura fixa: um voo longo com salto de
  // 60px parece reta, e um curto com salto grande parece pulo.
  const altura = arcoAltura ?? Math.min(150, 50 + Math.abs(dx) * 0.25 + Math.abs(dy) * 0.12);
  const dxMid = dx * 0.5;
  const dyMid = dy * 0.5 - altura;

  const moeda = document.createElement('span');
  moeda.className = 'moeda-voadora';
  moeda.setAttribute('aria-hidden', 'true');
  moeda.textContent = '$';
  Object.assign(moeda.style, {
    left: `${startX}px`,
    top: `${startY}px`,
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: MONO,
    fontSize: '13px',
    fontWeight: '700',
    color: '#05080A',
    background: 'radial-gradient(circle at 35% 30%, #E4FFC2, #9BFF3B 55%, #4E9A16)',
    boxShadow: '0 0 14px rgba(155,255,59,.55)',
  });
  moeda.style.setProperty('--dx-mid', `${dxMid}px`);
  moeda.style.setProperty('--dy-mid', `${dyMid}px`);
  moeda.style.setProperty('--dx-end', `${dx}px`);
  moeda.style.setProperty('--dy-end', `${dy}px`);
  moeda.style.setProperty('--rot-mid', dx < 0 ? '-25deg' : '25deg');
  moeda.style.setProperty('--rot-end', dx < 0 ? '-10deg' : '10deg');

  containerEl.appendChild(moeda);

  moeda.addEventListener('animationend', () => {
    moeda.remove();
    // Tirar e recolocar a classe com um reflow no meio reinicia o pulso
    // mesmo quando duas moedas chegam no mesmo card seguidas.
    cardEl.classList.remove('pulse');
    void cardEl.offsetWidth;
    cardEl.classList.add('pulse');
    if (aoChegar) aoChegar();
  }, { once: true });
}
