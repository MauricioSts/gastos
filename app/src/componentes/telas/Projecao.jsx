import { fmt0 } from '../../utils/formato';
import { nomeMes } from '../../api';

// Projeção do comprometido. A barra cheia é o que já está travado antes do mês
// começar; o selo carimbo marca o mês em que um parcelamento acaba — o único
// ponto vermelho da tela, porque é o momento de alívio.
export default function Projecao({ projecao, aoVoltar }) {
  const maior = Math.max(1, ...projecao.map((p) => p.renda || p.comprometido));

  return (
    <div className="px-5 pt-[18px] pb-[10px]">
      <button
        type="button"
        onClick={aoVoltar}
        className="font-mono text-[11px] tracking-[.14em] uppercase opacity-60 mb-4 min-h-[44px] flex items-center"
      >
        ← Compromissos
      </button>

      <div className="font-mono text-[11px] leading-[1.7] opacity-65 mb-[18px]">
        A linha é a sua renda. A coluna cheia é o que já está travado antes do mês começar.
      </div>

      {projecao.map((m) => (
        <div key={m.mes} className="py-[11px] border-b border-[rgba(22,19,13,.16)]">
          <div className="flex justify-between items-baseline mb-[6px]">
            <span
              className="font-mono text-[11px] tracking-[.16em] uppercase"
              style={{ fontWeight: m.termina.length ? 600 : 400 }}
            >
              {nomeMes(m.mes)}
            </span>
            <span className="font-mono text-[10.5px] opacity-55">sobram {fmt0(m.sobra)}</span>
          </div>

          <div className="relative h-[22px] border-[1.5px] border-tinta bg-papel-claro">
            <div
              className="absolute left-0 top-0 bottom-0 hachura"
              style={{ width: `${(m.comprometido / maior) * 100}%` }}
            />
            {/* multiply deixa o número legível por cima da hachura. */}
            <div className="absolute left-[6px] top-0 bottom-0 flex items-center font-mono text-[10px] font-semibold text-tinta mix-blend-multiply">
              {fmt0(m.comprometido)}
            </div>
          </div>

          {m.termina.length > 0 && (
            <div className="mt-[7px] inline-flex items-center gap-[6px] bg-carimbo text-tinta-clara px-[9px] py-1 font-mono text-[10px] tracking-[.12em] uppercase">
              ↓ {m.termina.join(', ')} acaba
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
