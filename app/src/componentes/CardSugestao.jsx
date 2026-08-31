import { useState } from 'react';
import { leValor } from '../utils/formato';

// Card de compromisso recorrente. Visualmente distinto do card comum — borda,
// sombra e faixa em carimbo — porque o que ele grava vai pesar em vários meses,
// não em um lançamento só. Nada vira recorrente sem passar por aqui.
export default function CardSugestao({ tipo, sugestao, aoDescartar, aoCadastrar }) {
  const ehParcelamento = tipo === 'parcelamento';
  const [valor, setValor] = useState(
    String((ehParcelamento ? sugestao.valor_parcela : sugestao.valor) ?? 0).replace('.', ','),
  );
  const [campo2, setCampo2] = useState(
    String((ehParcelamento ? sugestao.total_parcelas : sugestao.dia_vencimento) ?? ''),
  );

  const texto = ehParcelamento
    ? `“${sugestao.descricao}” parece um parcelamento. Vai pesar no comprometido de vários meses.`
    : `“${sugestao.descricao}” parece uma conta fixa. Vai se repetir todo mês até você desativar.`;

  const legenda = ehParcelamento
    ? 'valor da parcela · total de parcelas'
    : 'valor · dia de vencimento';

  return (
    <div className="absolute left-[14px] right-[14px] bottom-[176px] z-[33] border-2 border-carimbo bg-papel-claro animate-carimbo shadow-[6px_6px_0_#D2360A]">
      <div className="bg-carimbo text-tinta-clara px-3 py-[7px] font-mono text-[10px] tracking-[.2em] uppercase">
        Isto vai se repetir — confirme
      </div>

      <div className="px-[14px] py-3 flex flex-col gap-[10px]">
        <div className="font-mono text-[11.5px] leading-[1.55]">{texto}</div>
        <div className="flex gap-2">
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            aria-label={ehParcelamento ? 'Valor da parcela' : 'Valor mensal'}
            className="w-[110px] border-[1.5px] border-tinta bg-papel px-2 py-1 font-valor font-extrabold text-[32px] text-tinta outline-none"
          />
          <input
            value={campo2}
            onChange={(e) => setCampo2(e.target.value)}
            inputMode="numeric"
            aria-label={ehParcelamento ? 'Total de parcelas' : 'Dia de vencimento'}
            className="flex-1 border-[1.5px] border-tinta bg-papel px-[10px] py-[9px] font-mono text-[14px] text-tinta outline-none min-h-[44px]"
          />
        </div>
        <div className="font-mono text-[10px] opacity-55 tracking-[.1em] uppercase">{legenda}</div>
      </div>

      <div className="flex border-t-[1.5px] border-tinta">
        <button
          type="button"
          onClick={aoDescartar}
          className="flex-1 p-3 text-center font-mono text-[11px] tracking-[.14em] uppercase border-r-[1.5px] border-tinta min-h-[44px]"
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={() => aoCadastrar({ valor: leValor(valor) ?? 0, campo2: parseInt(campo2, 10) || 1 })}
          className="flex-1 p-3 text-center bg-tinta text-tinta-clara font-mono text-[11px] tracking-[.14em] uppercase min-h-[44px]"
        >
          Cadastrar
        </button>
      </div>
    </div>
  );
}
