import { useState } from 'react';
import { leValor } from '../utils/formato';
import { cor, MONO, SANS } from '../tema';

// Card de compromisso recorrente. Visualmente distinto do card comum — faixa
// sólida em fósforo e halo — porque o que ele grava vai pesar em vários meses,
// não num lançamento só. Nada vira recorrente sem passar por aqui.
export default function CardSugestao({ tipo, sugestao, aoDescartar, aoCadastrar }) {
  const ehParcelamento = tipo === 'parcelamento';
  const [valor, setValor] = useState(
    String((ehParcelamento ? sugestao.valor_parcela : sugestao.valor) ?? 0).replace('.', ','),
  );
  const [campo2, setCampo2] = useState(
    String((ehParcelamento ? sugestao.total_parcelas : sugestao.dia_vencimento) ?? ''),
  );

  const texto = ehParcelamento
    ? `“${sugestao.descricao}” parece um parcelamento. Vai pesar no travado de vários meses.`
    : `“${sugestao.descricao}” parece uma conta fixa. Vai se repetir todo mês até você desativar.`;

  const legenda = ehParcelamento ? 'valor da parcela · total de parcelas' : 'valor · dia de vencimento';

  const acao = {
    flex: 1, padding: 13, textAlign: 'center', fontFamily: MONO, fontSize: 10.5,
    letterSpacing: '.14em', textTransform: 'uppercase', minHeight: 44,
  };

  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 180, zIndex: 33, borderRadius: 22,
      border: `1px solid ${cor.fosforo}`, background: cor.painel, overflow: 'hidden',
      animation: 'emergir .34s cubic-bezier(.2,.9,.25,1)',
      boxShadow: '0 0 0 4px rgba(155,255,59,.1),0 22px 50px rgba(0,0,0,.7)',
    }}
    >
      <div style={{
        background: cor.fosforo, color: cor.fundo, padding: '9px 14px', fontFamily: MONO,
        fontSize: 9.5, letterSpacing: '.2em', textTransform: 'uppercase', fontWeight: 600,
      }}
      >
        Isto vai se repetir — confirme
      </div>

      <div style={{ padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, opacity: 0.8 }}>{texto}</div>
        <div style={{ display: 'flex', gap: 9 }}>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            aria-label={ehParcelamento ? 'Valor da parcela' : 'Valor mensal'}
            style={{
              width: 112, border: `1px solid ${cor.linhaViva}`, borderRadius: 12, background: cor.fundo,
              padding: '5px 10px', fontFamily: SANS, fontWeight: 700, fontSize: 28, color: cor.tinta, outline: 'none',
            }}
          />
          <input
            value={campo2}
            onChange={(e) => setCampo2(e.target.value)}
            inputMode="numeric"
            aria-label={ehParcelamento ? 'Total de parcelas' : 'Dia de vencimento'}
            style={{
              flex: 1, minWidth: 0, border: `1px solid rgba(237,243,233,.18)`, borderRadius: 12,
              background: cor.fundo, padding: '10px 12px', fontFamily: MONO, fontSize: 14,
              color: cor.tinta, outline: 'none', minHeight: 44,
            }}
          />
        </div>
        <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.45, letterSpacing: '.1em', textTransform: 'uppercase' }}>
          {legenda}
        </div>
      </div>

      <div style={{ display: 'flex', borderTop: `1px solid ${cor.divisorForte}` }}>
        <button type="button" onClick={aoDescartar} style={{ ...acao, borderRight: `1px solid ${cor.divisorForte}` }}>
          Descartar
        </button>
        <button
          type="button"
          onClick={() => aoCadastrar({ valor: leValor(valor) ?? 0, campo2: parseInt(campo2, 10) || 1 })}
          style={{ ...acao, background: cor.fosforo, color: cor.fundo, fontWeight: 600 }}
        >
          Cadastrar
        </button>
      </div>
    </div>
  );
}
