import { useEffect, useState } from 'react';
import { nomeMes, USAR_MOCK } from '../../api';

// Configurações: renda do mês, status da conexão, exportar CSV e refazer o
// onboarding.
export default function Ajustes({ mes, saldo, aoSalvarRenda, aoTestarSaude, aoExportar, aoRefazer }) {
  const [renda, setRenda] = useState('');
  const [saude, setSaude] = useState('não testado');

  // Sincroniza o campo quando o saldo chega ou o mês muda.
  useEffect(() => {
    setRenda(saldo && saldo.renda_total ? String(saldo.renda_total) : '');
  }, [saldo, mes]);

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
