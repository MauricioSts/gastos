import { useState } from 'react';
import { LISTA_CAT, ROTULO_CAT } from '../api';
import { leValor } from '../utils/formato';
import { cor, MONO, SANS } from '../tema';

// Formulário de conta fixa ou parcelamento. Um só componente para os dois
// tipos, usado no Travado e no Onboarding.
//
// O campo que justifica este formulário existir é `parcela_atual`: sem ele,
// cadastrar uma compra que já está na 9ª de 12 parcelas é impossível, e o
// travado dos meses seguintes fica errado até a última parcela.
export default function FormularioCompromisso({
  tipo, inicial = null, mes, aoSalvar, aoCancelar, aoExcluir,
}) {
  const ehParcelamento = tipo === 'parcelamento';

  const [descricao, setDescricao] = useState(inicial?.descricao || '');
  const [valor, setValor] = useState(
    inicial ? String(ehParcelamento ? inicial.valor_parcela : inicial.valor).replace('.', ',') : '',
  );
  const [dia, setDia] = useState(String(inicial?.dia_vencimento || ''));
  const [totalParcelas, setTotalParcelas] = useState(String(inicial?.total_parcelas || ''));
  const [parcelaAtual, setParcelaAtual] = useState(String(inicial?.parcela_atual || '1'));
  const [categoria, setCategoria] = useState(inicial?.categoria || (ehParcelamento ? 'compras' : 'contas'));
  const [ativa, setAtiva] = useState(inicial ? inicial.ativa !== 0 : true);
  const [aviso, setAviso] = useState('');

  const campo = {
    boxSizing: 'border-box', width: '100%', border: `1px solid rgba(155,255,59,.24)`,
    borderRadius: 12, background: cor.fundo, padding: '10px 12px',
    fontFamily: MONO, fontSize: 16, color: cor.tinta, outline: 'none', minHeight: 44,
  };

  const Rotulo = ({ children }) => (
    <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase', opacity: 0.45, marginBottom: 6 }}>
      {children}
    </div>
  );

  const salvar = () => {
    const nome = descricao.trim();
    if (!nome) { setAviso('Dê um nome para reconhecer isto depois.'); return; }

    const v = leValor(valor);
    if (!v || v <= 0) { setAviso('Informe um valor maior que zero.'); return; }

    if (ehParcelamento) {
      const total = parseInt(totalParcelas, 10);
      const atual = parseInt(parcelaAtual, 10);
      if (!total || total < 2) { setAviso('Quantas parcelas tem no total?'); return; }
      if (!atual || atual < 1 || atual > total) {
        setAviso(`A parcela atual precisa estar entre 1 e ${total}.`);
        return;
      }
      // `mes_inicio` é o mês da parcela informada como atual. O backend deriva
      // o resto — inclusive quando as parcelas acabam.
      aoSalvar({
        descricao: nome, valor_parcela: v, total_parcelas: total,
        parcela_inicial: atual, mes_inicio: mes, categoria,
      });
      return;
    }

    const d = parseInt(dia, 10);
    if (!d || d < 1 || d > 31) { setAviso('O dia de vencimento vai de 1 a 31.'); return; }
    aoSalvar({ descricao: nome, valor: v, dia_vencimento: d, categoria, ativa });
  };

  return (
    <div style={{
      border: `1px solid ${cor.linhaViva}`, borderRadius: 18, background: cor.painel,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 14,
      animation: 'emergir .28s cubic-bezier(.2,.9,.25,1)',
    }}
    >
      <div>
        <Rotulo>{ehParcelamento ? 'O que você comprou' : 'Que conta é essa'}</Rotulo>
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={ehParcelamento ? 'celular' : 'internet'}
          aria-label="Descrição"
          style={{ ...campo, fontFamily: SANS }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Rotulo>{ehParcelamento ? 'Valor da parcela' : 'Valor mensal'}</Rotulo>
          <div style={{ ...campo, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px' }}>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, opacity: 0.45 }}>R$</span>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder={ehParcelamento ? '180' : '99'}
              aria-label={ehParcelamento ? 'Valor da parcela' : 'Valor mensal'}
              style={{
                flex: 1, width: '100%', border: 'none', background: 'transparent', outline: 'none',
                fontFamily: SANS, fontWeight: 700, fontSize: 30, color: cor.tinta, padding: 0,
              }}
            />
          </div>
        </div>

        {!ehParcelamento && (
          <div style={{ width: 104 }}>
            <Rotulo>Vence dia</Rotulo>
            <input
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              inputMode="numeric"
              placeholder="10"
              aria-label="Dia de vencimento"
              style={{ ...campo, textAlign: 'center' }}
            />
          </div>
        )}
      </div>

      {ehParcelamento && (
        <div>
          <Rotulo>Em que parcela você está</Rotulo>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              value={parcelaAtual}
              onChange={(e) => setParcelaAtual(e.target.value)}
              inputMode="numeric"
              placeholder="9"
              aria-label="Parcela atual"
              style={{ ...campo, width: 76, textAlign: 'center' }}
            />
            <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', opacity: 0.45 }}>de</span>
            <input
              value={totalParcelas}
              onChange={(e) => setTotalParcelas(e.target.value)}
              inputMode="numeric"
              placeholder="12"
              aria-label="Total de parcelas"
              style={{ ...campo, width: 76, textAlign: 'center' }}
            />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.45, marginTop: 7, lineHeight: 1.7 }}>
            Se você já pagou 8 de 12, está na 9. As parcelas param de contar sozinhas quando acabam.
          </div>
        </div>
      )}

      <div>
        <Rotulo>Categoria</Rotulo>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Categoria"
          style={{ ...campo, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}
        >
          {LISTA_CAT.map((k) => <option key={k} value={k}>{ROTULO_CAT[k]}</option>)}
        </select>
      </div>

      {/* Desativar preserva o histórico dos meses passados; excluir apaga. */}
      {!ehParcelamento && inicial && (
        <button
          type="button"
          onClick={() => setAtiva((a) => !a)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', minHeight: 44 }}
        >
          <span style={{
            width: 18, height: 18, borderRadius: 5, flex: 'none',
            border: `1px solid ${cor.fosforo}`, background: ativa ? cor.fosforo : 'transparent',
          }}
          />
          <span style={{ opacity: ativa ? 1 : 0.55 }}>{ativa ? 'Ativa · conta todo mês' : 'Desativada · não conta mais'}</span>
        </button>
      )}

      {aviso && (
        <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.55, display: 'flex', gap: 8, color: cor.alerta }}>
          <span>≠</span>
          <span>{aviso}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={aoCancelar}
          style={{
            flex: 1, border: `1px solid rgba(237,243,233,.22)`, borderRadius: 14, padding: 12,
            textAlign: 'center', fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em',
            textTransform: 'uppercase', minHeight: 44,
          }}
        >
          Cancelar
        </button>
        {inicial && aoExcluir && (
          <button
            type="button"
            onClick={aoExcluir}
            style={{
              flex: 1, borderRadius: 14, padding: 12, textAlign: 'center', background: cor.alerta,
              color: cor.fundo, fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em',
              textTransform: 'uppercase', fontWeight: 600, minHeight: 44,
            }}
          >
            Excluir
          </button>
        )}
        <button
          type="button"
          onClick={salvar}
          style={{
            flex: 1.4, borderRadius: 14, padding: 12, textAlign: 'center', background: cor.fosforo,
            color: cor.fundo, fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em',
            textTransform: 'uppercase', fontWeight: 600, minHeight: 44,
          }}
        >
          {inicial ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </div>
  );
}
