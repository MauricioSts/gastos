// Aviso de erro acima da barra de entrada. Discreto de propósito: sem cor de
// alarme, sem ícone de aviso — só o glifo ≠ e um ✕ para dispensar.
export default function FaixaErro({ texto, aoFechar }) {
  return (
    <div
      role="status"
      className="absolute left-4 right-4 bottom-[186px] z-[32] border-[1.5px] border-tinta bg-papel-claro px-[14px] py-[11px] font-mono text-[11.5px] leading-[1.5] flex gap-[10px] items-start animate-carimbo-rapido"
    >
      <span className="opacity-50">≠</span>
      <span className="flex-1">{texto}</span>
      <button type="button" onClick={aoFechar} aria-label="Dispensar aviso" className="opacity-50 px-1">
        ✕
      </button>
    </div>
  );
}
