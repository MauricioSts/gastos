import { useEffect, useRef } from 'react';
import Mascote from '../Mascote';
import { cor, MONO, cardAlto, rotulo, meta, caixa } from '../../tema';
import { fmt, fmt0 } from '../../utils/formato';
import { nomeMes } from '../../api';

// Tela de dúvida financeira: "vale a pena comprar X de Y?", "posso gastar
// hoje?", "quando cabe esse notebook?".
//
// A tela é montada em duas ondas, e isso é a decisão de projeto mais
// importante daqui: o veredito e os números vêm de conta no backend e chegam
// em milissegundos; a frase é escrita pelo LLM local, que em CPU leva segundos.
// Então o cartão de veredito aparece imediatamente e o texto vai aparecendo
// escrito abaixo. Esperar o texto para mostrar tudo junto transformaria uma
// resposta instantânea em dez segundos de tela parada.

const EXEMPLOS = [
  'vale a pena comprar um fone de 300?',
  'posso comprar um monitor de 1200 em 6x?',
  'quanto posso gastar hoje?',
  'quando cabe um notebook de 3500?',
];

// Cada veredito tem cor própria: a cor é a resposta lida antes do texto.
const CORES = {
  cabe_agora: cor.fosforo,
  // Cabe dentro do gasto do dia: é um sim, mas um sim pequeno — a cor é a do
  // sim, e o sinal é que muda.
  cabe_no_ritmo: cor.fosforo,
  cabe_parcelado: cor.atencao,
  cabe_parcelado_depois: cor.atencao,
  esperar: cor.atencao,
  nao_cabe: cor.alerta,
  sem_renda: cor.alerta,
  contexto: cor.fosforo,
};

const SINAL = {
  cabe_agora: '✓',
  cabe_no_ritmo: '·',
  cabe_parcelado: '≈',
  cabe_parcelado_depois: '≈',
  esperar: '⏳',
  nao_cabe: '✕',
  sem_renda: '!',
  contexto: '◍',
};

// "2026-09-29" -> "29/09". O rótulo do ciclo é jargão: o ciclo de out/2026 abre
// no dia 29 de setembro, e é a data que responde "a partir de quando".
const diaMes = (data) => {
  if (!data) return null;
  const [, mes, dia] = String(data).split('-');
  return `${dia}/${mes}`;
};

// Linha de número: rótulo à esquerda, valor à direita, sem caixa. Usado para a
// decomposição da conta — é o que sustenta o veredito.
function Linha({ texto, valor, corValor, forte }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      gap: 12, padding: '7px 0', borderBottom: `1px solid ${cor.divisor}`,
    }}
    >
      <span style={{ fontSize: 12.5, opacity: 0.55, minWidth: 0 }}>{texto}</span>
      <span style={{
        fontFamily: MONO, fontSize: 12.5, fontWeight: forte ? 600 : 500,
        color: corValor || cor.tinta, flex: 'none',
      }}
      >
        {valor}
      </span>
    </div>
  );
}

// Os números que explicam o veredito. Saem todos do backend: nada é recalculado
// aqui, para a tela não divergir da conta que gerou a decisão.
function Conta({ a }) {
  const f = a.retrato || {};
  const vista = a.a_vista || {};
  const parc = (a.parcelado_pedido && a.parcelado_pedido.cabe ? a.parcelado_pedido : null)
    || a.parcelado_sugerido || a.parcelado_pedido;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={rotulo({ marginBottom: 4 })}>A conta</div>

      <Linha texto="Disponível no ciclo" valor={`R$ ${fmt(f.disponivel)}`} />
      {/* Centavos, não arredondado: com "25/dia × 17d" ao lado de 420,41 a
          conta parece errada na tela mesmo estando certa. */}
      <Linha
        texto={`Seu ritmo (${fmt(f.media_diaria)}/dia × ${f.dias_restantes}d)`}
        valor={`− R$ ${fmt(f.necessidade_ate_fechar)}`}
      />
      <Linha
        texto="Folga real"
        valor={`R$ ${fmt(f.folga_atual)}`}
        corValor={f.folga_atual < 0 ? cor.alerta : cor.fosforo}
        forte
      />

      {a.tipo === 'compra' && (
        <>
          <Linha texto="Compra" valor={`R$ ${fmt(a.valor)}`} />
          <Linha
            texto={vista.cabe ? 'Sobra depois da compra' : 'Falta de folga'}
            valor={`R$ ${fmt(Math.abs(vista.sobra_depois))}`}
            corValor={vista.cabe ? cor.fosforo : cor.alerta}
            forte
          />
        </>
      )}

      {parc && (
        <Linha
          texto={`Em ${parc.parcelas}× de ${fmt0(parc.valor_parcela)}`}
          valor={parc.cabe ? 'cabe' : 'não cabe'}
          corValor={parc.cabe ? cor.fosforo : cor.alerta}
        />
      )}

      {/* Parcelamento que só cabe começando mais para frente: sem o mês de
          início a linha diria "cabe" sobre um plano que não cabe hoje. */}
      {a.parcelado_a_partir && (
        <Linha
          texto={`Em ${a.parcelado_a_partir.parcelas}× de ${fmt0(a.parcelado_a_partir.valor_parcela)}, a partir de`}
          valor={a.parcelado_a_partir.primeiro_dia
            ? `${diaMes(a.parcelado_a_partir.primeiro_dia)} · ${nomeMes(a.parcelado_a_partir.mes_inicio)}`
            : nomeMes(a.parcelado_a_partir.mes_inicio)}
          corValor={cor.atencao}
          forte
        />
      )}

      {/* Compra pequena: o que decide é o espaço do dia, não a folga do ciclo. */}
      {a.dentro_do_ritmo && a.dentro_do_ritmo.cabe && (
        <Linha
          texto="Cabe hoje no ritmo"
          valor={`R$ ${fmt(a.dentro_do_ritmo.cabe_hoje)}`}
          corValor={cor.fosforo}
          forte
        />
      )}

      {/* Duas datas diferentes, e a diferença importa: uma é o mês em que a
          folga daquele mês sozinha paga a compra; a outra é quando ela é paga
          juntando a folga de vários meses. Sem os rótulos distintos as duas
          linhas parecem se contradizer. */}
      {a.esperar_ate && (
        <Linha
          texto="Cabe de uma vez a partir de"
          valor={a.esperar_ate.primeiro_dia
            ? `${diaMes(a.esperar_ate.primeiro_dia)} · ${nomeMes(a.esperar_ate.mes_referencia)}`
            : nomeMes(a.esperar_ate.mes_referencia)}
          corValor={cor.atencao}
          forte
        />
      )}

      {a.juntando && a.juntando.meses > 0 && a.juntando.mes_referencia && (
        <Linha
          texto={`Guardando R$ ${fmt0(a.juntando.por_mes)}/mês, cabe em`}
          valor={nomeMes(a.juntando.mes_referencia)}
          corValor={cor.fosforo}
          forte
        />
      )}

      {a.tipo !== 'compra' && f.cabe_hoje != null && (
        <Linha
          texto="Cabe hoje no ritmo"
          valor={`R$ ${fmt(f.cabe_hoje)}`}
          corValor={f.cabe_hoje < 0 ? cor.alerta : cor.fosforo}
          forte
        />
      )}

      {/* Parcela que termina é o que muda um "não" em "espera pouco". */}
      {(a.alivios || []).slice(0, 2).map((al) => (
        <Linha
          key={al.mes_referencia}
          texto={`${nomeMes(al.mes_referencia)}: acaba ${al.itens.map((i) => i.descricao).join(', ')}`}
          valor={`+ ${fmt0(al.valor)}/mês`}
          corValor={cor.fosforo}
        />
      ))}
    </div>
  );
}

export default function Conselho({ consulta, corOlho, aoPerguntar, aoLimpar }) {
  const fim = useRef(null);

  // O texto cresce palavra por palavra; sem isto a frase nova nasce fora da
  // tela em celular pequeno.
  useEffect(() => {
    if (consulta && consulta.texto) fim.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [consulta && consulta.texto]);

  const vazio = !consulta;

  if (vazio) {
    return (
      <div style={{ padding: '18px 16px 0' }}>
        <div style={{
          border: `1px solid ${cor.linha}`, borderRadius: 22, background: cardAlto,
          padding: '16px 16px 16px 12px', display: 'flex', gap: 12, alignItems: 'center', overflow: 'hidden',
        }}
        >
          <Mascote corOlho={corOlho} largura={96} style={{ flex: 'none', margin: '-10px -6px -14px -6px', pointerEvents: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={rotulo({ color: cor.fosforo, opacity: 0.8 })}>Consultor</div>
            <div style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.35, marginTop: 6, textWrap: 'pretty' }}>
              Pergunte se uma compra cabe. Eu respondo com os seus números, não com palpite.
            </div>
          </div>
        </div>

        <div style={rotulo({ margin: '22px 4px 10px' })}>Exemplos</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {EXEMPLOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => aoPerguntar(e)}
              style={caixa({
                padding: '13px 15px', textAlign: 'left', fontSize: 13.5,
                display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center',
                minHeight: 44,
              })}
            >
              <span style={{ minWidth: 0 }}>{e}</span>
              <span style={{ color: cor.fosforo, fontFamily: MONO, flex: 'none' }}>↵</span>
            </button>
          ))}
        </div>

        <div style={meta({ margin: '18px 4px 0', lineHeight: 1.6 })}>
          O veredito e os valores são calculados no servidor. O modelo local só
          escreve a explicação — e qualquer número que ele invente é descartado
          antes de chegar aqui.
        </div>
      </div>
    );
  }

  const { pergunta, veredito, titulo, analise, texto, pensando, erro } = consulta;
  const acento = CORES[veredito] || cor.fosforo;

  return (
    <div style={{ padding: '18px 16px 0' }}>
      {/* A pergunta fica na tela: sem ela a resposta perde o referente. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 14, opacity: 0.55, fontStyle: 'italic', minWidth: 0, lineHeight: 1.4 }}>
          “{pergunta}”
        </div>
        <button
          type="button"
          onClick={aoLimpar}
          aria-label="Nova pergunta"
          style={{ ...meta({ opacity: 0.5 }), flex: 'none', minHeight: 28, padding: '0 2px' }}
        >
          limpar
        </button>
      </div>

      {erro && (
        <div style={caixa({ marginTop: 14, padding: '14px 16px', borderColor: 'rgba(255,90,60,.4)' })}>
          <div style={{ fontSize: 13.5, color: cor.alerta }}>{erro}</div>
        </div>
      )}

      {/* Veredito: chega antes do texto e é a resposta em si. */}
      {veredito && (
        <div
          style={{
            marginTop: 14, border: `1px solid ${acento}55`, borderRadius: 22,
            background: cardAlto, padding: '16px 18px',
            animation: 'emergir .34s cubic-bezier(.2,.9,.25,1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 13, flex: 'none',
              border: `1px solid ${acento}`, color: acento,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: MONO, fontSize: 13,
            }}
            >
              {SINAL[veredito] || '◍'}
            </span>
            <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.01em', color: acento }}>
              {titulo || 'Seus números'}
            </div>
          </div>

          {/* A frase do modelo, aparecendo enquanto é gerada. */}
          <div style={{ fontSize: 14.5, lineHeight: 1.55, marginTop: 12, textWrap: 'pretty' }}>
            {texto}
            {pensando && (
              <span style={{
                display: 'inline-block', width: 8, height: 15, marginLeft: 3, verticalAlign: '-2px',
                background: cor.fosforo, animation: 'mlPulso 1s steps(1,end) infinite',
              }}
              />
            )}
          </div>

          {pensando && !texto && (
            <div style={{ marginTop: 10 }}>
              <div className="esteira" style={{ height: 3, borderRadius: 2 }} />
              <div style={meta({ marginTop: 8 })}>escrevendo a explicação no modelo local…</div>
            </div>
          )}
        </div>
      )}

      {analise && <Conta a={analise} />}
      <div ref={fim} />
    </div>
  );
}
