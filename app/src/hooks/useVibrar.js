// Vibration API. Só nos dois momentos de confirmação — não espalhe.
export function vibrar(padrao) {
  if (navigator.vibrate) navigator.vibrate(padrao);
}
