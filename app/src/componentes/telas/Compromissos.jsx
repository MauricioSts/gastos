import { fmt } from '../../utils/formato';
import { nomeMes } from '../../api';

// Compromissos do mês: contas fixas + parcelamentos.
// A fileira de ticks é o dado mais motivador do app — ver a parcela acabando.
export default function Compromissos({ compromissos, saldo, mes, aoVerProjecao }) {
  const fixas = compromissos ? compromissos.fixas : [];
  const parcelas = compromissos ? compromissos.parcelas : [];
  const total = [...fixas, ...parcelas].reduce((s, c) => s + (c.valor ?? c.valor_parcela), 0);

  return (
    <div className="px-5 pt-[18px] pb-[10px]">
      {/* Bloco invertido: o comprometido é o que já saiu antes do mês começar. */}
      <div className="border-2 border-tinta bg-tinta text-tinta-clara px-[14px] py-3 flex justify-between items-end">
        <div>
          <div className="font-mono text-[10px] tracking-[.18em] uppercase opacity-70">
            Comprometido em {nomeMes(mes)}
          </div>
          <div className="font-mono text-[10px] opacity-50 mt-[5px]">
            {fixas.length} contas fixas · {parcelas.length} parcelamento(s)
          </div>
        </div>
        <div className="font-valor font-extrabold text-[44px] leading-[.9]">
          {fmt(saldo ? saldo.comprometido_total : total)}
        </div>
      </div>

      <div className="font-mono text-[10px] tracking-[.2em] uppercase opacity-55 mt-[22px] mb-[2px]">
        Contas fixas
      </div>
      {fixas.length === 0 && (
        <div className="py-5 font-mono text-[11.5px] opacity-50">Nenhuma conta fixa cadastrada.</div>
      )}
      {fixas.map((c) => (
        <div
          key={c.id}
          className="flex justify-between items-center py-3 border-b border-[rgba(22,19,13,.16)] min-h-[44px]"
        >
          <div className="flex flex-col gap-[3px]">
            <span className="font-sans text-[15px] font-medium">{c.descricao}</span>
            <span className="font-mono text-[10px] tracking-[.12em] uppercase opacity-50">
              vence dia {c.dia_vencimento} · todo mês
            </span>
          </div>
          <span className="font-valor font-bold text-[28px] leading-none">{fmt(c.valor)}</span>
        </div>
      ))}

      <div className="font-mono text-[10px] tracking-[.2em] uppercase opacity-55 mt-6 mb-[2px]">
        Parcelamentos
      </div>
      {parcelas.length === 0 && (
        <div className="py-5 font-mono text-[11.5px] opacity-50">Nenhum parcelamento em aberto.</div>
      )}
      {parcelas.map((p) => (
        <div key={p.id} className="py-[13px] border-b border-[rgba(22,19,13,.16)]">
          <div className="flex justify-between items-baseline">
            <span className="font-sans text-[15px] font-medium">{p.descricao}</span>
            <span className="font-valor font-bold text-[28px] leading-none">{fmt(p.valor_parcela)}</span>
          </div>
          {/* Um tick por parcela, preenchidos até a atual. */}
          <div className="flex gap-[3px] mt-[9px] mb-[6px]">
            {Array.from({ length: p.total_parcelas }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-[9px] border border-tinta"
                style={{ background: i < p.parcela_atual ? '#16130D' : 'transparent' }}
              />
            ))}
          </div>
          <div className="font-mono text-[10px] tracking-[.12em] uppercase opacity-60">
            {p.parcela_atual} de {p.total_parcelas} · termina em {nomeMes(p.mes_fim)}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={aoVerProjecao}
        className="w-full mt-[22px] border-2 border-tinta px-[15px] py-[13px] flex justify-between items-center min-h-[44px] font-mono text-[11px] tracking-[.14em] uppercase"
      >
        <span>Ver projeção de 6 meses</span>
        <span className="text-carimbo">→</span>
      </button>
    </div>
  );
}
