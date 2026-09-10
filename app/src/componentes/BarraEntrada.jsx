import { useRef, useState } from 'react';
import { usePlaceholder } from '../hooks/usePlaceholder';
import { vibrar } from '../hooks/useVibrar';
import { cor, MONO } from '../tema';

const TELAS = [
  ['home', 'Hoje'],
  ['painel', 'Painel'],
  ['historico', 'Histórico'],
  ['compromissos', 'Travado'],
  ['config', 'Ajustes'],
];

// Barra de entrada + navegação. Fixas na base em todas as telas, acima da
// safe area da home bar do iPhone. O app inteiro se comanda daqui: escrever
// em português normal é a interação principal, não um atalho.
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
    r.onresult = (ev) => aoMudar(Array.from(ev.results).map((x) => x[0].transcript).join(''));
    r.onend = () => setOuvindo(false);
    r.onerror = () => { setOuvindo(false); aoErro('Não consegui ouvir. Tente digitar.'); };
    reconhecimento.current = r;
    r.start();
    setOuvindo(true);
    vibrar(8);
  };

  const ativo = (t) => tela === t || (t === 'compromissos' && tela === 'projecao');

  return (
    <div style={{
      flex: 'none', position: 'relative', zIndex: 30,
      background: 'linear-gradient(180deg,rgba(5,8,10,.6),#070B0D 22%)',
      borderTop: `1px solid rgba(155,255,59,.2)`,
    }}
    >
      {/* Processando: tracejado que corre, nunca spinner. */}
      {processando && <div className="esteira" style={{ height: 3 }} />}

      <div style={{ padding: '11px 14px 6px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <input
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') aoEnviar(); }}
          placeholder={placeholder}
          aria-label="Escreva o gasto"
          enterKeyHint="send"
          style={{
            flex: 1, width: '100%', boxSizing: 'border-box', border: `1px solid ${cor.linhaViva}`,
            borderRadius: 24, background: cor.painel, padding: '13px 16px',
            fontFamily: MONO, fontSize: 16, color: cor.tinta, outline: 'none', minHeight: 46,
          }}
        />
        <button
          type="button"
          onClick={ditar}
          aria-label={ouvindo ? 'Parar de ouvir' : 'Ditar gasto'}
          style={{
            width: 46, height: 46, flex: 'none', borderRadius: 23, border: `1px solid ${cor.linhaViva}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            background: ouvindo ? cor.fosforo : 'transparent',
            color: ouvindo ? cor.fundo : cor.fosforo,
          }}
        >
          ◍
        </button>
        <button
          type="button"
          onClick={aoEnviar}
          aria-label="Registrar"
          style={{
            width: 46, height: 46, flex: 'none', borderRadius: 23, background: cor.fosforo,
            color: cor.fundo, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700,
          }}
        >
          ↵
        </button>
      </div>

      {/* 30px cobrem a home bar quando não há safe area (navegador). */}
      <div style={{ display: 'flex', padding: '4px 8px', paddingBottom: 'max(30px, env(safe-area-inset-bottom))' }}>
        {TELAS.map(([t, texto]) => {
          const on = ativo(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => aoNavegar(t)}
              aria-current={on ? 'page' : undefined}
              style={{
                flex: 1, minHeight: 44, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 5, fontFamily: MONO, fontSize: 8.5,
                letterSpacing: '.12em', textTransform: 'uppercase',
                color: on ? cor.fosforo : 'rgba(237,243,233,.38)',
              }}
            >
              <span style={{
                width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center',
                justifyContent: 'center', border: `1px solid ${on ? cor.fosforo : 'rgba(237,243,233,.22)'}`,
                background: on ? 'rgba(155,255,59,.14)' : 'transparent',
              }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 2, background: on ? cor.fosforo : 'rgba(237,243,233,.3)' }} />
              </span>
              <span>{texto}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
