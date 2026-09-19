import { useEffect, useState } from 'react';
import {
  nomeMes, dataCurta, USAR_MOCK, LISTA_CAT, ROTULO_CAT,
  getVocabulario, ensinarTermo, esquecerTermo, logout,
  suportaFaceId, ativarFaceId, getPasskeys, removerPasskey, nomeDoAparelho,
} from '../../api';
import { fmt } from '../../utils/formato';
import { cor, MONO, SANS, rotulo } from '../../tema';

const botaoLargo = (extra = {}) => ({
  width: '100%', border: `1px solid ${cor.divisorForte}`, borderRadius: 16, padding: '14px 15px',
  minHeight: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  fontFamily: MONO, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', ...extra,
});

// Vocabulário: como você chama as coisas. Cada categoria corrigida num
// lançamento entra aqui sozinha; dá para ensinar um termo antes de usar e
// esquecer um que foi aprendido errado.
function Vocabulario({ aoErro }) {
  const [termos, setTermos] = useState(null);
  const [termo, setTermo] = useState('');
  const [categoria, setCategoria] = useState('alimentacao');

  useEffect(() => {
    let vivo = true;
    getVocabulario()
      .then((t) => { if (vivo) setTermos(t); })
      .catch((e) => { if (vivo) { setTermos([]); aoErro(e.message || 'Não consegui carregar o vocabulário.'); } });
    return () => { vivo = false; };
  }, [aoErro]);

  const ensinar = async () => {
    if (!termo.trim()) return;
    try {
      const novo = await ensinarTermo(termo.trim(), categoria);
      setTermos((lista) => [novo, ...(lista || []).filter((t) => t.termo !== novo.termo)]);
      setTermo('');
    } catch (e) {
      aoErro(e.message || 'Não consegui ensinar esse termo.');
    }
  };

  const esquecer = async (id) => {
    try {
      await esquecerTermo(id);
      setTermos((lista) => (lista || []).filter((t) => t.id !== id));
    } catch (e) {
      aoErro(e.message || 'Não consegui esquecer esse termo.');
    }
  };

  return (
    <>
      <div style={rotulo({ margin: '26px 0 9px' })}>Vocabulário</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ensinar(); }}
          placeholder="ex.: halls"
          aria-label="Termo para ensinar"
          style={{
            flex: 1, minWidth: 0, border: `1px solid ${cor.divisorForte}`, borderRadius: 12,
            background: cor.fundo, padding: '10px 12px', fontSize: 16, color: cor.tinta, outline: 'none',
          }}
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Categoria do termo"
          style={{
            width: 118, border: `1px solid ${cor.divisorForte}`, borderRadius: 12, background: cor.fundo,
            padding: '0 6px', fontFamily: MONO, fontSize: 10.5, textTransform: 'uppercase',
            color: cor.tinta, outline: 'none', minHeight: 44,
          }}
        >
          {LISTA_CAT.map((c) => <option key={c} value={c}>{ROTULO_CAT[c]}</option>)}
        </select>
        <button
          type="button"
          onClick={ensinar}
          style={{
            background: cor.fosforo, color: cor.fundo, borderRadius: 12, padding: '0 12px', minHeight: 44,
            fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', fontWeight: 600,
          }}
        >
          ENSINAR
        </button>
      </div>

      {termos === null && (
        <div style={{ fontFamily: MONO, fontSize: 10.5, opacity: 0.45, marginTop: 10 }}>carregando…</div>
      )}
      {termos && termos.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px', borderBottom: `1px solid ${cor.divisor}` }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.termo}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: cor.fosforo, flex: 'none' }}>
            {ROTULO_CAT[t.categoria] || t.categoria}
          </span>
          {t.usos > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.4, flex: 'none' }}>{t.usos}×</span>
          )}
          <button type="button" onClick={() => esquecer(t.id)} aria-label={`Esquecer ${t.termo}`} style={{ opacity: 0.5, padding: '0 6px', minHeight: 44, fontSize: 14 }}>
            ✕
          </button>
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.32, marginTop: 9, lineHeight: 1.7 }}>
        {termos && termos.length === 0
          ? 'Nada aprendido ainda. '
          : ''}
        Quando você troca a categoria de um lançamento, o termo entra aqui e o
        próximo lançamento com ele já sai nessa categoria, sem passar pelo modelo.
      </div>
    </>
  );
}

// Face ID: aparelhos que entram sem senha. Remover aqui tira o acesso do
// aparelho mesmo que a passkey continue no chaveiro dele.
function FaceId({ aoErro }) {
  const [lista, setLista] = useState(null);
  const [ativando, setAtivando] = useState(false);

  useEffect(() => {
    let vivo = true;
    getPasskeys()
      .then((l) => { if (vivo) setLista(l); })
      .catch((e) => { if (vivo) { setLista([]); aoErro(e.message || 'Não consegui carregar o Face ID.'); } });
    return () => { vivo = false; };
  }, [aoErro]);

  const ativar = async () => {
    setAtivando(true);
    try {
      if (await ativarFaceId(nomeDoAparelho())) setLista(await getPasskeys());
    } catch (e) {
      aoErro(e.message || 'Não consegui ativar o Face ID.');
    }
    setAtivando(false);
  };

  const remover = async (id) => {
    try {
      await removerPasskey(id);
      setLista((l) => (l || []).filter((p) => p.id !== id));
    } catch (e) {
      aoErro(e.message || 'Não consegui remover.');
    }
  };

  return (
    <>
      <div style={rotulo({ margin: '26px 0 9px' })}>Face ID</div>
      {lista === null && (
        <div style={{ fontFamily: MONO, fontSize: 10.5, opacity: 0.45 }}>carregando…</div>
      )}
      {lista && lista.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px', borderBottom: `1px solid ${cor.divisor}` }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 15 }}>{p.nome}</span>
          <span style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.45, flex: 'none' }}>
            {p.usado_em ? `usado ${dataCurta(p.usado_em.slice(0, 10))}` : `desde ${dataCurta(p.criado_em.slice(0, 10))}`}
          </span>
          <button type="button" onClick={() => remover(p.id)} aria-label={`Remover Face ID ${p.nome}`} style={{ opacity: 0.5, padding: '0 6px', minHeight: 44, fontSize: 14 }}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={ativar} disabled={ativando} style={botaoLargo({ marginTop: 10, opacity: ativando ? 0.5 : 1 })}>
        <span>{ativando ? 'Aguardando…' : 'Ativar neste aparelho'}</span>
        <span style={{ color: cor.fosforo }}>+</span>
      </button>
      <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.32, marginTop: 9, lineHeight: 1.7 }}>
        A passkey fica no chaveiro do iCloud e entra sem senha. Trocar a senha
        não remove o Face ID: remova aqui o aparelho perdido.
      </div>
    </>
  );
}

// Ajustes: renda do mês, ciclo da fatura, aviso, vocabulário, conexão e dados.
export default function Ajustes({
  mes, saldo, ciclo, rendas, avisar, aoAlternarAviso, aoTestarAviso, aoSalvarFechamento,
  aoSalvarRenda, aoRemoverRenda, aoTestarSaude, aoExportar, aoRefazer, aoErro,
}) {
  const [renda, setRenda] = useState('');
  const [saude, setSaude] = useState('não testado');
  const [fechamento, setFechamento] = useState('');

  // O campo edita só a linha fixa "Renda" (o salário). As outras entradas do
  // mês — um pix lançado pelo chat, por exemplo — aparecem na lista abaixo e
  // não são tocadas ao salvar.
  const principal = (rendas?.entradas || []).find((r) => r.descricao === 'Renda');
  const extras = (rendas?.entradas || []).filter((r) => r.descricao !== 'Renda');

  useEffect(() => {
    setRenda(principal ? principal.valor.toFixed(2).replace('.', ',') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal?.id, principal?.valor, mes]);

  const diaFechamento = saldo?.fatura ? saldo.fatura.dia_fechamento : null;
  useEffect(() => {
    setFechamento(diaFechamento ? String(diaFechamento) : '');
  }, [diaFechamento]);

  // Grava só quando o dia é válido; enquanto o campo está pela metade ("1" a
  // caminho de "18") ninguém reescreve o histórico.
  const mudarFechamento = (bruto) => {
    const limpo = bruto.replace(/\D/g, '').slice(0, 2);
    setFechamento(limpo);
    const n = parseInt(limpo, 10);
    if (n >= 1 && n <= 31 && n !== diaFechamento) aoSalvarFechamento(n);
  };

  const testar = async () => {
    setSaude('testando…');
    const h = await aoTestarSaude();
    setSaude(h.ok ? `online · ${h.modo} · ${h.latencia_ms}ms` : 'offline');
  };

  const linha = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '13px 15px', minHeight: 44,
  };

  return (
    <div style={{ padding: '16px 16px 10px' }}>
      {/* --------------------------------- Renda -------------------------------- */}
      <div style={rotulo()}>Renda de {nomeMes(mes)}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, border: `1px solid rgba(155,255,59,.24)`,
        borderRadius: 18, padding: '10px 14px', marginTop: 9, background: cor.painel,
      }}
      >
        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, opacity: 0.45 }}>R$</span>
        <input
          value={renda}
          onChange={(e) => setRenda(e.target.value)}
          inputMode="decimal"
          aria-label="Renda do mês"
          style={{
            flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
            fontFamily: SANS, fontWeight: 700, fontSize: 36, color: cor.tinta, padding: 0,
          }}
        />
        <button
          type="button"
          onClick={() => aoSalvarRenda(renda)}
          style={{
            background: cor.fosforo, color: cor.fundo, borderRadius: 12, padding: '11px 14px',
            minHeight: 44, display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: 10,
            letterSpacing: '.14em', fontWeight: 600,
          }}
        >
          SALVAR
        </button>
      </div>

      {extras.length > 0 && (
        <>
          <div style={rotulo({ margin: '22px 0 4px' })}>Outras entradas de {nomeMes(mes)}</div>
          {extras.map((r) => (
            <div key={r.id} style={{ ...linha, padding: '10px 2px', gap: 12, borderBottom: `1px solid ${cor.divisor}` }}>
              <span style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.descricao}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
                <span style={{ fontWeight: 700, fontSize: 24, lineHeight: 1, color: cor.fosforo }}>+{fmt(r.valor)}</span>
                <button type="button" onClick={() => aoRemoverRenda(r.id)} aria-label={`Remover ${r.descricao}`} style={{ opacity: 0.5, padding: '0 6px', minHeight: 44, fontSize: 14 }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.45, marginTop: 8, lineHeight: 1.7 }}>
            Total do mês: {fmt(saldo ? saldo.renda_total : 0)} — salário mais entradas.
          </div>
        </>
      )}

      {/* ---------------------------- Fatura e avisos --------------------------- */}
      <div style={rotulo({ margin: '26px 0 9px' })}>Fatura e avisos</div>
      <div style={{ border: `1px solid ${cor.linha}`, borderRadius: 18, background: cor.painel, overflow: 'hidden' }}>
        <div style={{ ...linha, borderBottom: `1px solid ${cor.divisor}` }}>
          <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.75 }}>Fatura fecha no dia</span>
          <input
            value={fechamento}
            onChange={(e) => mudarFechamento(e.target.value)}
            inputMode="numeric"
            aria-label="Dia em que a fatura fecha"
            style={{
              width: 62, border: `1px solid rgba(155,255,59,.3)`, borderRadius: 10,
              background: cor.fundo, padding: '7px 10px', fontFamily: SANS, fontWeight: 700,
              fontSize: 20, color: cor.fosforo, outline: 'none', textAlign: 'center',
            }}
          />
        </div>
        <button type="button" onClick={aoAlternarAviso} style={{ ...linha, width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.75 }}>Avisar 1 dia antes</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.4 }}>aviso do Minimau ao abrir o app</span>
          </div>
          <div style={{
            width: 50, height: 29, borderRadius: 16, flex: 'none', padding: 3, boxSizing: 'border-box',
            display: 'flex', justifyContent: avisar ? 'flex-end' : 'flex-start',
            background: avisar ? cor.fosforo : 'rgba(237,243,233,.16)', transition: 'background .2s',
          }}
          >
            <span style={{ width: 23, height: 23, borderRadius: 12, background: avisar ? cor.fundo : 'rgba(237,243,233,.7)', transition: 'all .2s' }} />
          </div>
        </button>
      </div>
      <button
        type="button"
        onClick={aoTestarAviso}
        style={botaoLargo({ marginTop: 9, border: `1px dashed rgba(155,255,59,.3)`, borderRadius: 14, padding: '12px 15px', color: cor.fosforo })}
      >
        <span>Ver a notificação</span>
        <span>◍</span>
      </button>
      <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.32, marginTop: 9, lineHeight: 1.7 }}>
        O ciclo corrente vai de {ciclo ? dataCurta(ciclo.inicio) : '—'} a{' '}
        {ciclo ? dataCurta(ciclo.fim) : '—'} e a fatura vence dia{' '}
        {ciclo ? ciclo.vencimento_fatura.slice(8, 10) : '—'}. Mudar o dia de
        fechamento recalcula todos os meses — nenhum gasto guarda a que ciclo
        pertence, é a janela que decide.
      </div>

      {/* ------------------------------ Vocabulário ----------------------------- */}
      <Vocabulario aoErro={aoErro} />

      {suportaFaceId() && <FaceId aoErro={aoErro} />}

      {/* -------------------------------- Conexão ------------------------------- */}
      <div style={rotulo({ margin: '26px 0 9px' })}>Conexão</div>
      <div style={{ border: `1px solid ${cor.divisorForte}`, borderRadius: 16, ...linha }}>
        <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.75 }}>{saude}</span>
        <button type="button" onClick={testar} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: cor.fosforo, padding: '8px 0' }}>
          testar
        </button>
      </div>

      {/* --------------------------------- Dados -------------------------------- */}
      <div style={rotulo({ margin: '26px 0 9px' })}>Dados</div>
      <button type="button" onClick={aoExportar} style={botaoLargo()}>
        <span>Exportar CSV</span>
        <span style={{ color: cor.fosforo }}>↓</span>
      </button>
      <button type="button" onClick={aoRefazer} style={botaoLargo({ marginTop: 10, border: '1px solid rgba(237,243,233,.1)', opacity: 0.6 })}>
        <span>Refazer configuração</span>
        <span>↺</span>
      </button>
      {!USAR_MOCK && (
        <button type="button" onClick={logout} style={botaoLargo({ marginTop: 10, border: '1px solid rgba(255,90,60,.35)', color: cor.alerta })}>
          <span>Sair deste aparelho</span>
          <span>⏻</span>
        </button>
      )}

      <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.32, marginTop: 22, lineHeight: 1.8 }}>
        {USAR_MOCK
          ? 'Dados mockados. Defina VITE_USAR_MOCK=false e VITE_API_URL para plugar o backend.'
          : 'Conectado ao backend real. A camada de API está isolada em src/api/index.js.'}
      </div>
    </div>
  );
}
