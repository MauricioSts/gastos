import { useEffect, useState } from 'react';
import { LISTA_CAT, ROTULO_CAT } from '../api';
import { leValor } from '../utils/formato';

// Card que flutua acima da barra de entrada logo depois de registrar um gasto.
// Valor e categoria são editáveis aqui mesmo, sem modal. A contagem regressiva
// é real: ao chegar a zero o card some sozinho e o gasto fica como está.
export default function CardConfirmacao({ gasto, segundosIniciais = 5, aoDesfazer, aoConfirmar }) {
  const [valor, setValor] = useState(gasto.valor.toFixed(2));
  const [categoria, setCategoria] = useState(gasto.categoria);
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
        <span>Registrado</span>
        <span className="opacity-60">{segundos > 0 ? `desfazer ${segundos}s` : 'editando'}</span>
      </div>

      <div className="px-[14px] py-3 flex items-center gap-[10px]">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          aria-label="Valor do gasto"
          className="w-[118px] border-[1.5px] border-tinta bg-papel px-2 py-1 font-valor font-extrabold text-[36px] text-tinta outline-none"
        />
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
      </div>

      <div className="px-[14px] pb-[10px] font-mono text-[11px] opacity-60">{gasto.descricao}</div>

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
          onClick={() => aoConfirmar({ valor: leValor(valor) ?? gasto.valor, categoria })}
          className="flex-1 p-3 text-center bg-carimbo text-tinta-clara font-mono text-[11px] tracking-[.14em] uppercase min-h-[44px]"
        >
          Ok
        </button>
      </div>
    </div>
  );
}
