import { useState } from 'react';
import { leValor } from '../../utils/formato';

// Tela cheia invertida. Aparece sempre que renda_definida === false: sem renda
// o saldo não significa nada. Só o passo 1 é obrigatório.
const PASSOS = {
  1: {
    titulo: 'Quanto entra este mês?',
    texto: 'Sem renda, o saldo não significa nada. É o único passo obrigatório.',
    prefixo: 'R$', placeholder: '1700', botao: 'Continuar', podePular: false,
  },
  2: {
    titulo: 'Contas fixas',
    texto: 'Aluguel, internet, luz. Recorrem todo mês até você desativar.',
    prefixo: 'R$', placeholder: '99', botao: 'Adicionar', podePular: true,
  },
  3: {
    titulo: 'Parcelas em aberto',
    texto: 'Valor da parcela. Depois você diz qual parcela está pagando agora.',
    prefixo: 'R$', placeholder: '180', botao: 'Concluir', podePular: true,
  },
};

export default function Onboarding({ aoConcluirPasso, aoPular }) {
  const [passo, setPasso] = useState(1);
  const [campo, setCampo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const cfg = PASSOS[passo];

  const avancar = async () => {
    const valor = leValor(campo);
    // A renda é obrigatória: sem valor o passo 1 não avança.
    if (passo === 1 && !valor) return;
    setSalvando(true);
    await aoConcluirPasso(passo, valor);
    setSalvando(false);
    setCampo('');
    if (passo < 3) setPasso(passo + 1);
  };

  const pular = () => {
    setCampo('');
    if (passo < 3) setPasso(passo + 1);
    else aoPular();
  };

  return (
    <div
      className="absolute inset-0 z-[38] bg-tinta text-tinta-clara flex flex-col box-border px-[26px]"
      style={{
        paddingTop: 'max(70px, calc(env(safe-area-inset-top) + 46px))',
        paddingBottom: 'max(44px, calc(env(safe-area-inset-bottom) + 20px))',
      }}
    >
      <div className="font-mono text-[10px] tracking-[.24em] uppercase opacity-50">
        Folha nova · passo {passo} de 3
      </div>
      <div className="font-valor font-extrabold text-[56px] leading-[.92] mt-4 max-w-[280px]">
        {cfg.titulo}
      </div>
      <div className="font-mono text-[12px] leading-[1.65] opacity-65 mt-[14px] max-w-[300px]">
        {cfg.texto}
      </div>

      {/* Campo único com underline, sem caixa. */}
      <div className="mt-[34px] flex items-center gap-[10px] border-b-2 border-tinta-clara pb-[6px]">
        <span className="font-mono text-[16px] opacity-55">{cfg.prefixo}</span>
        <input
          value={campo}
          onChange={(e) => setCampo(e.target.value)}
          inputMode="decimal"
          placeholder={cfg.placeholder}
          aria-label={cfg.titulo}
          autoFocus
          className="flex-1 w-full border-none bg-transparent outline-none font-valor font-extrabold text-[52px] text-tinta-clara p-0 placeholder:opacity-40"
        />
      </div>

      <div className="flex-1" />

      <div className="flex gap-[10px]">
        {cfg.podePular && (
          <button
            type="button"
            onClick={pular}
            className="flex-1 border-2 border-[rgba(246,241,228,.4)] p-[15px] text-center font-mono text-[11px] tracking-[.16em] uppercase min-h-[44px]"
          >
            Pular
          </button>
        )}
        <button
          type="button"
          onClick={avancar}
          disabled={salvando}
          className="flex-[2] bg-carimbo text-tinta-clara p-[15px] text-center font-mono text-[11px] tracking-[.16em] uppercase min-h-[44px] disabled:opacity-60"
        >
          {salvando ? 'Salvando…' : cfg.botao}
        </button>
      </div>
    </div>
  );
}
