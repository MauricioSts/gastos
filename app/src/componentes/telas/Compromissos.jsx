import { useState } from 'react';
import FormularioCompromisso from '../FormularioCompromisso';
import { cor, MONO, rotulo, meta } from '../../tema';
import { fmt } from '../../utils/formato';
import { nomeMes } from '../../api';

// Travado: o que já saiu antes do mês começar — contas fixas + parcelamentos.
// A fileira de ticks é o dado mais motivador do app: dá para ver a parcela
// acabando. Tocar em qualquer linha abre a edição.
export default function Compromissos({ compromissos, saldo, mes, aoVerProjecao, aoSalvar, aoExcluir }) {
  // `edicao` guarda o que está aberto: { tipo, item } edita, item null adiciona.
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
    <div style={{ padding: '12px 0' }}>
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

  const botaoAdicionar = (tipo, texto) => (
    <button
      type="button"
      onClick={() => setEdicao({ tipo, item: null })}
      style={{
        width: '100%', marginTop: 12, border: `1px dashed rgba(155,255,59,.3)`, borderRadius: 14,
        padding: '13px 15px', minHeight: 44, display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase',
      }}
    >
      <span style={{ opacity: 0.75 }}>{texto}</span>
      <span style={{ color: cor.fosforo }}>+</span>
    </button>
  );

  return (
    <div style={{ padding: '16px 16px 10px' }}>
      {/* Bloco de topo: o total travado é o número que manda nesta tela. */}
      <div style={{
        border: `1px solid ${cor.linhaViva}`, borderRadius: 22, padding: '15px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        background: 'linear-gradient(150deg,#101A0C,#080C0A)',
      }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={rotulo({ letterSpacing: '.2em', opacity: 0.85, color: cor.fosforo })}>
            Travado em {nomeMes(mes)}
          </div>
          <div style={meta({ marginTop: 6, whiteSpace: 'nowrap' })}>
            {fixas.length} {fixas.length === 1 ? 'fixa' : 'fixas'} · {parcelas.length} {parcelas.length === 1 ? 'parcela' : 'parcelas'}
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 40, lineHeight: 0.9, color: cor.fosforo }}>
          {fmt(saldo ? saldo.comprometido_total : 0)}
        </div>
      </div>

      {/* ----------------------------- Contas fixas ---------------------------- */}
      <div style={rotulo({ margin: '24px 4px 2px' })}>Contas fixas</div>
      {fixas.length === 0 && !aberto('conta_fixa', null) && (
        <div style={{ padding: '16px 4px', fontFamily: MONO, fontSize: 11.5, opacity: 0.45 }}>
          Nenhuma conta fixa cadastrada.
        </div>
      )}
      {fixas.map((c) => (aberto('conta_fixa', c.id) ? (
        <div key={c.id}>{formulario('conta_fixa')}</div>
      ) : (
        <button
          key={c.id}
          type="button"
          onClick={() => setEdicao({ tipo: 'conta_fixa', item: c })}
          style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '13px 4px', borderBottom: `1px solid ${cor.divisor}`, minHeight: 44,
            opacity: c.ativa === 0 ? 0.45 : 1,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{c.descricao}</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.42 }}>
              vence dia {c.dia_vencimento} · todo mês
            </span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 24, lineHeight: 1 }}>{fmt(c.valor)}</span>
        </button>
      )))}
      {aberto('conta_fixa', null) ? formulario('conta_fixa') : botaoAdicionar('conta_fixa', 'Adicionar conta fixa')}

      {/* ---------------------------- Parcelamentos ---------------------------- */}
      <div style={rotulo({ margin: '26px 4px 2px' })}>Parcelamentos</div>
      {parcelas.length === 0 && !aberto('parcelamento', null) && (
        <div style={{ padding: '16px 4px', fontFamily: MONO, fontSize: 11.5, opacity: 0.45 }}>
          Nenhum parcelamento em aberto.
        </div>
      )}
      {parcelas.map((p) => (aberto('parcelamento', p.id) ? (
        <div key={p.id}>{formulario('parcelamento')}</div>
      ) : (
        <button
          key={p.id}
          type="button"
          onClick={() => setEdicao({ tipo: 'parcelamento', item: p })}
          style={{ width: '100%', padding: '14px 4px', borderBottom: `1px solid ${cor.divisor}`, display: 'block' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{p.descricao}</span>
            <span style={{ fontWeight: 700, fontSize: 24, lineHeight: 1 }}>{fmt(p.valor_parcela)}</span>
          </div>
          {/* Um tick por parcela, preenchidos até a atual. */}
          <div style={{ display: 'flex', gap: 3, margin: '10px 0 7px' }}>
            {Array.from({ length: p.total_parcelas }, (_, i) => (
              <div
                key={i}
                style={{
                  flex: 1, height: 7, borderRadius: 2,
                  background: i < p.parcela_atual ? cor.fosforo : 'rgba(237,243,233,.12)',
                }}
              />
            ))}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.55, textAlign: 'left' }}>
            {p.parcela_atual} de {p.total_parcelas} · termina em {nomeMes(p.mes_fim)}
          </div>
        </button>
      )))}
      {aberto('parcelamento', null) ? formulario('parcelamento') : botaoAdicionar('parcelamento', 'Adicionar parcelamento')}

      <button
        type="button"
        onClick={aoVerProjecao}
        style={{
          width: '100%', marginTop: 24, border: `1px solid rgba(155,255,59,.24)`, borderRadius: 16,
          padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          minHeight: 44, fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase',
        }}
      >
        <span>Projeção de 6 meses</span>
        <span style={{ color: cor.fosforo }}>→</span>
      </button>
    </div>
  );
}
