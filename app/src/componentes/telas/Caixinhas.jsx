import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../api';
import { nomeMes, dataCurta } from '../../api';
import FormularioObjetivo from '../FormularioObjetivo';
import ModalDivisao from '../ModalDivisao';
import { useContagem } from '../../hooks/useContagem';
import { vibrar } from '../../hooks/useVibrar';
import { dispararAnimacaoDeposito } from '../../utils/voo';
import { cor, MONO, cardAlto, rotulo, meta } from '../../tema';
import { fmt, fmt0 } from '../../utils/formato';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Intervalo entre uma moeda e a próxima: juntas viram borrão, espaçadas demais
// parecem travadas.
const INTERVALO_MOEDAS = 170;
// Tempo para a folha sair e a lista rolar até as caixas antes do primeiro voo.
const ANTES_DO_VOO = 380;

const saldosDe = (resumo) => Object.fromEntries((resumo?.objetivos || []).map((o) => [o.id, o.saldo_atual]));

const BASE_DA_MEDIA = {
  ciclos_fechados: (n) => `média de ${n} ${n === 1 ? 'ciclo fechado' : 'ciclos fechados'}`,
  estimativa_ciclo_aberto: () => 'estimada pelo ciclo aberto',
  sem_dados: () => 'sem despesa para calcular ainda',
};

function BotaoPasso({ texto, rotuloAria, desabilitado, aoTocar }) {
  return (
    <button
      type="button"
      onClick={aoTocar}
      disabled={desabilitado}
      aria-label={rotuloAria}
      style={{
        width: 44, height: 44, borderRadius: 12, border: `1px solid ${cor.linhaViva}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        color: cor.fosforo, opacity: desabilitado ? 0.3 : 1,
      }}
    >
      {texto}
    </button>
  );
}

// Um card por caixinha. O saldo conta até o valor novo quando muda — e durante
// o depósito ele só muda quando a moeda chega, quem segura isso é a tela.
function CardCaixinha({ objetivo, saldo, reserva, refCard, aoEditar, aoMultiplicador }) {
  const contado = useContagem(saldo);
  const alvo = objetivo.meta;
  const pct = alvo ? Math.min(100, (saldo / alvo) * 100) : 0;
  const batida = alvo != null && saldo >= alvo;
  const falta = alvo != null ? Math.max(0, alvo - saldo) : 0;

  return (
    <div
      ref={refCard}
      className="caixinha-card"
      style={{
        marginTop: 10, padding: '12px 16px 14px', borderRadius: 22,
        border: `1px solid ${batida ? cor.linhaViva : cor.linha}`,
        background: objetivo.e_reserva ? cardAlto : cor.painel,
      }}
    >
      <button
        type="button"
        onClick={aoEditar}
        aria-label={`Editar ${objetivo.nome}`}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 44 }}
      >
        <div style={{ minWidth: 0, textAlign: 'left' }}>
          <div style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {objetivo.nome}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.42, marginTop: 4 }}>
            {alvo != null ? `meta ${fmt0(alvo)}` : 'sem meta'}
          </div>
        </div>
        <div data-saldo style={{ fontWeight: 700, fontSize: 30, lineHeight: 1, flex: 'none', color: batida ? cor.fosforo : cor.tinta }}>
          {fmt(contado)}
        </div>
      </button>

      {alvo != null ? (
        <div style={{ height: 8, borderRadius: 4, background: cor.trilho, overflow: 'hidden', marginTop: 10 }}>
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 4, background: cor.fosforo,
            transition: 'width .5s cubic-bezier(.2,.9,.25,1)',
          }}
          />
        </div>
      ) : (
        <div style={{ height: 8, marginTop: 10, borderTop: '1px dashed rgba(237,243,233,.16)', transform: 'translateY(4px)' }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, ...meta({ opacity: 0.55 }) }}>
        <span>{alvo == null ? 'guarda sem teto' : batida ? 'meta batida' : `${Math.floor(pct)}% da meta`}</span>
        <span>{alvo != null && falta > 0 ? `faltam ${fmt0(falta)}` : ''}</span>
      </div>

      {reserva && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          marginTop: 12, paddingTop: 10, borderTop: `1px solid ${cor.divisor}`,
        }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, opacity: 0.8 }}>
              Meta = {reserva.multiplicador} {reserva.multiplicador === 1 ? 'mês' : 'meses'} de despesa
            </div>
            <div style={meta({ marginTop: 4, lineHeight: 1.5 })}>
              {reserva.despesa_media.valor > 0 ? `${fmt0(reserva.despesa_media.valor)}/mês · ` : ''}
              {BASE_DA_MEDIA[reserva.despesa_media.base](reserva.despesa_media.ciclos_considerados)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
            <BotaoPasso
              texto="−"
              rotuloAria="Menos um mês de meta"
              desabilitado={reserva.multiplicador <= reserva.multiplicador_min}
              aoTocar={() => aoMultiplicador(reserva.multiplicador - 1)}
            />
            <span style={{ width: 30, textAlign: 'center', fontWeight: 700, fontSize: 20, color: cor.fosforo }}>
              {reserva.multiplicador}×
            </span>
            <BotaoPasso
              texto="+"
              rotuloAria="Mais um mês de meta"
              desabilitado={reserva.multiplicador >= reserva.multiplicador_max}
              aoTocar={() => aoMultiplicador(reserva.multiplicador + 1)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Caixinhas: a sobra do ciclo dividida entre objetivos. Tudo aqui é lógico —
// o dinheiro físico fica numa Caixinha Turbo só, e é a soma das caixas que
// esbarra no teto dela.
export default function Caixinhas({ aoErro }) {
  const [resumo, setResumo] = useState(null);
  const [falhou, setFalhou] = useState(false);
  const [edicao, setEdicao] = useState(null); // { item } edita; item null cria
  const [divisao, setDivisao] = useState(null); // { mes, simulacao, sugestao }
  const [enviando, setEnviando] = useState(false);
  const [confirmarDesfazer, setConfirmarDesfazer] = useState(null);

  // Saldo mostrado em cada card. No depósito o resumo novo chega na hora, mas
  // o número de cada caixa só muda quando a moeda dela pousa.
  const [exibidos, setExibidos] = useState({});
  const depositando = useRef(false);

  const cards = useRef(new Map());
  const camada = useRef(null);
  const lista = useRef(null);

  const aplicar = useCallback((r) => {
    setResumo(r);
    setExibidos(saldosDe(r));
  }, []);

  const carregar = useCallback(async () => {
    try {
      aplicar(await api.getCaixinhas());
      setFalhou(false);
    } catch (e) {
      setFalhou(true);
      aoErro(e.message || 'Não consegui abrir as caixinhas.');
    }
  }, [aplicar, aoErro]);

  useEffect(() => { carregar(); }, [carregar]);

  const objetivos = resumo ? resumo.objetivos : [];
  const totalExibido = objetivos.reduce((a, o) => a + (exibidos[o.id] ?? o.saldo_atual), 0);
  const totalContado = useContagem(Math.round(totalExibido * 100) / 100);

  if (!resumo) {
    return (
      <div style={{ padding: '40px 20px', fontFamily: MONO, fontSize: 11.5, opacity: 0.5, lineHeight: 1.7 }}>
        {falhou ? (
          <button type="button" onClick={carregar} style={{ fontFamily: MONO, fontSize: 11.5, color: cor.fosforo, minHeight: 44 }}>
            Não abriu. Tentar de novo →
          </button>
        ) : 'Abrindo as caixinhas…'}
      </div>
    );
  }

  const { limite, sobra, reserva } = resumo;
  const aberto = sobra.ciclo_aberto;

  // O alerta sai do total EXIBIDO: aparece quando a moeda que cruza o gatilho
  // pousa, não antes de ela sair do botão.
  const perto = totalExibido > limite.gatilho_alerta;
  const acima = totalExibido > limite.limite;
  const corTeto = acima ? cor.alerta : perto ? cor.atencao : cor.fosforo;
  const pctTeto = limite.limite > 0 ? (totalExibido / limite.limite) * 100 : 0;

  // -------------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------------

  const abrirDivisao = async () => {
    const simulacao = !sobra.pode_dividir;
    try {
      const sugestao = simulacao
        ? await api.sugerirDivisao({ valor: aberto.previsao })
        : await api.sugerirDivisao({ mes: sobra.mes_referencia });
      setDivisao({ simulacao, mes: simulacao ? aberto.mes_referencia : sobra.mes_referencia, sugestao });
    } catch (e) {
      aoErro(e.message || 'Não consegui calcular a divisão.');
    }
  };

  // Grava primeiro, anima depois: moeda voando para uma caixa que o servidor
  // recusou seria o app mentindo.
  const depositar = async (itens, origem) => {
    if (depositando.current) return;
    depositando.current = true;
    setEnviando(true);
    let r;
    try {
      r = await api.confirmarDivisao(divisao.mes, itens);
    } catch (e) {
      depositando.current = false;
      setEnviando(false);
      setDivisao(null);
      aoErro(e.message || 'Não consegui registrar a divisão.');
      // A sobra pode ter mudado desde a sugestão (um gasto do ciclo editado).
      carregar();
      return;
    }

    setEnviando(false);
    setDivisao(null);
    setResumo(r.resumo); // saldos exibidos continuam os antigos até cada moeda pousar
    vibrar([10, 30, 10]);

    // Rola só o <main>: scrollIntoView também mexe em contêineres com
    // overflow hidden acima dele e empurra as caixas para baixo do cabeçalho.
    const rolagem = lista.current?.closest('main');
    if (rolagem) rolagem.scrollTo({ top: Math.max(0, lista.current.offsetTop - 10), behavior: 'smooth' });
    await espera(ANTES_DO_VOO);

    const novos = saldosDe(r.resumo);
    const alvos = itens.filter((i) => i.valor > 0);
    alvos.forEach((item, k) => {
      setTimeout(() => {
        const pousar = () => setExibidos((e) => ({ ...e, [item.objetivo_id]: novos[item.objetivo_id] }));
        const card = cards.current.get(item.objetivo_id);
        const caixa = card?.getBoundingClientRect();
        // Card fora da tela não recebe voo — a moeda sumiria pela borda.
        if (!card || !camada.current || caixa.bottom < 0 || caixa.top > window.innerHeight) {
          pousar();
          return;
        }
        dispararAnimacaoDeposito(origem, card, camada.current, {
          alvoEl: card.querySelector('[data-saldo]'),
          aoChegar: pousar,
        });
      }, k * INTERVALO_MOEDAS);
    });

    // Fecha a conta mesmo se algum animationend não disparar (aba em segundo plano).
    setTimeout(() => {
      setExibidos(novos);
      depositando.current = false;
    }, alvos.length * INTERVALO_MOEDAS + 1200);
  };

  const salvarObjetivo = async (dados) => {
    try {
      const r = edicao.item ? await api.editarObjetivo(edicao.item.id, dados) : await api.criarObjetivo(dados);
      aplicar(r.resumo);
      setEdicao(null);
    } catch (e) {
      aoErro(e.message || 'Não consegui salvar essa caixinha.');
    }
  };

  const excluirObjetivo = async () => {
    try {
      const r = await api.removerObjetivo(edicao.item.id);
      aplicar(r.resumo);
      setEdicao(null);
    } catch (e) {
      aoErro(e.message || 'Não consegui excluir essa caixinha.');
    }
  };

  const mudarMultiplicador = async (n) => {
    if (depositando.current) return;
    try {
      aplicar(await api.definirMultiplicadorReserva(n));
      vibrar(8);
    } catch (e) {
      aoErro(e.message || 'Não consegui mudar a meta da reserva.');
    }
  };

  // Dois toques: desfazer tira dinheiro de todas as caixas de uma vez.
  const desfazer = async (mes) => {
    if (confirmarDesfazer !== mes) {
      setConfirmarDesfazer(mes);
      return;
    }
    setConfirmarDesfazer(null);
    try {
      const r = await api.desfazerDivisao(mes);
      aplicar(r.resumo);
      vibrar(14);
    } catch (e) {
      aoErro(e.message || 'Não consegui desfazer essa divisão.');
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const botaoLargo = {
    width: '100%', marginTop: 14, minHeight: 48, borderRadius: 14, padding: '0 16px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase',
  };

  return (
    <div style={{ padding: '16px 16px 10px' }}>
      {/* Camada das moedas: fixa na janela, por cima da barra, sem pegar toque. */}
      <div ref={camada} aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 45 }} />

      {/* ------------------------- Guardado e teto ------------------------- */}
      <div style={{
        border: `1px solid ${cor.linhaViva}`, borderRadius: 22, padding: '15px 16px',
        background: 'linear-gradient(150deg,#101A0C,#080C0A)',
      }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={rotulo({ letterSpacing: '.2em', opacity: 0.85, color: cor.fosforo })}>Guardado</div>
            <div style={meta({ marginTop: 6, whiteSpace: 'nowrap' })}>
              {objetivos.length} {objetivos.length === 1 ? 'caixinha' : 'caixinhas'}
            </div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 40, lineHeight: 0.9, color: cor.fosforo }}>{fmt(totalContado)}</div>
        </div>

        <div style={{ position: 'relative', height: 10, marginTop: 16 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 3, background: cor.trilho, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, pctTeto)}%`, height: '100%', background: corTeto,
              transition: 'width .5s cubic-bezier(.2,.9,.25,1), background .3s',
            }}
            />
          </div>
          {/* Marca do gatilho do alerta (80% do teto). */}
          <div style={{
            position: 'absolute', top: -4, bottom: -4, width: 1, background: 'rgba(237,243,233,.5)',
            left: `${(limite.gatilho_alerta / limite.limite) * 100}%`,
          }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, ...meta({ opacity: 0.55 }) }}>
          <span>Caixinha Turbo · teto {fmt0(limite.limite)} · {limite.rendimento_cdi}% CDI</span>
          <span>{Math.round(pctTeto)}%</span>
        </div>

        {perto && (
          <div
            role="status"
            style={{
              marginTop: 12, borderRadius: 14, padding: '10px 12px',
              border: `1px solid ${acima ? 'rgba(255,90,60,.45)' : 'rgba(255,194,74,.45)'}`,
              background: acima ? 'rgba(255,90,60,.1)' : 'rgba(255,194,74,.08)',
              animation: 'emergir .28s cubic-bezier(.2,.9,.25,1)',
            }}
          >
            <div style={rotulo({ opacity: 1, color: corTeto, letterSpacing: '.18em' })}>
              {acima ? 'Teto estourado' : 'Perto do teto'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.65, opacity: 0.8, marginTop: 5 }}>
              {acima
                ? `${fmt(totalExibido - limite.limite)} passaram dos ${fmt0(limite.limite)} e rendem ${limite.rendimento_excedente_cdi}% do CDI numa caixinha comum.`
                : `Faltam ${fmt(limite.limite - totalExibido)} para o teto de ${fmt0(limite.limite)}. O que passar dele rende ${limite.rendimento_excedente_cdi}% do CDI, não ${limite.rendimento_cdi}%.`}
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------- Sobra do mês ---------------------------- */}
      <div style={{ marginTop: 14, border: `1px solid ${cor.linha}`, borderRadius: 22, background: cardAlto, padding: '15px 16px' }}>
        {sobra.pode_dividir ? (
          <>
            <div style={rotulo({ opacity: 0.5 })}>Sobra de {nomeMes(sobra.mes_referencia)}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, opacity: 0.5 }}>R$</span>
              <span style={{ fontWeight: 700, fontSize: 44, lineHeight: 0.95, color: cor.fosforo }}>{fmt(sobra.sobra)}</span>
            </div>
            <div style={meta({ marginTop: 7 })}>
              ciclo {dataCurta(sobra.ciclo.inicio)} a {dataCurta(sobra.ciclo.fim)} · fechado
            </div>
            <button
              type="button"
              onClick={abrirDivisao}
              style={{ ...botaoLargo, background: cor.fosforo, color: cor.fundo, fontWeight: 600 }}
            >
              <span>Dividir sobra do mês</span>
              <span>→</span>
            </button>
          </>
        ) : (
          <>
            <div style={rotulo({ opacity: 0.5 })}>
              {sobra.dividida
                ? `Sobra de ${nomeMes(sobra.mes_referencia)} já dividida`
                : !sobra.renda_definida
                  ? `${nomeMes(sobra.mes_referencia)} sem renda lançada`
                  : `${nomeMes(sobra.mes_referencia)} fechou sem sobra`}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.75, opacity: 0.75, marginTop: 8 }}>
              A sobra de {nomeMes(aberto.mes_referencia)} libera em {dataCurta(aberto.libera_em)}, quando o ciclo
              fecha. Previsão hoje:{' '}
              <span style={{ color: aberto.previsao > 0 ? cor.fosforo : cor.alerta, fontWeight: 600 }}>
                {fmt(aberto.previsao)}
              </span>
            </div>
            <button
              type="button"
              onClick={abrirDivisao}
              disabled={!(aberto.previsao > 0)}
              style={{
                ...botaoLargo, border: '1px dashed rgba(155,255,59,.3)', color: cor.fosforo,
                opacity: aberto.previsao > 0 ? 1 : 0.35,
              }}
            >
              <span>Simular divisão</span>
              <span>◍</span>
            </button>
          </>
        )}
      </div>

      {/* ------------------------------ Caixinhas ----------------------------- */}
      <div ref={lista} style={rotulo({ margin: '24px 4px 0' })}>Caixinhas</div>
      {objetivos.map((o) => (edicao && edicao.item?.id === o.id ? (
        <FormularioObjetivo
          key={o.id}
          inicial={o}
          aoSalvar={salvarObjetivo}
          aoCancelar={() => setEdicao(null)}
          aoExcluir={o.e_reserva ? null : excluirObjetivo}
        />
      ) : (
        <CardCaixinha
          key={o.id}
          objetivo={o}
          saldo={exibidos[o.id] ?? o.saldo_atual}
          reserva={o.e_reserva ? reserva : null}
          refCard={(el) => { if (el) cards.current.set(o.id, el); else cards.current.delete(o.id); }}
          aoEditar={() => setEdicao({ item: o })}
          aoMultiplicador={mudarMultiplicador}
        />
      )))}
      {edicao && !edicao.item ? (
        <FormularioObjetivo aoSalvar={salvarObjetivo} aoCancelar={() => setEdicao(null)} />
      ) : (
        <button
          type="button"
          onClick={() => setEdicao({ item: null })}
          style={{
            width: '100%', marginTop: 12, border: '1px dashed rgba(155,255,59,.3)', borderRadius: 14,
            padding: '13px 15px', minHeight: 44, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase',
          }}
        >
          <span style={{ opacity: 0.75 }}>Nova caixinha</span>
          <span style={{ color: cor.fosforo }}>+</span>
        </button>
      )}

      {/* ------------------------------ Histórico ----------------------------- */}
      {resumo.alocacoes.length > 0 && (
        <>
          <div style={rotulo({ margin: '26px 4px 2px' })}>Divisões registradas</div>
          {resumo.alocacoes.map((a, i) => (
            <div key={a.mes_referencia} style={{ padding: '12px 4px', borderBottom: `1px solid ${cor.divisor}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase' }}>
                  {nomeMes(a.mes_referencia)}
                </span>
                <span style={{ fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{fmt(a.total_sobra)}</span>
              </div>
              <div style={meta({ marginTop: 6, lineHeight: 1.6 })}>
                {a.divisoes.map((d) => `${d.nome} ${fmt0(d.valor)}`).join(' · ')}
              </div>
              {i === 0 && (
                <button
                  type="button"
                  onClick={() => desfazer(a.mes_referencia)}
                  style={{
                    fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', minHeight: 40,
                    color: confirmarDesfazer === a.mes_referencia ? cor.alerta : 'rgba(237,243,233,.5)',
                  }}
                >
                  {confirmarDesfazer === a.mes_referencia ? 'Toque de novo para desfazer' : 'Desfazer divisão'}
                </button>
              )}
            </div>
          ))}
        </>
      )}

      <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.32, marginTop: 22, lineHeight: 1.8 }}>
        Divisão lógica: o dinheiro fica todo numa Caixinha Turbo do Nubank. As caixas
        só dizem de quem é cada parte — e é a soma delas que esbarra no teto.
      </div>

      {divisao && (
        <ModalDivisao
          key={`${divisao.mes}-${divisao.sugestao.valor}`}
          divisao={divisao}
          liberaEm={aberto.libera_em}
          enviando={enviando}
          aoFechar={() => { if (!enviando) setDivisao(null); }}
          aoDepositar={depositar}
        />
      )}
    </div>
  );
}
