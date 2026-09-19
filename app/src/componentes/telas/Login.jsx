import { useState } from 'react';
import Mascote from '../Mascote';
import * as api from '../../api';
import { cor, MONO, SANS } from '../../tema';

// Porta de entrada. Aparece antes de qualquer número: sem sessão o app não
// pede nada ao backend, e o retrato do último boot já foi apagado no logout.
//
// Com Face ID cadastrado neste aparelho ele vira o botão principal e a senha
// fica de reserva. Sem ele, o primeiro login com senha termina num convite
// para ativar.
export default function Login({ aoEntrar }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState('');
  const [convite, setConvite] = useState(false);
  const faceId = api.suportaFaceId();
  const [faceIdPrimeiro, setFaceIdPrimeiro] = useState(() => faceId && api.temFaceId());

  const entrarFaceId = async () => {
    setEntrando(true);
    setErro('');
    try {
      if (await api.loginFaceId()) { aoEntrar(); return; }
    } catch (err) {
      setErro(err.message || 'O Face ID falhou.');
      if (!api.temFaceId()) setFaceIdPrimeiro(false);
    }
    setEntrando(false);
  };

  const ativar = async () => {
    setEntrando(true);
    setErro('');
    try {
      await api.ativarFaceId(api.nomeDoAparelho());
      aoEntrar();
    } catch (err) {
      // A sessão já está aberta: falhar aqui não impede de entrar.
      setErro(err.message || 'Não consegui ativar o Face ID.');
      setEntrando(false);
    }
  };

  const entrar = async (e) => {
    e.preventDefault();
    if (!usuario.trim() || !senha) { setErro('Informe e-mail e senha.'); return; }
    setEntrando(true);
    setErro('');
    try {
      await api.login(usuario.trim(), senha);
      if (faceId && !api.temFaceId()) { setConvite(true); setEntrando(false); return; }
      aoEntrar();
    } catch (err) {
      setErro(err.message || 'Falha no login.');
      setSenha('');
      setEntrando(false);
    }
  };

  const campo = {
    boxSizing: 'border-box', width: '100%', border: '1px solid rgba(155,255,59,.24)',
    borderRadius: 12, background: cor.fundo, padding: '12px 14px',
    fontFamily: MONO, fontSize: 16, color: cor.tinta, outline: 'none', minHeight: 44,
  };
  const rotuloCampo = {
    display: 'block', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.22em',
    textTransform: 'uppercase', opacity: 0.45, margin: '0 0 7px',
  };

  const botao = (principal) => ({
    width: '100%', borderRadius: 16, padding: 16, minHeight: 44,
    border: principal ? 'none' : '1px solid rgba(155,255,59,.35)',
    background: principal ? cor.fosforo : 'transparent', color: principal ? cor.fundo : cor.fosforo,
    fontFamily: MONO, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 700,
    opacity: entrando ? 0.5 : 1, cursor: entrando ? 'default' : 'pointer',
  });

  const cabecalho = (titulo, texto) => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Mascote corOlho={erro ? cor.alerta : cor.fosforoClaro} largura={86} />
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.24em', textTransform: 'uppercase', color: cor.fosforo }}>
            Minimau
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.2em', textTransform: 'uppercase', opacity: 0.4, marginTop: 4 }}>
            acesso restrito
          </div>
        </div>
      </div>

      <h1 style={{ fontFamily: SANS, fontSize: 30, fontWeight: 700, lineHeight: 1.1, margin: '28px 0 8px' }}>
        {titulo}
      </h1>
      <p style={{ fontFamily: SANS, fontSize: 14, opacity: 0.6, margin: '0 0 26px', lineHeight: 1.5 }}>
        {texto}
      </p>
    </>
  );

  const aviso = (
    <div role="alert" style={{ minHeight: 20, margin: '12px 0 6px', fontFamily: MONO, fontSize: 11, color: cor.alerta }}>
      {erro}
    </div>
  );

  return (
    <div
      style={{
        height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        boxSizing: 'border-box', padding: '0 26px', color: cor.tinta,
        background: 'radial-gradient(120% 70% at 50% 0%,#101A0E 0%,#04070A 55%)',
        paddingTop: 'max(40px, env(safe-area-inset-top))',
        paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
      }}
    >
      {convite ? (
        <div style={{ width: '100%', maxWidth: 380, margin: '0 auto' }}>
          {cabecalho('Entrar com Face ID?', 'Da próxima vez é só olhar para o celular. A senha continua valendo.')}
          {aviso}
          <button type="button" onClick={ativar} disabled={entrando} style={botao(true)}>
            {entrando ? 'Aguardando…' : 'Ativar Face ID'}
          </button>
          <button type="button" onClick={aoEntrar} disabled={entrando} style={{ ...botao(false), border: 'none', marginTop: 8, opacity: 0.6 }}>
            Agora não
          </button>
        </div>
      ) : (
      <form onSubmit={entrar} style={{ width: '100%', maxWidth: 380, margin: '0 auto' }}>
        {cabecalho('Quem está aí?', 'Entre para ver seus números.')}

        {faceIdPrimeiro && (
          <>
            <button type="button" onClick={entrarFaceId} disabled={entrando} style={botao(true)}>
              {entrando ? 'Entrando…' : 'Entrar com Face ID'}
            </button>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.2em', textTransform: 'uppercase', opacity: 0.4, textAlign: 'center', margin: '22px 0 16px' }}>
              ou com senha
            </div>
          </>
        )}

        <label htmlFor="login-usuario" style={rotuloCampo}>E-mail</label>
        <input
          id="login-usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)}
          type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          style={campo}
        />

        <label htmlFor="login-senha" style={{ ...rotuloCampo, marginTop: 16 }}>Senha</label>
        <input
          id="login-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password" style={campo}
        />

        {aviso}

        <button type="submit" disabled={entrando} style={botao(!faceIdPrimeiro)}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>

        {faceId && !faceIdPrimeiro && (
          <button type="button" onClick={entrarFaceId} disabled={entrando} style={{ ...botao(false), border: 'none', marginTop: 8, opacity: entrando ? 0.3 : 0.6 }}>
            Entrar com Face ID
          </button>
        )}
      </form>
      )}
    </div>
  );
}
