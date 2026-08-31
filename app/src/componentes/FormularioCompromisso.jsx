import { useState } from 'react';
import { LISTA_CAT, ROTULO_CAT } from '../api';
import { leValor } from '../utils/formato';

// Formulário de conta fixa ou parcelamento. Usado em dois lugares com a mesma
// aparência invertida ou não: no onboarding (sobre tinta) e na tela
// Compromissos (sobre papel).
//
// O campo que justifica este formulário existir é `parcela_atual`: sem ele,
// cadastrar uma compra que já está na 9ª de 12 parcelas é impossível, e o
// comprometido dos meses seguintes fica errado até a última parcela.
export default function FormularioCompromisso({
  tipo, inicial = null, invertido = false, mes,
  aoSalvar, aoCancelar, aoExcluir,
}) {
  const ehParcelamento = tipo === 'parcelamento';

  const [descricao, setDescricao] = useState(inicial?.descricao || '');
  const [valor, setValor] = useState(
    inicial ? String(ehParcelamento ? inicial.valor_parcela : inicial.valor).replace('.', ',') : '',
  );
  const [dia, setDia] = useState(String(inicial?.dia_vencimento || ''));
  const [totalParcelas, setTotalParcelas] = useState(String(inicial?.total_parcelas || ''));
  const [parcelaAtual, setParcelaAtual] = useState(String(inicial?.parcela_atual || '1'));
  const [categoria, setCategoria] = useState(
    inicial?.categoria || (ehParcelamento ? 'compras' : 'contas'),
  );
  const [ativa, setAtiva] = useState(inicial ? inicial.ativa !== 0 : true);
  const [aviso, setAviso] = useState('');

  // Paleta: sobre tinta tudo inverte, mas as regras de forma continuam as
  // mesmas — borda dura, raio zero, label mono em caixa alta.
  const c = invertido
    ? { texto: '#F6F1E4', borda: '#F6F1E4', campo: 'transparent', rotulo: 'opacity-55' }
    : { texto: '#16130D', borda: '#16130D', campo: '#F4EFE2', rotulo: 'opacity-55' };

  const Rotulo = ({ children }) => (
    <div className={`font-mono text-[10px] tracking-[.16em] uppercase ${c.rotulo} mb-[5px]`}>
      {children}
    </div>
  );

  const estiloCampo = {
    background: c.campo,
    borderColor: c.borda,
    color: c.texto,
  };

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
    <div className="border-2 p-[14px] flex flex-col gap-[14px]" style={{ borderColor: c.borda }}>
      <div>
        <Rotulo>{ehParcelamento ? 'O que você comprou' : 'Que conta é essa'}</Rotulo>
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={ehParcelamento ? 'celular' : 'internet'}
          aria-label="Descrição"
          className="w-full box-border border-[1.5px] px-[10px] py-[9px] font-sans text-[16px] outline-none min-h-[44px] placeholder:opacity-40"
          style={estiloCampo}
        />
      </div>

      <div className="flex gap-[10px]">
        <div className="flex-1">
          <Rotulo>{ehParcelamento ? 'Valor da parcela' : 'Valor mensal'}</Rotulo>
          <div
            className="flex items-center gap-2 border-[1.5px] px-[10px] min-h-[44px]"
            style={estiloCampo}
          >
            <span className="font-mono text-[13px] font-semibold opacity-55">R$</span>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder={ehParcelamento ? '180' : '99'}
              aria-label={ehParcelamento ? 'Valor da parcela' : 'Valor mensal'}
              className="flex-1 w-full border-none bg-transparent outline-none font-valor font-extrabold text-[30px] p-0 placeholder:opacity-30"
              style={{ color: c.texto }}
            />
          </div>
        </div>

        {!ehParcelamento && (
          <div className="w-[104px]">
            <Rotulo>Vence dia</Rotulo>
            <input
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              inputMode="numeric"
              placeholder="10"
              aria-label="Dia de vencimento"
              className="w-full box-border border-[1.5px] px-[10px] py-[9px] font-mono text-[16px] outline-none min-h-[44px] placeholder:opacity-40"
              style={estiloCampo}
            />
          </div>
        )}
      </div>

      {ehParcelamento && (
        <div>
          <Rotulo>Em que parcela você está</Rotulo>
          <div className="flex items-center gap-[10px]">
            <input
              value={parcelaAtual}
              onChange={(e) => setParcelaAtual(e.target.value)}
              inputMode="numeric"
              placeholder="9"
              aria-label="Parcela atual"
              className="w-[76px] box-border border-[1.5px] px-[10px] py-[9px] font-mono text-[16px] text-center outline-none min-h-[44px] placeholder:opacity-40"
              style={estiloCampo}
            />
            <span className="font-mono text-[11px] tracking-[.14em] uppercase opacity-55">de</span>
            <input
              value={totalParcelas}
              onChange={(e) => setTotalParcelas(e.target.value)}
              inputMode="numeric"
              placeholder="12"
              aria-label="Total de parcelas"
              className="w-[76px] box-border border-[1.5px] px-[10px] py-[9px] font-mono text-[16px] text-center outline-none min-h-[44px] placeholder:opacity-40"
              style={estiloCampo}
            />
          </div>
          <div className="font-mono text-[10px] opacity-50 mt-[6px] leading-[1.6]">
            Se você já pagou 8 de 12, está na 9. As parcelas param de contar
            sozinhas quando acabam.
          </div>
        </div>
      )}

      <div>
        <Rotulo>Categoria</Rotulo>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Categoria"
          className="w-full box-border border-[1.5px] px-[10px] py-[9px] font-mono text-[11px] tracking-[.1em] uppercase outline-none min-h-[44px]"
          style={{ ...estiloCampo, background: invertido ? '#16130D' : '#F4EFE2' }}
        >
          {LISTA_CAT.map((k) => (
            <option key={k} value={k}>{ROTULO_CAT[k]}</option>
          ))}
        </select>
      </div>

      {/* Desativar preserva o histórico dos meses passados; excluir apaga. */}
      {!ehParcelamento && inicial && (
        <button
          type="button"
          onClick={() => setAtiva((a) => !a)}
          className="flex items-center gap-[10px] font-mono text-[11px] tracking-[.14em] uppercase min-h-[44px]"
        >
          <span
            className="w-[18px] h-[18px] border-[1.5px] flex-none"
            style={{ borderColor: c.borda, background: ativa ? c.borda : 'transparent' }}
          />
          <span>{ativa ? 'Ativa · conta todo mês' : 'Desativada · não conta mais'}</span>
        </button>
      )}

      {aviso && (
        <div className="font-mono text-[11px] leading-[1.5] flex gap-2 text-carimbo">
          <span>≠</span>
          <span>{aviso}</span>
        </div>
      )}

      <div className="flex gap-[10px]">
        <button
          type="button"
          onClick={aoCancelar}
          className="flex-1 border-2 p-3 text-center font-mono text-[11px] tracking-[.14em] uppercase min-h-[44px]"
          style={{ borderColor: invertido ? 'rgba(246,241,228,.4)' : 'rgba(22,19,13,.35)' }}
        >
          Cancelar
        </button>
        {inicial && aoExcluir && (
          <button
            type="button"
            onClick={aoExcluir}
            className="flex-1 bg-carimbo text-tinta-clara p-3 text-center font-mono text-[11px] tracking-[.14em] uppercase min-h-[44px]"
          >
            Excluir
          </button>
        )}
        <button
          type="button"
          onClick={salvar}
          className="flex-[1.4] p-3 text-center font-mono text-[11px] tracking-[.14em] uppercase min-h-[44px]"
          style={{
            background: invertido ? '#F6F1E4' : '#16130D',
            color: invertido ? '#16130D' : '#F6F1E4',
          }}
        >
          {inicial ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </div>
  );
}
