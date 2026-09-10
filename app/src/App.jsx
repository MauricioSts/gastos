import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';
import { nomeMes, LISTA_CAT, ROTULO_CAT } from './api';
import { leValor, fmt, fmt0 } from './utils/formato';
import { vibrar } from './hooks/useVibrar';
import { useTecladoIOS } from './hooks/useTecladoIOS';
import { cor, MONO, corCategoria } from './tema';

import Logo from './componentes/Logo';
import BarraEntrada from './componentes/BarraEntrada';
import FaixaErro from './componentes/FaixaErro';
import Notificacao from './componentes/Notificacao';
import CardConfirmacao from './componentes/CardConfirmacao';
import CardSugestao from './componentes/CardSugestao';
import Home from './componentes/telas/Home';
import Painel from './componentes/telas/Painel';
import Historico from './componentes/telas/Historico';
import Compromissos from './componentes/telas/Compromissos';
import Projecao from './componentes/telas/Projecao';
import Ajustes from './componentes/telas/Ajustes';
import Onboarding from './componentes/telas/Onboarding';

const TITULOS = {
  home: 'hoje',
  painel: 'painel do mês',
  historico: 'histórico',
  compromissos: 'travado',
  projecao: 'projeção',
  config: 'ajustes',
};

export default function App() {
  useTecladoIOS();

  const [tela, setTela] = useState('home');
  // O mês só é conhecido depois de perguntar ao backend qual ciclo está
  // aberto: dia 29 já pertence ao ciclo seguinte, então o calendário do
  // navegador daria a resposta errada em três dias de cada mês.
  const [mes, setMes] = useState(null);
  const [cicloAtual, setCicloAtual] = useState(null);
  const [ciclo, setCiclo] = useState(null);

  const [saldo, setSaldo] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [painel, setPainel] = useState(null);
  const [compromissos, setCompromissos] = useState(null);
  const [projecao, setProjecao] = useState([]);
  const [rendas, setRendas] = useState(null);

  const [carregando, setCarregando] = useState(true);
  const [entrada, setEntrada] = useState('');
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');

  const [conf, setConf] = useState(null);               // gasto registrado ou em edição
  const [entradaConf, setEntradaConf] = useState(null); // entrada de renda registrada
  const [confSegundos, setConfSegundos] = useState(5);
  const [sug, setSug] = useState(null);                 // compromisso recorrente sugerido

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todas');
  // Recorte de datas vindo do painel: tocar numa semana leva ao histórico já
  // limitado àquela janela, que é a única forma de responder "de onde saiu
  // esse total?" sem a pessoa somar linha por linha.
  const [periodo, setPeriodo] = useState(null);
  const [onboardando, setOnboardando] = useState(false);

  const [avisoAberto, setAvisoAberto] = useState(false);
  const [avisoDispensado, setAvisoDispensado] = useState(false);

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------

  const recarregar = useCallback(async (mesAlvo = mes) => {
    try {
      const [s, g, p, c, pr, rd, jn] = await Promise.all([
        api.getSaldo(mesAlvo),
        api.getGastos(mesAlvo),
        api.getPainel(mesAlvo),
        api.getCompromissos(mesAlvo),
        api.getProjecao(6, mesAlvo),
        api.getRendas(mesAlvo),
        api.getCiclo(mesAlvo),
      ]);
      setSaldo(s);
      setGastos(g);
      setPainel(p);
      setCompromissos(c);
      setProjecao(pr);
      setRendas(rd);
      setCiclo(jn);
      // Sem renda o saldo não significa nada: o onboarding é obrigatório.
      // Esta carga só ABRE o onboarding; quem fecha é o último passo ou o
      // "pular" — senão salvar a renda no passo 1 derrubaria os passos 2 e 3.
      // Só dispara no ciclo corrente: um mês futuro sem renda não é motivo
      // para refazer a configuração inicial.
      if (mesAlvo === cicloAtual) setOnboardando((aberto) => aberto || !s.renda_definida);
      setErro('');
    } catch (e) {
      setErro(e.message || 'Falha ao buscar os dados do mês.');
    } finally {
      setCarregando(false);
    }
  }, [mes, cicloAtual]);

  // Descobre o ciclo aberto antes da primeira carga. Se a chamada falhar, cai
  // no mês do calendário: melhor mostrar o período quase certo do que nada.
  useEffect(() => {
    let vivo = true;
    api.getCiclo()
      .then((c) => { if (vivo) { setCicloAtual(c.ciclo_atual); setMes(c.ciclo_atual); } })
      .catch(() => { if (vivo) { setCicloAtual(api.hoje.mes); setMes(api.hoje.mes); } });
    return () => { vivo = false; };
  }, []);

  useEffect(() => { if (mes) recarregar(mes); }, [mes, recarregar]);

  // -------------------------------------------------------------------------
  // Números derivados do dia
  // -------------------------------------------------------------------------

  // Quem faz estas contas é o backend (`gasto_hoje`, `ritmo_restante_hoje`):
  // é ele que sabe a que ciclo o dia de hoje pertence.
  const fatura = saldo ? saldo.fatura : null;
  const gastoHoje = saldo ? saldo.gasto_hoje : 0;
  const sobraHoje = saldo ? saldo.ritmo_restante_hoje ?? 0 : 0;
  const estourou = saldo != null && sobraHoje < 0;
  const avisar = fatura ? fatura.notificar : true;

  // Quantos dias faltam para a fatura fechar (0 = fecha hoje). É o gatilho do
  // aviso e a cor do cabeçalho — o resto do app não muda por causa disso.
  const diasParaFechar = fatura && mes === cicloAtual ? fatura.dias_para_fechar : null;

  useEffect(() => {
    if (!avisar || diasParaFechar == null || diasParaFechar > 1) return undefined;
    if (avisoDispensado || onboardando) return undefined;
    const t = setTimeout(() => { setAvisoAberto(true); vibrar([10, 60, 10]); }, 900);
    return () => clearTimeout(t);
  }, [avisar, diasParaFechar, avisoDispensado, onboardando]);

  // A fala do Minimau é gerada pelo estado, nunca texto fixo.
  const { estadoMinimau, falaMinimau } = useMemo(() => {
    if (processando) return { estadoMinimau: 'processando', falaMinimau: 'Interpretando o que você disse…' };
    if (!saldo) return { estadoMinimau: 'inicializando', falaMinimau: 'Carregando seus números…' };
    if (diasParaFechar != null && diasParaFechar <= 1) {
      return {
        estadoMinimau: 'alerta',
        falaMinimau: `A fatura fecha ${diasParaFechar === 0 ? 'hoje' : 'amanhã'}. Já são ${fmt0(fatura.total_ciclo)} no ciclo.`,
      };
    }
    if (estourou) {
      return { estadoMinimau: 'alerta', falaMinimau: `Você passou ${fmt(Math.abs(sobraHoje))} do ritmo de hoje. Amanhã compensa.` };
    }
    if (gastoHoje === 0) {
      return { estadoMinimau: 'escutando', falaMinimau: `Dia limpo até agora. Você tem ${fmt(sobraHoje)} pra hoje.` };
    }
    return {
      estadoMinimau: 'acompanhando',
      falaMinimau: `Gastou ${fmt(gastoHoje)} hoje — ainda sobram ${fmt(sobraHoje)} até meia-noite.`,
    };
  }, [processando, saldo, fatura, diasParaFechar, estourou, gastoHoje, sobraHoje]);

  const corOlho = processando ? cor.atencao : estourou ? cor.alerta : cor.fosforo;

  // -------------------------------------------------------------------------
  // Entrada de lançamento
  // -------------------------------------------------------------------------

  const enviar = async () => {
    const mensagem = entrada.trim();
    if (!mensagem || processando) return;
    setProcessando(true);
    setErro('');
    setConf(null);
    setEntradaConf(null);
    setSug(null);
    try {
      const r = await api.postGasto(mensagem);
      setEntrada('');
      if (r.requer_confirmacao) {
        // Compromisso recorrente: nada foi gravado, o usuário confirma no card.
        setSug({ tipo: r.tipo, sugestao: r.sugestao });
        vibrar([12, 40, 12]);
      } else if (r.tipo === 'entrada') {
        // Dinheiro que entrou: vira renda do mês e aumenta o disponível.
        vibrar(18);
        setEntradaConf(r.entrada);
        setConfSegundos(5);
        recarregar();
      } else {
        vibrar(18);
        setConf(r.gasto);
        setConfSegundos(5);
        recarregar();
      }
    } catch (e) {
      setErro(e.message || 'Não consegui interpretar isso.');
    } finally {
      setProcessando(false);
    }
  };

  // Fim da contagem ou "Ok" no card: aplica a edição, se houver.
  const fecharConfirmacao = async (campos) => {
    const gasto = conf;
    setConf(null);
    if (!gasto || !campos) return;
    const mudou = campos.valor !== gasto.valor || campos.categoria !== gasto.categoria;
    if (mudou) {
      await api.editarGasto(gasto.id, campos);
      recarregar();
    }
  };

  const desfazer = async () => {
    const gasto = conf;
    setConf(null);
    if (!gasto) return;
    await api.removerGasto(gasto.id);
    recarregar();
  };

  const fecharEntrada = async (campos) => {
    const registro = entradaConf;
    setEntradaConf(null);
    if (!registro || !campos) return;
    if (campos.valor !== registro.valor) {
      await api.editarRenda(registro.id, { valor: campos.valor });
      recarregar();
    }
  };

  const desfazerEntrada = async () => {
    const registro = entradaConf;
    setEntradaConf(null);
    if (!registro) return;
    await api.removerRenda(registro.id, mes);
    recarregar();
  };

  const cadastrarSugestao = async ({ valor, campo2 }) => {
    const { tipo, sugestao } = sug;
    setSug(null);
    const dados = tipo === 'parcelamento'
      ? {
        descricao: sugestao.descricao, valor_parcela: valor, total_parcelas: campo2,
        parcela_inicial: sugestao.parcela_inicial || 1,
        mes_inicio: sugestao.mes_inicio || mes, categoria: sugestao.categoria,
      }
      : { descricao: sugestao.descricao, valor, dia_vencimento: campo2, categoria: sugestao.categoria };
    try {
      await api.confirmarCompromisso(tipo, dados);
      vibrar([10, 30, 10]);
      recarregar();
    } catch (e) {
      setErro(e.message || 'Não consegui cadastrar esse compromisso.');
    }
  };

  // -------------------------------------------------------------------------
  // Ações de lista
  // -------------------------------------------------------------------------

  const editarGasto = (g) => { setConf(g); setConfSegundos(0); };

  const excluirGasto = async (g) => {
    vibrar(14);
    await api.removerGasto(g.id);
    recarregar();
  };

  // "hoje 13:12" / "ontem 09:00" / "12/08 07:55"
  const quando = (iso) => {
    const [data, hora] = iso.split('T');
    const dia = Number(data.split('-')[2]);
    if (data.slice(0, 7) === api.hoje.mes) {
      if (dia === api.hoje.dia) return `hoje ${hora}`;
      if (dia === api.hoje.dia - 1) return `ontem ${hora}`;
    }
    return `${String(dia).padStart(2, '0')}/${data.split('-')[1]} ${hora}`;
  };

  const mudarMes = (n) => setMes((m) => api.somaMes(m, n));

  // -------------------------------------------------------------------------
  // Compromissos
  // -------------------------------------------------------------------------

  // `id` nulo cria; com id, edita. Um só caminho para os dois tipos.
  const salvarCompromisso = async (tipo, id, dados) => {
    try {
      if (!id) await api.confirmarCompromisso(tipo, dados);
      else if (tipo === 'parcelamento') await api.editarParcelamento(id, dados);
      else await api.editarContaFixa(id, dados);
      await recarregar();
    } catch (e) {
      setErro(e.message || 'Não consegui salvar esse compromisso.');
    }
  };

  const excluirCompromisso = async (tipo, id) => {
    try {
      if (tipo === 'parcelamento') await api.removerParcelamento(id);
      else await api.removerContaFixa(id);
      await recarregar();
    } catch (e) {
      setErro(e.message || 'Não consegui excluir esse compromisso.');
    }
  };

  // -------------------------------------------------------------------------
  // Ajustes
  // -------------------------------------------------------------------------

  const salvarRenda = async (bruto) => {
    const valor = leValor(bruto);
    if (!valor) { setErro('Informe um valor de renda válido.'); return; }
    await api.definirRenda(valor, mes);
    vibrar(12);
    recarregar();
  };

  const exportarCsv = () => {
    const blob = new Blob([api.csv(gastos)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `minimau-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const alternarAviso = async () => {
    const novo = !avisar;
    setAvisoDispensado(false);
    if (!novo) setAvisoAberto(false);
    try {
      await api.definirAviso(novo);
      recarregar();
    } catch (e) {
      setErro(e.message || 'Não consegui salvar essa preferência.');
    }
  };

  // Mudar o fechamento reescreve a janela de todos os ciclos: o backend não
  // grava a que mês cada gasto pertence, então o histórico se recalcula.
  const salvarFechamento = async (dia) => {
    try {
      await api.definirFechamento(dia);
      const c = await api.getCiclo();
      setCicloAtual(c.ciclo_atual);
      setMes(c.ciclo_atual);
      await recarregar(c.ciclo_atual);
    } catch (e) {
      setErro(e.message || 'Não consegui mudar o dia de fechamento.');
    }
  };

  const refazerOnboarding = async () => {
    await api.limparRenda(mes);
    setOnboardando(true);
    recarregar();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // "fatura em Nd" usa dias_restantes (que conta hoje) para bater com a régua
  // da Home; os textos de véspera saem de dias_para_fechar, que não conta.
  const rotuloCiclo = diasParaFechar == null
    ? (mes ? nomeMes(mes) : '—')
    : diasParaFechar === 0 ? 'fatura fecha hoje'
      : diasParaFechar === 1 ? 'fatura fecha amanhã'
        : `fatura em ${ciclo?.dias_restantes ?? saldo?.dias_restantes ?? diasParaFechar}d`;

  const rotuloCategoria = (c) => ROTULO_CAT[c] || c;
  const corBarra = (c) => corCategoria(c, LISTA_CAT);

  return (
    <div style={{
      position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
      background: cor.fundo, color: cor.tinta, overflow: 'hidden',
    }}
    >
      {/* Scanline: por cima de tudo, sem capturar toque. */}
      <div className="scanline" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 41, opacity: 0.5 }} />

      {/* Espaço da status bar do sistema (black-translucent desenha por cima). */}
      <div style={{ flex: 'none', height: 'max(12px, env(safe-area-inset-top))' }} />

      <header
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '13px 20px 11px', borderBottom: `1px solid ${cor.linhaFraca}`,
          flex: 'none', zIndex: 20, gap: 10, whiteSpace: 'nowrap',
          paddingLeft: 'max(20px, env(safe-area-inset-left))',
          paddingRight: 'max(20px, env(safe-area-inset-right))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, overflow: 'hidden' }}>
          <Logo corOlho={corOlho} tamanho={22} />
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '.3em', textTransform: 'uppercase' }}>Minimau</span>
          <span style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase',
            opacity: 0.4, overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          >
            / {TITULOS[tela]}
          </span>
        </div>
        <span style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', flex: 'none',
          color: diasParaFechar != null && diasParaFechar <= 1 ? cor.atencao : 'rgba(237,243,233,.45)',
        }}
        >
          {rotuloCiclo}
        </span>
      </header>

      <main className="rolagem" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {carregando ? (
          <div style={{ padding: '40px 20px', fontFamily: MONO, fontSize: 11.5, opacity: 0.5, lineHeight: 1.7 }}>
            Ligando o painel…
          </div>
        ) : (
          <>
            {tela === 'home' && (
              <Home
                saldo={saldo} gastos={gastos} gastoHoje={gastoHoje} sobraHoje={sobraHoje}
                estado={estadoMinimau} fala={falaMinimau} corOlho={corOlho}
                quando={quando} rotuloCategoria={rotuloCategoria} corBarra={corBarra}
                aoEditar={editarGasto} aoExcluir={excluirGasto}
              />
            )}
            {tela === 'painel' && (
              <Painel
                painel={painel} mes={mes} mesAnterior={painel ? painel.mes_anterior : mes}
                aoMudarMes={mudarMes} diaHoje={api.hoje.dia}
                rotuloCategoria={rotuloCategoria} corBarra={corBarra}
                aoFiltrarCategoria={(c) => { setFiltro(c); setPeriodo(null); setTela('historico'); }}
                aoFiltrarSemana={(sem) => {
                  setPeriodo({ inicio: sem.inicio, fim: sem.fim });
                  setFiltro('todas');
                  setBusca('');
                  setTela('historico');
                }}
              />
            )}
            {tela === 'historico' && (
              <Historico
                gastos={gastos} busca={busca} aoBuscar={setBusca}
                filtro={filtro} aoFiltrar={setFiltro} quando={quando}
                periodo={periodo} aoLimparPeriodo={() => setPeriodo(null)}
                rotuloCategoria={rotuloCategoria} corBarra={corBarra}
                aoEditar={editarGasto} aoExcluir={excluirGasto}
              />
            )}
            {tela === 'compromissos' && (
              <Compromissos
                compromissos={compromissos} saldo={saldo} mes={mes}
                aoVerProjecao={() => setTela('projecao')}
                aoSalvar={salvarCompromisso} aoExcluir={excluirCompromisso}
              />
            )}
            {tela === 'projecao' && <Projecao projecao={projecao} aoVoltar={() => setTela('compromissos')} />}
            {tela === 'config' && (
              <Ajustes
                mes={mes} saldo={saldo} ciclo={ciclo} rendas={rendas}
                avisar={avisar} aoAlternarAviso={alternarAviso}
                aoSalvarFechamento={salvarFechamento}
                aoTestarAviso={() => { setTela('home'); setAvisoDispensado(false); setAvisoAberto(true); vibrar([10, 60, 10]); }}
                aoSalvarRenda={salvarRenda} aoRemoverRenda={async (id) => { await api.removerRenda(id, mes); recarregar(); }}
                aoTestarSaude={api.health}
                aoExportar={exportarCsv} aoRefazer={refazerOnboarding}
              />
            )}
          </>
        )}
        {/* Espaço para a barra fixa não cobrir o fim da lista. */}
        <div style={{ height: 136 }} />
      </main>

      {avisoAberto && !onboardando && (
        <Notificacao
          titulo={diasParaFechar === 0
            ? 'A fatura fecha hoje'
            : diasParaFechar === 1 ? 'A fatura fecha amanhã' : `A fatura fecha em ${diasParaFechar} dias`}
          texto={fatura
            ? `Dia ${fatura.dia_fechamento} · ${fmt0(fatura.total_ciclo)} no ciclo · vence dia ${fatura.dia_vencimento}. Ainda dá tempo de segurar o que não é essencial.`
            : ''}
          aoFechar={() => { setAvisoAberto(false); setAvisoDispensado(true); }}
        />
      )}

      {erro && <FaixaErro texto={erro} aoFechar={() => setErro('')} />}

      {conf && (
        <CardConfirmacao
          key={conf.id}
          gasto={conf}
          segundosIniciais={confSegundos}
          aoDesfazer={desfazer}
          aoConfirmar={fecharConfirmacao}
        />
      )}

      {entradaConf && (
        <CardConfirmacao
          key={`entrada-${entradaConf.id}`}
          entrada={entradaConf}
          segundosIniciais={confSegundos}
          aoDesfazer={desfazerEntrada}
          aoConfirmar={fecharEntrada}
        />
      )}

      {sug && (
        <CardSugestao
          tipo={sug.tipo}
          sugestao={sug.sugestao}
          aoDescartar={() => setSug(null)}
          aoCadastrar={cadastrarSugestao}
        />
      )}

      {/* O teclado do iOS cobre a tela em vez de encolhê-la; --teclado é a
          altura coberta, medida pelo visualViewport. */}
      <div style={{ transform: 'translateY(calc(-1 * var(--teclado, 0px)))' }}>
        <BarraEntrada
          valor={entrada} aoMudar={setEntrada} aoEnviar={enviar}
          processando={processando} tela={tela} aoNavegar={setTela} aoErro={setErro}
        />
      </div>

      {onboardando && (
        <Onboarding
          mes={mes}
          ciclo={ciclo}
          compromissos={compromissos}
          aoDefinirRenda={async (v) => { await api.definirRenda(v, mes); await recarregar(); }}
          aoAdicionarCompromisso={(tipo, dados) => salvarCompromisso(tipo, null, dados)}
          aoRemoverCompromisso={excluirCompromisso}
          aoConcluir={() => setOnboardando(false)}
        />
      )}
    </div>
  );
}
