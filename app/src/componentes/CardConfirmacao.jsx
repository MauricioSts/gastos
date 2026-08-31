import { useEffect, useState } from 'react';
import { LISTA_CAT, ROTULO_CAT } from '../api';
import { fmt, leValor } from '../utils/formato';

// Card que flutua acima da barra de entrada logo depois de registrar algo.
// Serve aos dois sentidos do dinheiro:
//   gasto   -> valor e categoria editáveis aqui mesmo, sem modal
//   entrada -> só o valor; uma entrada de renda não tem categoria
// A contagem regressiva é real: ao chegar a zero o card some sozinho e o
// lançamento fica como está.
export default function CardConfirmacao({
  gasto, entrada, segundosIniciais = 5, aoDesfazer, aoConfirmar,
}) {
  const ehEntrada = Boolean(entrada);
  const registro = entrada || gasto;

  const [valor, setValor] = useState(registro.valor.toFixed(2));
  const [categoria, setCategoria] = useState(gasto ? gasto.categoria : null);
  const [segundos, setSegundos] = useState(segundosIniciais);

  // segundosIniciais = 0 significa "aberto para edição", sem contagem.
  useEffect(() => {
    if (segundosIniciais === 0) return undefined;
    const t = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) { clearInterval(t); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [segundosIniciais]);

  // Some sozinho ao fim da contagem, mantendo o que foi registrado.
  useEffect(() => {
    if (segundosIniciais > 0 && segundos === 0) aoConfirmar(null);
  }, [segundos, segundosIniciais, aoConfirmar]);

  return (
    <div className="absolute left-[14px] right-[14px] bottom-[176px] z-[33] border-2 border-tinta bg-papel-claro animate-carimbo shadow-[6px_6px_0_rgba(22,19,13,.9)]">
      <div className="bg-tinta text-tinta-clara px-3 py-[7px] font-mono text-[10px] tracking-[.2em] uppercase flex justify-between">
        <span>{ehEntrada ? 'Recebido' : 'Registrado'}</span>
        <span className="opacity-60">{segundos > 0 ? `desfazer ${segundos}s` : 'editando'}</span>
      </div>

      <div className="px-[14px] py-3 flex items-center gap-[10px]">
        {/* O "+" é a única marca de direção: entrada soma, gasto subtrai. */}
        {ehEntrada && (
          <span className="font-valor font-extrabold text-[36px] leading-none text-carimbo">+</span>
        )}
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          aria-label={ehEntrada ? 'Valor recebido' : 'Valor do gasto'}
          className="w-[118px] border-[1.5px] border-tinta bg-papel px-2 py-1 font-valor font-extrabold text-[36px] text-tinta outline-none"
        />
        {ehEntrada ? (
          <span className="flex-1 font-mono text-[11px] tracking-[.1em] uppercase opacity-55">
            entra no mês
          </span>
        ) : (
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            aria-label="Categoria do gasto"
            className="flex-1 border-[1.5px] border-tinta bg-papel px-2 py-[9px] font-mono text-[11px] tracking-[.1em] uppercase text-tinta outline-none min-h-[44px]"
          >
            {LISTA_CAT.map((c) => (
              <option key={c} value={c}>{ROTULO_CAT[c]}</option>
            ))}
          </select>
        )}
      </div>

      <div className="px-[14px] pb-[10px] font-mono text-[11px] opacity-60">
        {registro.descricao}
      </div>

      <div className="flex border-t-[1.5px] border-tinta">
        <button
          type="button"
          onClick={aoDesfazer}
          className="flex-1 p-3 text-center font-mono text-[11px] tracking-[.14em] uppercase border-r-[1.5px] border-tinta min-h-[44px]"
        >
          Desfazer
        </button>
        <button
          type="button"
          onClick={() => aoConfirmar(
            ehEntrada
              ? { valor: leValor(valor) ?? registro.valor }
              : { valor: leValor(valor) ?? registro.valor, categoria },
          )}
          className="flex-1 p-3 text-center bg-carimbo text-tinta-clara font-mono text-[11px] tracking-[.14em] uppercase min-h-[44px]"
        >
          Ok
        </button>
      </div>
    </div>
  );
}
