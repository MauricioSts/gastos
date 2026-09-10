import { useState } from 'react';
import FormularioCompromisso from '../FormularioCompromisso';
import Mascote from '../Mascote';
import { fmt, leValor } from '../../utils/formato';
import { nomeMes, dataCurta } from '../../api';
import { cor, MONO, SANS } from '../../tema';

// Tela cheia sobre gradiente escuro. Aparece sempre que renda_definida ===
// false: sem renda o saldo não significa nada.
//
// Os passos 2 e 3 cadastram compromissos de verdade — descrição, valor,
// vencimento, categoria e, no parcelamento, em que parcela você já está.
// Chutar esses campos faria o travado dos próximos meses nascer errado.
export default function Onboarding({
  mes, ciclo, compromissos, aoDefinirRenda, aoAdicionarCompromisso, aoRemoverCompromisso, aoConcluir,
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

  const titulo = { 1: 'Quanto entra este mês?', 2: 'Contas fixas', 3: 'Parcelas em aberto' }[passo];
  const texto = {
    1: 'Sem renda o saldo não significa nada. É o único passo obrigatório.',
    2: 'Aluguel, internet, luz. Recorrem todo mês até você desativar, e saem da renda antes de você gastar qualquer coisa.',
    3: 'Compras que você ainda está pagando. Diga em que parcela está agora — assim o Minimau sabe quando cada uma acaba.',
  }[passo];

  const botao = (extra = {}) => ({
    borderRadius: 16, padding: 16, textAlign: 'center', fontFamily: MONO, fontSize: 10.5,
    letterSpacing: '.16em', textTransform: 'uppercase', minHeight: 44, ...extra,
  });

  return (
    <div
      className="rolagem"
      style={{
        position: 'absolute', inset: 0, zIndex: 38, display: 'flex', flexDirection: 'column',
        boxSizing: 'border-box', padding: '0 26px', overflowY: 'auto',
        background: 'radial-gradient(120% 70% at 50% 0%,#101A0E 0%,#04070A 55%)',
        paddingTop: 'max(64px, calc(env(safe-area-inset-top) + 40px))',
        paddingBottom: 'max(44px, calc(env(safe-area-inset-bottom) + 20px))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 'none' }}>
        <Mascote corOlho={cor.fosforoClaro} largura={86} />
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.24em', textTransform: 'uppercase', color: cor.fosforo }}>
            Minimau online
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.2em', textTransform: 'uppercase', opacity: 0.4, marginTop: 4 }}>
            passo {passo} de 3
          </div>
        </div>
      </div>

      <div style={{ fontWeight: 700, fontSize: 46, lineHeight: 1, marginTop: 26, maxWidth: 290, textWrap: 'pretty', flex: 'none' }}>
        {titulo}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, opacity: 0.55, marginTop: 14, maxWidth: 300, flex: 'none' }}>
        {texto}
      </div>

      {passo === 1 ? (
        <div style={{ flex: 'none' }}>
          <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid rgba(155,255,59,.4)`, paddingBottom: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 16, opacity: 0.45 }}>R$</span>
            <input
              value={renda}
              onChange={(e) => setRenda(e.target.value)}
              inputMode="decimal"
              placeholder="1700"
              aria-label="Quanto entra este mês?"
              autoFocus
              style={{
                flex: 1, width: '100%', border: 'none', background: 'transparent', outline: 'none',
                fontFamily: SANS, fontWeight: 700, fontSize: 48, color: cor.tinta, padding: 0,
              }}
            />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.42, marginTop: 12, lineHeight: 1.7 }}>
            {ciclo
              ? `É o salário que cai em ${dataCurta(ciclo.data_recebimento)} e banca o ciclo de ${dataCurta(ciclo.inicio)} a ${dataCurta(ciclo.fim)}.`
              : `É o salário de ${nomeMes(mes)}.`}{' '}
            Um pix que cair depois você lança pelo chat.
          </div>
        </div>
      ) : (
        <div style={{ flex: 'none' }}>
          {itens.length > 0 && (
            <div style={{ marginTop: 24, borderTop: `1px solid ${cor.divisorForte}` }}>
              {itens.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${cor.divisorForte}`, minHeight: 44 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.descricao}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.42 }}>
                      {passo === 2 ? `vence dia ${item.dia_vencimento}` : `${item.parcela_atual} de ${item.total_parcelas}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
                    <span style={{ fontWeight: 700, fontSize: 24, lineHeight: 1 }}>
                      {fmt(passo === 2 ? item.valor : item.valor_parcela)}
                    </span>
                    <button type="button" onClick={() => aoRemoverCompromisso(tipo, item.id)} aria-label={`Remover ${item.descricao}`} style={{ opacity: 0.5, padding: '0 6px', minHeight: 44, fontSize: 14 }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            {formAberto ? (
              <FormularioCompromisso tipo={tipo} mes={mes} aoSalvar={adicionar} aoCancelar={() => setFormAberto(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setFormAberto(true)}
                style={{
                  width: '100%', border: `1px dashed rgba(155,255,59,.3)`, borderRadius: 14,
                  padding: '13px 15px', minHeight: 44, display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase',
                }}
              >
                <span style={{ opacity: 0.75 }}>
                  {itens.length ? 'Adicionar outra' : `Adicionar ${passo === 2 ? 'conta fixa' : 'parcelamento'}`}
                </span>
                <span style={{ color: cor.fosforo }}>+</span>
              </button>
            )}
          </div>
        </div>
      )}

      {aviso && (
        <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.55, display: 'flex', gap: 8, marginTop: 16, color: cor.alerta, flex: 'none' }}>
          <span>≠</span>
          <span>{aviso}</span>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 28 }} />

      {/* Enquanto o formulário está aberto ele já tem os próprios botões. */}
      {!formAberto && (
        <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
          {passo > 1 && (
            <button
              type="button"
              onClick={() => (passo === 2 ? irPara(3) : aoConcluir())}
              style={botao({ flex: 1, border: `1px solid rgba(237,243,233,.25)` })}
            >
              Pular
            </button>
          )}
          <button
            type="button"
            onClick={() => (passo === 1 ? salvarRenda() : passo === 2 ? irPara(3) : aoConcluir())}
            disabled={salvando}
            style={botao({ flex: 2, background: cor.fosforo, color: cor.fundo, fontWeight: 600, opacity: salvando ? 0.6 : 1 })}
          >
            {salvando ? 'Salvando…' : passo === 3 ? 'Começar a usar' : 'Continuar'}
          </button>
        </div>
      )}
    </div>
  );
}
