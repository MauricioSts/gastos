import { useState } from 'react';
import FormularioCompromisso from '../FormularioCompromisso';
import { fmt } from '../../utils/formato';
import { nomeMes } from '../../api';

// Compromissos do mês: contas fixas + parcelamentos, com CRUD completo.
// A fileira de ticks é o dado mais motivador do app — ver a parcela acabando.
export default function Compromissos({
  compromissos, saldo, mes, aoVerProjecao, aoSalvar, aoExcluir,
}) {
  // `edicao` guarda o que está aberto: { tipo, item } para editar,
  // { tipo, item: null } para adicionar.
  const [edicao, setEdicao] = useState(null);

  const fixas = compromissos ? compromissos.fixas : [];
  const parcelas = compromissos ? compromissos.parcelas : [];

  const aberto = (tipo, id) => edicao && edicao.tipo === tipo && (edicao.item?.id ?? null) === id;

  const salvar = async (dados) => {
    await aoSalvar(edicao.tipo, edicao.item ? edicao.item.id : null, dados);
    setEdicao(null);
  };

  const excluir = async () => {
    await aoExcluir(edicao.tipo, edicao.item.id);
    setEdicao(null);
  };

  const formulario = (tipo) => (
    <div className="py-3">
      <FormularioCompromisso
        tipo={tipo}
        inicial={edicao.item}
        mes={mes}
        aoSalvar={salvar}
        aoCancelar={() => setEdicao(null)}
        aoExcluir={edicao.item ? excluir : null}
      />
    </div>
  );

  const botaoAdicionar = (tipo, rotulo) => (
    <button
      type="button"
      onClick={() => setEdicao({ tipo, item: null })}
      className="w-full mt-3 border-2 border-[rgba(22,19,13,.35)] px-[14px] py-3 min-h-[44px] flex justify-between items-center font-mono text-[11px] tracking-[.14em] uppercase"
    >
      <span>{rotulo}</span>
      <span className="text-carimbo">+</span>
    </button>
  );

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
          {fmt(saldo ? saldo.comprometido_total : 0)}
        </div>
      </div>

      {/* ---------------------------- Contas fixas ---------------------------- */}
      <div className="font-mono text-[10px] tracking-[.2em] uppercase opacity-55 mt-[22px] mb-[2px]">
        Contas fixas
      </div>
      {fixas.length === 0 && !aberto('conta_fixa', null) && (
        <div className="py-4 font-mono text-[11.5px] opacity-50">Nenhuma conta fixa cadastrada.</div>
      )}
      {fixas.map((c) =>
        aberto('conta_fixa', c.id) ? (
          <div key={c.id}>{formulario('conta_fixa')}</div>
        ) : (
          <button
            key={c.id}
            type="button"
            onClick={() => setEdicao({ tipo: 'conta_fixa', item: c })}
            className="w-full text-left flex justify-between items-center py-3 border-b border-[rgba(22,19,13,.16)] min-h-[44px]"
          >
            <div className="flex flex-col gap-[3px]">
              <span className="font-sans text-[15px] font-medium">{c.descricao}</span>
              <span className="font-mono text-[10px] tracking-[.12em] uppercase opacity-50">
                vence dia {c.dia_vencimento} · todo mês
              </span>
            </div>
            <span className="font-valor font-bold text-[28px] leading-none">{fmt(c.valor)}</span>
          </button>
        ),
      )}
      {aberto('conta_fixa', null) ? formulario('conta_fixa') : botaoAdicionar('conta_fixa', 'Adicionar conta fixa')}

      {/* --------------------------- Parcelamentos --------------------------- */}
      <div className="font-mono text-[10px] tracking-[.2em] uppercase opacity-55 mt-6 mb-[2px]">
        Parcelamentos
      </div>
      {parcelas.length === 0 && !aberto('parcelamento', null) && (
        <div className="py-4 font-mono text-[11.5px] opacity-50">Nenhum parcelamento em aberto.</div>
      )}
      {parcelas.map((p) =>
        aberto('parcelamento', p.id) ? (
          <div key={p.id}>{formulario('parcelamento')}</div>
        ) : (
          <button
            key={p.id}
            type="button"
            onClick={() => setEdicao({ tipo: 'parcelamento', item: p })}
            className="w-full text-left py-[13px] border-b border-[rgba(22,19,13,.16)]"
          >
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
          </button>
        ),
      )}
      {aberto('parcelamento', null)
        ? formulario('parcelamento')
        : botaoAdicionar('parcelamento', 'Adicionar parcelamento')}

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
