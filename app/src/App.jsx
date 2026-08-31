import { useCallback, useEffect, useState } from 'react';
import * as api from './api';
import { MESES, nomeMes } from './api';
import { leValor } from './utils/formato';
import { vibrar } from './hooks/useVibrar';
import { useTecladoIOS } from './hooks/useTecladoIOS';

import BarraEntrada from './componentes/BarraEntrada';
import FaixaErro from './componentes/FaixaErro';
import CardConfirmacao from './componentes/CardConfirmacao';
import CardSugestao from './componentes/CardSugestao';
import Home from './componentes/telas/Home';
import Resumo from './componentes/telas/Resumo';
import Historico from './componentes/telas/Historico';
import Compromissos from './componentes/telas/Compromissos';
import Projecao from './componentes/telas/Projecao';
import Ajustes from './componentes/telas/Ajustes';
import Onboarding from './componentes/telas/Onboarding';

const TITULOS = {
  home: 'folha 01',
  resumo: 'resumo',
  historico: 'histórico',
  compromissos: 'compromissos',
  projecao: 'projeção',
  config: 'ajustes',
};

export default function App() {
  useTecladoIOS();

  const [tela, setTela] = useState('home');
  const [mes, setMes] = useState(api.hoje.mes);

  const [saldo, setSaldo] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [compromissos, setCompromissos] = useState(null);
  const [projecao, setProjecao] = useState([]);

  const [carregando, setCarregando] = useState(true);
  const [entrada, setEntrada] = useState('');
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');

  const [conf, setConf] = useState(null);        // gasto recém-registrado ou em edição
  const [confSegundos, setConfSegundos] = useState(5);
  const [sug, setSug] = useState(null);          // sugestão de compromisso recorrente

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [onboardando, setOnboardando] = useState(false);

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------

  const recarregar = useCallback(async (mesAlvo = mes) => {
    try {
      const [s, g, r, c, p] = await Promise.all([
        api.getSaldo(mesAlvo),
        api.getGastos(mesAlvo),
        api.getResumo(mesAlvo),
        api.getCompromissos(mesAlvo),
        api.getProjecao(6, mesAlvo),
      ]);
      setSaldo(s);
      setGastos(g);
      setResumo(r);
      setCompromissos(c);
      setProjecao(p);
      // Sem renda o saldo não significa nada: o onboarding é obrigatório.
      // Esta carga só ABRE o onboarding; quem fecha é o último passo ou o
      // "pular" — senão salvar a renda no passo 1 já derrubaria os passos 2 e 3.
      // Só dispara no mês corrente: navegar para um mês futuro sem renda
      // cadastrada não é motivo para refazer a configuração inicial.
      if (mesAlvo === api.hoje.mes) setOnboardando((aberto) => aberto || !s.renda_definida);
      setErro('');
    } catch (e) {
      setErro(e.message || 'Falha ao buscar os dados do mês.');
    } finally {
      setCarregando(false);
    }
  }, [mes]);

  useEffect(() => { recarregar(mes); }, [mes, recarregar]);

  // -------------------------------------------------------------------------
  // Entrada de lançamento
  // -------------------------------------------------------------------------

  const enviar = async () => {
    const mensagem = entrada.trim();
    if (!mensagem || processando) return;
    setProcessando(true);
    setErro('');
    setConf(null);
    setSug(null);
    try {
      const r = await api.postGasto(mensagem);
      setEntrada('');
      if (r.requer_confirmacao) {
        // Compromisso recorrente: nada foi gravado, o usuário confirma no card.
        setSug({ tipo: r.tipo, sugestao: r.sugestao });
        vibrar([12, 40, 12]);
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

  const cadastrarSugestao = async ({ valor, campo2 }) => {
    const { tipo, sugestao } = sug;
    setSug(null);
    const dados = tipo === 'parcelamento'
      ? {
          descricao: sugestao.descricao, valor_parcela: valor, total_parcelas: campo2,
          parcela_inicial: sugestao.parcela_inicial || 1,
          mes_inicio: sugestao.mes_inicio || mes, categoria: sugestao.categoria,
        }
      : {
          descricao: sugestao.descricao, valor, dia_vencimento: campo2,
          categoria: sugestao.categoria,
        };
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

  // Abre o card em modo edição (sem contagem regressiva).
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
    const mesDoGasto = data.slice(0, 7);
    if (mesDoGasto === api.hoje.mes) {
      if (dia === api.hoje.dia) return `hoje ${hora}`;
      if (dia === api.hoje.dia - 1) return `ontem ${hora}`;
    }
    return `${String(dia).padStart(2, '0')}/${data.split('-')[1]} ${hora}`;
  };

  const mudarMes = (n) => setMes((m) => api.somaMes(m, n));

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
    a.download = `gastos-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const refazerOnboarding = async () => {
    await api.limparRenda(mes);
    setOnboardando(true);
    recarregar();
  };

  // Cada passo do onboarding grava e o próximo aparece.
  const concluirPassoOnboarding = async (passo, valor) => {
    if (passo === 1) {
      await api.definirRenda(valor, mes);
    } else if (passo === 2 && valor) {
      await api.confirmarCompromisso('conta_fixa', {
        descricao: 'Conta fixa', valor, dia_vencimento: 10, categoria: 'contas',
      });
    } else if (passo === 3 && valor) {
      await api.confirmarCompromisso('parcelamento', {
        descricao: 'Parcelamento', valor_parcela: valor, total_parcelas: 12,
        parcela_inicial: 1, mes_inicio: mes, categoria: 'compras',
      });
    }
    await recarregar();
    if (passo === 3) setOnboardando(false);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const cabecalhoEsq = `${nomeMes(mes).replace('/', ' / ')} — ${TITULOS[tela]}`;
  const cabecalhoDir = saldo && saldo.renda_definida
    ? `${Math.round(saldo.percentual_consumido)}% consumido`
    : 'sem renda';

  return (
    <div className="relative h-full flex flex-col bg-papel text-tinta overflow-hidden">
      {/* Ruído de papel: acima do conteúdo, abaixo dos cards. */}
      <div className="ruido absolute inset-0 pointer-events-none z-40 opacity-45 mix-blend-multiply" />

      {/* Espaço da status bar do sistema (black-translucent a desenha por cima). */}
      <div className="flex-none" style={{ height: 'max(14px, env(safe-area-inset-top))' }} />

      <header
        className="flex justify-between items-center px-5 pt-[14px] pb-[10px] border-b-2 border-tinta font-mono text-[11px] tracking-[.16em] uppercase flex-none z-20 gap-[10px] whitespace-nowrap"
        style={{ paddingLeft: 'max(20px, env(safe-area-inset-left))', paddingRight: 'max(20px, env(safe-area-inset-right))' }}
      >
        <span className="overflow-hidden text-ellipsis">{cabecalhoEsq}</span>
        <span className="opacity-55 flex-none">{cabecalhoDir}</span>
      </header>

      <main className="rolagem flex-1 overflow-y-auto overflow-x-hidden relative">
        {carregando ? (
          <div className="px-5 pt-10 font-mono text-[12px] opacity-50 leading-[1.6]">
            Lendo a folha…
          </div>
        ) : (
          <>
            {tela === 'home' && (
              <Home
                saldo={saldo} gastos={gastos} mes={mes} quando={quando}
                aoEditar={editarGasto} aoExcluir={excluirGasto}
              />
            )}
            {tela === 'resumo' && (
              <Resumo
                resumo={resumo} mes={mes} aoMudarMes={mudarMes}
                aoFiltrarCategoria={(c) => { setFiltro(c); setTela('historico'); }}
              />
            )}
            {tela === 'historico' && (
              <Historico
                gastos={gastos} busca={busca} aoBuscar={setBusca}
                filtro={filtro} aoFiltrar={setFiltro} quando={quando}
                aoEditar={editarGasto} aoExcluir={excluirGasto}
              />
            )}
            {tela === 'compromissos' && (
              <Compromissos
                compromissos={compromissos} saldo={saldo} mes={mes}
                aoVerProjecao={() => setTela('projecao')}
              />
            )}
            {tela === 'projecao' && (
              <Projecao projecao={projecao} aoVoltar={() => setTela('compromissos')} />
            )}
            {tela === 'config' && (
              <Ajustes
                mes={mes} saldo={saldo}
                aoSalvarRenda={salvarRenda} aoTestarSaude={api.health}
                aoExportar={exportarCsv} aoRefazer={refazerOnboarding}
              />
            )}
          </>
        )}
        {/* Espaço para a barra fixa não cobrir o fim da lista. */}
        <div className="h-[130px]" />
      </main>

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
          aoConcluirPasso={concluirPassoOnboarding}
          aoPular={() => setOnboardando(false)}
        />
      )}
    </div>
  );
}
