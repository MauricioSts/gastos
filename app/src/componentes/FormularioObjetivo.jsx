import { useState } from 'react';
import { cor, MONO, SANS } from '../tema';
import { leValor } from '../utils/formato';

const texto = (v) => (v == null ? '' : String(v).replace('.', ','));

// Cadastro e edição de uma caixinha. Na reserva de emergência só o saldo é
// editável: o nome é fixo e a meta vem do multiplicador de despesas.
export default function FormularioObjetivo({ inicial = null, aoSalvar, aoCancelar, aoExcluir }) {
  const reserva = Boolean(inicial?.e_reserva);

  const [nome, setNome] = useState(inicial?.nome || '');
  const [meta, setMeta] = useState(reserva ? '' : texto(inicial?.meta));
  const [saldo, setSaldo] = useState(texto(inicial?.saldo_atual));
  const [peso, setPeso] = useState(texto(inicial?.peso));
  const [aviso, setAviso] = useState('');

  const campo = {
    boxSizing: 'border-box', width: '100%', border: '1px solid rgba(155,255,59,.24)',
    borderRadius: 12, background: cor.fundo, padding: '10px 12px',
    fontFamily: MONO, fontSize: 16, color: cor.tinta, outline: 'none', minHeight: 44,
  };

  const Rotulo = ({ children }) => (
    <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase', opacity: 0.45, marginBottom: 6 }}>
      {children}
    </div>
  );

  const CampoReais = ({ valor, aoMudar, rotulo, placeholder }) => (
    <div style={{ ...campo, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px' }}>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, opacity: 0.45 }}>R$</span>
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        aria-label={rotulo}
        style={{
          flex: 1, width: '100%', minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
          fontFamily: SANS, fontWeight: 700, fontSize: 24, color: cor.tinta, padding: 0,
        }}
      />
    </div>
  );

  const salvar = () => {
    const s = saldo.trim() === '' ? 0 : leValor(saldo);
    if (s == null || s < 0) { setAviso('O saldo guardado não pode ser negativo.'); return; }
    if (reserva) { aoSalvar({ saldo_atual: s }); return; }

    const n = nome.trim();
    if (!n) { setAviso('Dê um nome para reconhecer a caixinha.'); return; }

    let m = null;
    if (meta.trim()) {
      m = leValor(meta);
      if (!m || m <= 0) { setAviso('A meta precisa ser maior que zero — ou fica em branco.'); return; }
    }

    let p = null;
    if (peso.trim()) {
      p = leValor(peso);
      if (p == null || p < 0 || p > 100) { setAviso('O peso vai de 0 a 100 — ou fica em branco.'); return; }
    }

    aoSalvar({ nome: n, valor_meta: m, saldo_atual: s, peso: p });
  };

  return (
    <div style={{
      border: `1px solid ${cor.linhaViva}`, borderRadius: 18, background: cor.painel,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10,
      animation: 'emergir .28s cubic-bezier(.2,.9,.25,1)',
    }}
    >
      {reserva ? (
        <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.7, opacity: 0.6 }}>
          Nome e meta da reserva são fixos: a meta sai do multiplicador de despesa.
          Aqui dá para acertar o saldo, se ele não bater com a Caixinha Turbo.
        </div>
      ) : (
        <div>
          <Rotulo>Nome da caixinha</Rotulo>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="viagem"
            aria-label="Nome da caixinha"
            maxLength={60}
            style={{ ...campo, fontFamily: SANS }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {!reserva && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <Rotulo>Meta (opcional)</Rotulo>
            {CampoReais({ valor: meta, aoMudar: setMeta, rotulo: 'Meta', placeholder: '3000' })}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Rotulo>Já guardado</Rotulo>
          {CampoReais({ valor: saldo, aoMudar: setSaldo, rotulo: 'Saldo já guardado', placeholder: '0' })}
        </div>
      </div>

      {!reserva && (
        <div>
          <Rotulo>Peso na divisão (opcional)</Rotulo>
          <input
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            inputMode="decimal"
            placeholder="sem preferência"
            aria-label="Peso na divisão"
            style={campo}
          />
          <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.4, marginTop: 6, lineHeight: 1.6 }}>
            Proporção entre as caixas fora a reserva. Em branco, divide igual.
          </div>
        </div>
      )}

      {aviso && <div style={{ fontFamily: MONO, fontSize: 11, color: cor.alerta, lineHeight: 1.6 }}>{aviso}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {aoExcluir && (
          <button
            type="button"
            onClick={aoExcluir}
            style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: cor.alerta, minHeight: 44, padding: '0 6px' }}
          >
            Excluir
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={aoCancelar}
          style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', opacity: 0.6, minHeight: 44, padding: '0 12px' }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          style={{
            background: cor.fosforo, color: cor.fundo, borderRadius: 12, padding: '0 16px', minHeight: 44,
            fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', fontWeight: 600, textTransform: 'uppercase',
          }}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
