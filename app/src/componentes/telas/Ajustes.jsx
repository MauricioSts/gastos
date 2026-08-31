import { useEffect, useState } from 'react';
import { nomeMes, USAR_MOCK } from '../../api';
import { fmt } from '../../utils/formato';

// Configurações: renda do mês, status da conexão, exportar CSV e refazer o
// onboarding.
export default function Ajustes({
  mes, saldo, rendas, aoSalvarRenda, aoRemoverRenda, aoTestarSaude, aoExportar, aoRefazer,
}) {
  const [renda, setRenda] = useState('');
  const [saude, setSaude] = useState('não testado');

  // O campo edita só a linha fixa "Renda" (o salário). As outras entradas do
  // mês — um pix lançado pelo chat, por exemplo — aparecem na lista abaixo e
  // não são tocadas ao salvar.
  const principal = (rendas?.entradas || []).find((r) => r.descricao === 'Renda');
  const extras = (rendas?.entradas || []).filter((r) => r.descricao !== 'Renda');

  useEffect(() => {
    setRenda(principal ? String(principal.valor) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal?.id, principal?.valor, mes]);

  const testar = async () => {
    setSaude('testando…');
    const h = await aoTestarSaude();
    setSaude(h.ok ? `online · ${h.modo} · ${h.latencia_ms}ms` : 'offline');
  };

  return (
    <div className="px-5 pt-[18px] pb-[10px]">
      <div className="font-mono text-[10px] tracking-[.2em] uppercase opacity-55">
        Renda de {nomeMes(mes)}
      </div>
      <div className="flex items-center gap-[10px] border-2 border-tinta px-[14px] py-[10px] mt-2 bg-papel-claro">
        <span className="font-mono text-[15px] font-semibold opacity-60">R$</span>
        <input
          value={renda}
          onChange={(e) => setRenda(e.target.value)}
          inputMode="decimal"
          aria-label="Renda do mês"
          className="flex-1 w-full border-none bg-transparent outline-none font-valor font-extrabold text-[40px] text-tinta p-0"
        />
        <button
          type="button"
          onClick={() => aoSalvarRenda(renda)}
          className="bg-tinta text-tinta-clara px-[14px] py-[10px] min-h-[44px] flex items-center font-mono text-[11px] tracking-[.14em]"
        >
          SALVAR
        </button>
      </div>

      {extras.length > 0 && (
        <>
          <div className="font-mono text-[10px] tracking-[.2em] uppercase opacity-55 mt-[22px] mb-1">
            Outras entradas de {nomeMes(mes)}
          </div>
          {extras.map((r) => (
            <div
              key={r.id}
              className="flex justify-between items-center gap-3 py-[10px] border-b border-[rgba(22,19,13,.16)] min-h-[44px]"
            >
              <span className="font-sans text-[15px] font-medium truncate">{r.descricao}</span>
              <div className="flex items-center gap-3 flex-none">
                <span className="font-valor font-bold text-[26px] leading-none text-carimbo">
                  +{fmt(r.valor)}
                </span>
                <button
                  type="button"
                  onClick={() => aoRemoverRenda(r.id)}
                  aria-label={`Remover ${r.descricao}`}
                  className="opacity-50 px-2 min-h-[44px] text-[15px]"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div className="font-mono text-[10px] opacity-45 mt-2 leading-[1.6]">
            Total do mês: {fmt(saldo ? saldo.renda_total : 0)} — salário mais entradas.
          </div>
        </>
      )}

      <div className="font-mono text-[10px] tracking-[.2em] uppercase opacity-55 mt-[26px] mb-2">
        Conexão
      </div>
      <div className="border-2 border-tinta px-[14px] py-3 flex justify-between items-center min-h-[44px]">
        <span className="font-mono text-[11.5px]">{saude}</span>
        <button
          type="button"
          onClick={testar}
          className="font-mono text-[10px] tracking-[.14em] uppercase text-carimbo py-2"
        >
          testar
        </button>
      </div>

      <div className="font-mono text-[10px] tracking-[.2em] uppercase opacity-55 mt-[26px] mb-2">
        Dados
      </div>
      <button
        type="button"
        onClick={aoExportar}
        className="w-full border-2 border-tinta px-[14px] py-[13px] min-h-[44px] flex justify-between items-center font-mono text-[11px] tracking-[.14em] uppercase"
      >
        <span>Exportar CSV</span>
        <span className="text-carimbo">↓</span>
      </button>
      <button
        type="button"
        onClick={aoRefazer}
        className="w-full border-2 border-[rgba(22,19,13,.35)] px-[14px] py-[13px] mt-[10px] min-h-[44px] flex justify-between items-center font-mono text-[11px] tracking-[.14em] uppercase opacity-70"
      >
        <span>Refazer configuração inicial</span>
        <span>↺</span>
      </button>

      <div className="font-mono text-[10px] opacity-40 mt-[22px] leading-[1.7]">
        {USAR_MOCK
          ? 'Dados mockados. Defina VITE_USAR_MOCK=false e VITE_API_URL para plugar o backend.'
          : 'Conectado ao backend real. A camada de API está isolada em src/api/index.js.'}
      </div>
    </div>
  );
}
