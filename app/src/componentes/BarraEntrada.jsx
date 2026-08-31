import { useRef, useState } from 'react';
import { usePlaceholder } from '../hooks/usePlaceholder';
import { vibrar } from '../hooks/useVibrar';

const TELAS = [
  ['home', 'Hoje'],
  ['resumo', 'Resumo'],
  ['historico', 'Histórico'],
  ['compromissos', 'Travado'],
  ['config', 'Ajustes'],
];

// Barra de entrada + navegação. Fixas na base em todas as telas, acima da
// safe area da home bar do iPhone.
export default function BarraEntrada({ valor, aoMudar, aoEnviar, processando, tela, aoNavegar, aoErro }) {
  const [ouvindo, setOuvindo] = useState(false);
  const placeholder = usePlaceholder();
  const reconhecimento = useRef(null);

  // Web Speech API. Sem suporte, avisa de leve — nunca alert.
  const ditar = () => {
    if (ouvindo) {
      reconhecimento.current?.stop();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      aoErro('Ditado indisponível neste navegador.');
      return;
    }
    const r = new SR();
    r.lang = 'pt-BR';
    r.interimResults = true;
    r.onresult = (ev) =>
      aoMudar(Array.from(ev.results).map((x) => x[0].transcript).join(''));
    r.onend = () => setOuvindo(false);
    r.onerror = () => { setOuvindo(false); aoErro('Não consegui ouvir. Tente digitar.'); };
    reconhecimento.current = r;
    r.start();
    setOuvindo(true);
    vibrar(8);
  };

  const ativo = (t) => tela === t || (t === 'compromissos' && tela === 'projecao');

  return (
    <div className="flex-none relative z-30 bg-papel border-t-2 border-tinta">
      {/* Processando: tracejado que corre, nunca spinner. */}
      {processando && <div className="h-1 correndo animate-correr" />}

      <div className="px-[14px] pt-[10px] pb-[6px] flex items-center gap-[9px]">
        <input
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') aoEnviar(); }}
          placeholder={placeholder}
          aria-label="Escreva o gasto"
          enterKeyHint="send"
          className="flex-1 w-full box-border border-2 border-tinta bg-papel-claro px-[14px] py-3 font-mono text-[16px] text-tinta outline-none min-h-[44px]"
        />
        <button
          type="button"
          onClick={ditar}
          aria-label={ouvindo ? 'Parar de ouvir' : 'Ditar gasto'}
          className={`w-[46px] h-[46px] flex-none border-2 border-tinta flex items-center justify-center text-[16px] ${
            ouvindo ? 'bg-carimbo text-tinta-clara' : 'bg-transparent text-tinta'
          }`}
        >
          ◍
        </button>
        <button
          type="button"
          onClick={aoEnviar}
          aria-label="Registrar"
          className="w-[46px] h-[46px] flex-none bg-tinta text-tinta-clara flex items-center justify-center text-[17px]"
        >
          ↵
        </button>
      </div>

      {/* pb-[30px] cobre a home bar quando não há safe area (browser). */}
      <div
        className="flex px-2 pt-[2px]"
        style={{ paddingBottom: 'max(30px, env(safe-area-inset-bottom))' }}
      >
        {TELAS.map(([t, rotulo]) => (
          <button
            key={t}
            type="button"
            onClick={() => aoNavegar(t)}
            aria-current={ativo(t) ? 'page' : undefined}
            className="flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 font-mono text-[9px] tracking-[.1em] uppercase"
            style={{ color: ativo(t) ? '#16130D' : 'rgba(22,19,13,.42)' }}
          >
            <span
              className="w-4 h-[3px]"
              style={{ background: ativo(t) ? '#D2360A' : 'transparent' }}
            />
            <span>{rotulo}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
