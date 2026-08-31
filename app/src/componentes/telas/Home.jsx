import LinhaLancamento from '../LinhaLancamento';
import { fmt, fmt0 } from '../../utils/formato';
import { MESES } from '../../api';

// Régua do mês: 24 blocos. Os primeiros N hachurados (comprometido), os
// seguintes M sólidos (gasto livre), o resto vazio (disponível).
function Regua({ saldo }) {
  const blocos = [];
  if (saldo && saldo.renda_total) {
    const nc = Math.round((saldo.comprometido_total / saldo.renda_total) * 24);
    const nl = Math.round((saldo.gasto_livre / saldo.renda_total) * 24);
    for (let i = 0; i < 24; i += 1) {
      blocos.push(i < nc ? 'hachura' : i < nc + nl ? 'solido' : 'vazio');
    }
  }

  return (
    <div className="px-5 pt-4">
      <div className="flex h-[18px] border-2 border-tinta">
        {blocos.map((tipo, i) => (
          <div
            key={i}
            className={`flex-1 border-r border-[rgba(22,19,13,.2)] ${tipo === 'hachura' ? 'hachura' : ''}`}
            style={{ background: tipo === 'solido' ? '#16130D' : undefined }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 font-mono text-[10.5px] tracking-[.1em] uppercase">
        <span className="flex items-center gap-[6px]">
          <span className="w-[11px] h-[11px] border border-tinta hachura" />
          comprometido
        </span>
        <span className="flex items-center gap-[6px]">
          <span className="w-[11px] h-[11px] bg-tinta" />
          gasto livre
        </span>
        <span className="opacity-55">{saldo ? saldo.dias_restantes : '—'}d restantes</span>
      </div>
    </div>
  );
}

export default function Home({ saldo, gastos, mes, quando, aoEditar, aoExcluir }) {
  const disponivel = saldo ? saldo.disponivel : null;
  const [inteiro, centavos] = (disponivel == null ? '—,—' : fmt(disponivel)).split(',');
  const ultimoDia = new Date(Date.UTC(Number(mes.split('-')[0]), Number(mes.split('-')[1]), 0)).getUTCDate();

  return (
    <div className="pb-2">
      <div className="px-5 pt-[18px]">
        <div className="font-mono text-[11px] tracking-[.2em] uppercase opacity-60">
          Disponível de fato
        </div>

        {/* key força o remount a cada mudança de valor: o número re-anima. */}
        <div
          key={String(disponivel)}
          className="flex items-end gap-[6px] -mt-[2px] animate-subirValor"
        >
          <span className="font-mono text-[17px] font-semibold pb-[15px]">R$</span>
          <span className="font-valor font-extrabold text-[104px] leading-[.82] tracking-[-.01em]">
            {inteiro}
            {/* Os centavos do herói são a única coisa impressa em carimbo aqui. */}
            <span className="text-carimbo">,{centavos}</span>
          </span>
        </div>

        {/* Decomposição sempre visível: sem ela o número não se explica. */}
        <div className="font-mono text-[11.5px] tracking-[.02em] mt-[10px] flex flex-wrap gap-[6px] items-baseline">
          <span className="opacity-55">Renda</span>
          <span className="font-semibold">{saldo ? fmt0(saldo.renda_total) : '—'}</span>
          <span className="opacity-40">−</span>
          <span className="opacity-55">Comprometido</span>
          <span className="font-semibold text-carimbo">{saldo ? fmt0(saldo.comprometido_total) : '—'}</span>
          <span className="opacity-40">−</span>
          <span className="opacity-55">Gasto</span>
          <span className="font-semibold">{saldo ? fmt0(saldo.gasto_livre) : '—'}</span>
        </div>
      </div>

      <Regua saldo={saldo} />

      <div className="mx-5 mt-4 border-2 border-tinta flex items-stretch">
        <div className="flex-1 px-[14px] py-[11px]">
          <div className="font-mono text-[11px] tracking-[.16em] uppercase opacity-65">Ritmo diário</div>
          <div className="font-mono text-[10.5px] opacity-45 mt-1">
            até {ultimoDia} de {MESES[Number(mes.split('-')[1]) - 1]}
          </div>
        </div>
        <div className="bg-carimbo text-tinta-clara px-[15px] py-[9px] flex items-baseline gap-1">
          <span className="font-valor font-extrabold text-[44px] leading-none">
            {saldo ? fmt(saldo.ritmo_diario) : '—'}
          </span>
          <span className="font-mono text-[10px] tracking-[.1em]">/DIA</span>
        </div>
      </div>

      <div className="px-5 pt-5">
        <div className="flex justify-between font-mono text-[10px] tracking-[.2em] uppercase opacity-55 border-b border-tinta pb-[6px]">
          <span>Últimos lançamentos</span>
          <span>Valor</span>
        </div>

        {gastos.length === 0 ? (
          // Nunca "R$ 0,00": folha em branco é outra coisa.
          <div className="py-[26px] font-mono text-[12px] opacity-50 leading-[1.6]">
            Folha em branco.
            <br />
            Registre o primeiro gasto abaixo.
          </div>
        ) : (
          gastos.slice(0, 5).map((g) => (
            <LinhaLancamento
              key={g.id}
              gasto={g}
              quando={quando(g.data_gasto)}
              valorFonte={30}
              onEditar={aoEditar}
              onExcluir={aoExcluir}
            />
          ))
        )}
      </div>
    </div>
  );
}
