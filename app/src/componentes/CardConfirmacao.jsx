import { useEffect, useState } from 'react';
import { LISTA_CAT, ROTULO_CAT } from '../api';
import { leValor } from '../utils/formato';
import { cor, MONO, SANS } from '../tema';

// Card que emerge acima da barra logo depois de registrar algo. Serve aos dois
// sentidos do dinheiro:
//   gasto   -> valor e categoria editáveis aqui mesmo, sem modal
//   entrada -> só o valor; uma entrada de renda não tem categoria
// A contagem é real: ao chegar a zero o card some e o lançamento fica como está.
export default function CardConfirmacao({ gasto, entrada, segundosIniciais = 5, aoDesfazer, aoConfirmar }) {
  const ehEntrada = Boolean(entrada);
  const registro = entrada || gasto;

  const [valor, setValor] = useState(registro.valor.toFixed(2));
  const [categoria, setCategoria] = useState(gasto ? gasto.categoria : null);
  const [segundos, setSegundos] = useState(segundosIniciais);

  // segundosIniciais = 0 significa "aberto para edição", sem contagem.
  useEffect(() => {
    if (segundosIniciais === 0) return undefined;
    const t = setInterval(() => setSegundos((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [segundosIniciais]);

  useEffect(() => {
    if (segundosIniciais > 0 && segundos === 0) aoConfirmar(null);
  }, [segundos, segundosIniciais, aoConfirmar]);

  const acao = {
    flex: 1, padding: 13, textAlign: 'center', fontFamily: MONO, fontSize: 10.5,
    letterSpacing: '.14em', textTransform: 'uppercase', minHeight: 44,
  };

  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 180, zIndex: 33, borderRadius: 22,
      border: `1px solid rgba(155,255,59,.3)`, background: cor.painel, overflow: 'hidden',
      animation: 'emergir .34s cubic-bezier(.2,.9,.25,1)', boxShadow: '0 22px 50px rgba(0,0,0,.7)',
    }}
    >
      <div style={{
        background: 'rgba(155,255,59,.12)', padding: '9px 14px', fontFamily: MONO, fontSize: 9.5,
        letterSpacing: '.2em', textTransform: 'uppercase', display: 'flex',
        justifyContent: 'space-between', color: cor.fosforo,
      }}
      >
        <span>{ehEntrada ? 'Recebido' : 'Anotado'}</span>
        <span style={{ opacity: 0.65 }}>{segundos > 0 ? `desfazer ${segundos}s` : 'editando'}</span>
      </div>

      <div style={{ padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* O "+" é a única marca de direção: entrada soma, gasto subtrai. */}
        {ehEntrada && <span style={{ fontWeight: 700, fontSize: 32, lineHeight: 1, color: cor.fosforo }}>+</span>}
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          aria-label={ehEntrada ? 'Valor recebido' : 'Valor do gasto'}
          style={{
            width: 120, border: `1px solid ${cor.linhaViva}`, borderRadius: 12, background: cor.fundo,
            padding: '5px 10px', fontFamily: SANS, fontWeight: 700, fontSize: 32, color: cor.tinta, outline: 'none',
          }}
        />
        {ehEntrada ? (
          <span style={{ flex: 1, fontFamily: MONO, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', opacity: 0.55 }}>
            entra no mês
          </span>
        ) : (
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            aria-label="Categoria do gasto"
            style={{
              flex: 1, border: `1px solid rgba(237,243,233,.18)`, borderRadius: 12, background: cor.fundo,
              padding: '10px 8px', fontFamily: MONO, fontSize: 11, letterSpacing: '.08em',
              textTransform: 'uppercase', color: cor.tinta, outline: 'none', minHeight: 44,
            }}
          >
            {LISTA_CAT.map((c) => <option key={c} value={c}>{ROTULO_CAT[c]}</option>)}
          </select>
        )}
      </div>

      <div style={{ padding: '0 14px 11px', fontFamily: MONO, fontSize: 11, opacity: 0.55 }}>{registro.descricao}</div>

      <div style={{ display: 'flex', borderTop: `1px solid ${cor.divisorForte}` }}>
        <button type="button" onClick={aoDesfazer} style={{ ...acao, borderRight: `1px solid ${cor.divisorForte}` }}>
          Desfazer
        </button>
        <button
          type="button"
          onClick={() => aoConfirmar(
            ehEntrada
              ? { valor: leValor(valor) ?? registro.valor }
              : { valor: leValor(valor) ?? registro.valor, categoria },
          )}
          style={{ ...acao, background: cor.fosforo, color: cor.fundo, fontWeight: 600 }}
        >
          Ok
        </button>
      </div>
    </div>
  );
}
