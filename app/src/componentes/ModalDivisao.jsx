import { useState } from 'react';
import { repartirCentavos, nomeMes, dataCurta } from '../api';
import { cor, MONO, SANS, rotulo, meta } from '../tema';
import { fmt, leValor } from '../utils/formato';

// Por que a sugestão é essa — a regra é do backend, a frase é daqui.
const REGRA = {
  reserva_abaixo_da_meta: 'A reserva ainda não bateu a meta: ela leva até 75% e o resto vai para as outras caixas.',
  reserva_na_meta: 'Reserva na meta: 20% ficam para manutenção e 80% vão para as outras caixas.',
  so_reserva: 'Nenhuma outra caixa com espaço: tudo vai para a reserva.',
};

const pctTexto = (p) => String(Math.round(p * 100) / 100).replace('.', ',');

// Folha de baixo com a sugestão de divisão, editável. Sem edição, o valor de
// cada caixa é o da sugestão ao centavo; editado, sai do percentual pelo maior
// resto. É o VALOR que vai para o backend: percentual com duas casas perde
// centavos (0,01% de 1.500 são 15).
export default function ModalDivisao({ divisao, liberaEm, enviando, aoFechar, aoDepositar }) {
  const { sugestao, simulacao, mes } = divisao;
  const inicial = () => Object.fromEntries(sugestao.divisao.map((d) => [d.objetivo_id, pctTexto(d.percentual)]));

  const [pcts, setPcts] = useState(inicial);
  const [editado, setEditado] = useState(false);

  const total = Math.round(sugestao.valor * 100);
  const lidos = sugestao.divisao.map((d) => (pcts[d.objetivo_id].trim() === '' ? 0 : leValor(pcts[d.objetivo_id])));
  const invalido = lidos.some((n) => n == null || n < 0 || n > 100);
  const numeros = lidos.map((n) => (n == null || n < 0 ? 0 : n));
  const soma = Math.round(numeros.reduce((a, n) => a + n, 0) * 100) / 100;
  const fecha = !invalido && Math.abs(soma - 100) <= 0.05;

  const centavos = !editado
    ? sugestao.divisao.map((d) => Math.round(d.valor * 100))
    : fecha
      ? repartirCentavos(total, numeros)
      : numeros.map((n) => Math.round((total * n) / 100));

  const mudar = (id, bruto) => {
    setPcts((p) => ({ ...p, [id]: bruto.replace(/[^\d.,]/g, '').slice(0, 6) }));
    setEditado(true);
  };

  const restaurar = () => {
    setPcts(inicial());
    setEditado(false);
  };

  const depositar = (e) => {
    // Medido antes de a folha fechar: é daqui que as moedas saem.
    const origem = e.currentTarget.getBoundingClientRect();
    aoDepositar(
      sugestao.divisao.map((d, i) => ({ objetivo_id: d.objetivo_id, valor: centavos[i] / 100 })),
      origem,
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dividir sobra do mês"
      onClick={aoFechar}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(2,4,5,.72)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        className="rolagem"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '88%', overflowY: 'auto', boxSizing: 'border-box',
          background: cor.painel, borderTop: `1px solid ${cor.linhaViva}`, borderRadius: '22px 22px 0 0',
          padding: '18px 16px', paddingBottom: 'max(22px, env(safe-area-inset-bottom))',
          animation: 'emergir .28s cubic-bezier(.2,.9,.25,1)',
          marginBottom: 'var(--teclado, 0px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={rotulo({ opacity: 0.85, color: simulacao ? cor.atencao : cor.fosforo })}>
            {simulacao ? `Simulação · ${nomeMes(mes)}` : `Sobra de ${nomeMes(mes)}`}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" style={{ minWidth: 44, minHeight: 44, textAlign: 'right', opacity: 0.5, fontSize: 15 }}>
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, opacity: 0.5 }}>R$</span>
          <span style={{ fontWeight: 700, fontSize: 46, lineHeight: 0.95 }}>{fmt(sugestao.valor)}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.7, opacity: 0.6, marginTop: 10 }}>
          {REGRA[sugestao.regra]}
        </div>

        <div style={{ ...rotulo(), display: 'flex', justifyContent: 'space-between', margin: '18px 0 2px' }}>
          <span>Caixa</span>
          <span>% · valor</span>
        </div>
        {sugestao.divisao.map((d, i) => (
          <div
            key={d.objetivo_id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${cor.divisor}` }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.nome}
              </div>
              <div style={{ height: 4, borderRadius: 2, background: cor.trilho, marginTop: 7, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, numeros[i])}%`, height: '100%', borderRadius: 2,
                  background: d.e_reserva ? cor.fosforo : cor.fosforoClaro, transition: 'width .2s',
                }}
                />
              </div>
            </div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 3, flex: 'none', width: 76, boxSizing: 'border-box',
              border: `1px solid ${lidos[i] == null || lidos[i] > 100 ? cor.alerta : 'rgba(155,255,59,.24)'}`,
              borderRadius: 10, padding: '0 8px', background: cor.fundo, minHeight: 44,
            }}
            >
              <input
                value={pcts[d.objetivo_id]}
                onChange={(e) => mudar(d.objetivo_id, e.target.value)}
                inputMode="decimal"
                aria-label={`Percentual para ${d.nome}`}
                style={{
                  width: '100%', minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
                  fontFamily: SANS, fontWeight: 700, fontSize: 18, color: cor.tinta, textAlign: 'right', padding: 0,
                }}
              />
              <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.5 }}>%</span>
            </label>
            <div style={{ width: 82, flex: 'none', textAlign: 'right', fontWeight: 700, fontSize: 18 }}>
              {fmt(centavos[i] / 100)}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, minHeight: 32 }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: fecha ? cor.fosforo : cor.alerta }}>
            {invalido
              ? 'cada caixa vai de 0 a 100%'
              : fecha
                ? 'soma 100%'
                : `soma ${pctTexto(soma)}% · ${soma < 100 ? `faltam ${pctTexto(100 - soma)}` : `passou ${pctTexto(soma - 100)}`}`}
          </span>
          {editado && (
            <button
              type="button"
              onClick={restaurar}
              style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: cor.fosforo, minHeight: 44 }}
            >
              restaurar sugestão
            </button>
          )}
        </div>

        {simulacao ? (
          <div style={{
            marginTop: 14, border: '1px dashed rgba(255,194,74,.4)', borderRadius: 16, padding: '13px 15px',
            fontFamily: MONO, fontSize: 10.5, lineHeight: 1.7, color: cor.atencao,
          }}
          >
            Só uma prévia com a previsão de hoje. O depósito libera em {dataCurta(liberaEm)}, quando o
            ciclo fecha e a sobra para de mudar.
          </div>
        ) : (
          <button
            type="button"
            disabled={!fecha || enviando}
            onClick={depositar}
            style={{
              width: '100%', marginTop: 14, minHeight: 52, borderRadius: 16, padding: '0 18px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: fecha ? cor.fosforo : 'rgba(237,243,233,.1)',
              color: fecha ? cor.fundo : 'rgba(237,243,233,.4)',
              fontFamily: MONO, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600,
              cursor: fecha && !enviando ? 'pointer' : 'default',
            }}
          >
            <span>{enviando ? 'Depositando…' : 'Depositar sobra do mês'}</span>
            <span>↓</span>
          </button>
        )}

        <div style={meta({ marginTop: 12, lineHeight: 1.7, opacity: 0.35 })}>
          Registro lógico: nenhum dinheiro sai da Caixinha Turbo.
        </div>
      </div>
    </div>
  );
}
