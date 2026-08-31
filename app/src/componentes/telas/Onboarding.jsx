import { useState } from 'react';
import FormularioCompromisso from '../FormularioCompromisso';
import { fmt, leValor } from '../../utils/formato';
import { nomeMes } from '../../api';

// Tela cheia invertida. Aparece sempre que renda_definida === false: sem renda
// o saldo não significa nada.
//
// Os passos 2 e 3 cadastram compromissos de verdade — descrição, valor,
// vencimento, categoria e, no parcelamento, em que parcela você já está.
// Chutar esses campos faria o comprometido dos próximos meses nascer errado.
export default function Onboarding({
  mes, compromissos, aoDefinirRenda, aoAdicionarCompromisso, aoRemoverCompromisso, aoConcluir,
}) {
  const [passo, setPasso] = useState(1);
  const [renda, setRenda] = useState('');
  const [formAberto, setFormAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');

  const fixas = compromissos?.fixas || [];
  const parcelas = compromissos?.parcelas || [];
  const tipo = passo === 2 ? 'conta_fixa' : 'parcelamento';
  const itens = passo === 2 ? fixas : parcelas;

  const irPara = (n) => { setPasso(n); setFormAberto(false); setAviso(''); };

  const salvarRenda = async () => {
    const v = leValor(renda);
    if (!v || v <= 0) { setAviso('A renda é o único passo obrigatório.'); return; }
    setSalvando(true);
    await aoDefinirRenda(v);
    setSalvando(false);
    irPara(2);
  };

  const adicionar = async (dados) => {
    setSalvando(true);
    await aoAdicionarCompromisso(tipo, dados);
    setSalvando(false);
    setFormAberto(false);
  };

  const conteudo = () => {
    // ---- Passo 1: renda, campo único com underline ----
    if (passo === 1) {
      return (
        <>
          <div className="font-valor font-extrabold text-[56px] leading-[.92] mt-4 max-w-[280px]">
            Quanto entra este mês?
          </div>
          <div className="font-mono text-[12px] leading-[1.65] opacity-65 mt-[14px] max-w-[300px]">
            Sem renda, o saldo não significa nada. É o único passo obrigatório.
          </div>
          <div className="mt-[34px] flex items-center gap-[10px] border-b-2 border-tinta-clara pb-[6px]">
            <span className="font-mono text-[16px] opacity-55">R$</span>
            <input
              value={renda}
              onChange={(e) => setRenda(e.target.value)}
              inputMode="decimal"
              placeholder="1700"
              aria-label="Quanto entra este mês?"
              autoFocus
              className="flex-1 w-full border-none bg-transparent outline-none font-valor font-extrabold text-[52px] text-tinta-clara p-0 placeholder:opacity-40"
            />
          </div>
          <div className="font-mono text-[10px] opacity-45 mt-3 leading-[1.6]">
            É o salário de {nomeMes(mes)}. Um pix que cair depois você lança pelo chat.
          </div>
        </>
      );
    }

    // ---- Passos 2 e 3: lista + formulário ----
    const titulo = passo === 2 ? 'Contas fixas' : 'Parcelas em aberto';
    const texto = passo === 2
      ? 'Aluguel, internet, luz. Recorrem todo mês até você desativar, e saem da renda antes de você gastar qualquer coisa.'
      : 'Compras que você ainda está pagando. Diga em que parcela está agora — assim o app sabe quando cada uma acaba.';

    return (
      <>
        <div className="font-valor font-extrabold text-[56px] leading-[.92] mt-4 max-w-[280px]">
          {titulo}
        </div>
        <div className="font-mono text-[12px] leading-[1.65] opacity-65 mt-[14px] max-w-[300px]">
          {texto}
        </div>

        {itens.length > 0 && (
          <div className="mt-6 border-t border-[rgba(246,241,228,.25)]">
            {itens.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center gap-3 py-[11px] border-b border-[rgba(246,241,228,.25)] min-h-[44px]"
              >
                <div className="flex flex-col gap-[3px] min-w-0">
                  <span className="font-sans text-[15px] font-medium truncate">{item.descricao}</span>
                  <span className="font-mono text-[10px] tracking-[.12em] uppercase opacity-50">
                    {passo === 2
                      ? `vence dia ${item.dia_vencimento}`
                      : `${item.parcela_atual} de ${item.total_parcelas}`}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-none">
                  <span className="font-valor font-bold text-[26px] leading-none">
                    {fmt(passo === 2 ? item.valor : item.valor_parcela)}
                  </span>
                  <button
                    type="button"
                    onClick={() => aoRemoverCompromisso(tipo, item.id)}
                    aria-label={`Remover ${item.descricao}`}
                    className="opacity-55 px-2 min-h-[44px] text-[15px]"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5">
          {formAberto ? (
            <FormularioCompromisso
              tipo={tipo}
              invertido
              mes={mes}
              aoSalvar={adicionar}
              aoCancelar={() => setFormAberto(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setFormAberto(true)}
              className="w-full border-2 border-[rgba(246,241,228,.4)] px-[14px] py-[13px] min-h-[44px] flex justify-between items-center font-mono text-[11px] tracking-[.14em] uppercase"
            >
              <span>{itens.length ? 'Adicionar outra' : `Adicionar ${passo === 2 ? 'conta fixa' : 'parcelamento'}`}</span>
              <span className="text-carimbo">+</span>
            </button>
          )}
        </div>
      </>
    );
  };

  return (
    <div
      className="rolagem absolute inset-0 z-[38] bg-tinta text-tinta-clara flex flex-col box-border px-[26px] overflow-y-auto"
      style={{
        paddingTop: 'max(70px, calc(env(safe-area-inset-top) + 46px))',
        paddingBottom: 'max(44px, calc(env(safe-area-inset-bottom) + 20px))',
      }}
    >
      <div className="font-mono text-[10px] tracking-[.24em] uppercase opacity-50 flex-none">
        Folha nova · passo {passo} de 3
      </div>

      <div className="flex-none">{conteudo()}</div>

      {aviso && (
        <div className="font-mono text-[11px] leading-[1.5] flex gap-2 mt-4 text-carimbo flex-none">
          <span>≠</span>
          <span>{aviso}</span>
        </div>
      )}

      <div className="flex-1 min-h-[28px]" />

      {/* Enquanto o formulário está aberto ele já tem os próprios botões. */}
      {!formAberto && (
        <div className="flex gap-[10px] flex-none">
          {passo > 1 && (
            <button
              type="button"
              onClick={() => (passo === 2 ? irPara(3) : aoConcluir())}
              className="flex-1 border-2 border-[rgba(246,241,228,.4)] p-[15px] text-center font-mono text-[11px] tracking-[.16em] uppercase min-h-[44px]"
            >
              Pular
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (passo === 1) return salvarRenda();
              return passo === 2 ? irPara(3) : aoConcluir();
            }}
            disabled={salvando}
            className="flex-[2] bg-carimbo text-tinta-clara p-[15px] text-center font-mono text-[11px] tracking-[.16em] uppercase min-h-[44px] disabled:opacity-60"
          >
            {salvando ? 'Salvando…' : passo === 3 ? 'Começar a usar' : 'Continuar'}
          </button>
        </div>
      )}
    </div>
  );
}
