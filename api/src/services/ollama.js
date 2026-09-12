// Cliente HTTP minimo para o Ollama local. Sem SDK, sem API paga.
const config = require('../config');

// Erro especifico da camada de LLM, para a rota traduzir em HTTP 503.
class ErroOllama extends Error {
  constructor(mensagem, causa) {
    super(mensagem);
    this.causa = causa;
  }
}

// Chama POST /api/chat com stream:false e format = JSON Schema.
// O parametro `format` faz o Ollama restringir a decodificacao ao schema,
// entao a saida e JSON valido por construcao (nao dependemos so do prompt).
async function chatEstruturado({ mensagens, schema, opcoes = {} }) {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), config.ollamaTimeoutMs);

  let resposta;
  try {
    resposta = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controlador.signal,
      body: JSON.stringify({
        model: config.ollamaModel,
        messages: mensagens,
        stream: false,
        format: schema,
        options: {
          // temperatura 0 deixa a extracao deterministica e repetivel
          temperature: 0,
          // saida e um JSON curto; teto evita divagacao em CPU lenta.
          // 300 cabe o schema completo (tipo + campos de parcela/vencimento).
          num_predict: 300,
          ...opcoes,
        },
      }),
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new ErroOllama(
        `O modelo local demorou mais de ${config.ollamaTimeoutMs / 1000}s para responder.`, e,
      );
    }
    throw new ErroOllama('Nao foi possivel falar com o Ollama local. Ele esta rodando?', e);
  } finally {
    clearTimeout(timer);
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    // 404 do Ollama normalmente significa modelo nao baixado.
    if (resposta.status === 404) {
      throw new ErroOllama(
        `Modelo "${config.ollamaModel}" nao encontrado no Ollama. Rode: ollama pull ${config.ollamaModel}`,
      );
    }
    throw new ErroOllama(`Ollama respondeu HTTP ${resposta.status}: ${corpo.slice(0, 200)}`);
  }

  const dados = await resposta.json();
  const conteudo = dados?.message?.content;
  if (typeof conteudo !== 'string' || !conteudo.trim()) {
    throw new ErroOllama('Ollama devolveu resposta vazia.');
  }

  let objeto;
  try {
    objeto = JSON.parse(conteudo);
  } catch (e) {
    // Nao deveria acontecer com `format` schema, mas tratamos por seguranca.
    throw new ErroOllama('Ollama devolveu conteudo que nao e JSON valido.', e);
  }

  return {
    objeto,
    // Metricas uteis para diagnosticar lentidao em CPU (nanosegundos -> ms).
    duracaoMs: dados.total_duration ? Math.round(dados.total_duration / 1e6) : null,
    modelo: dados.model || config.ollamaModel,
  };
}

// Chama POST /api/chat com stream:true e devolve o texto por pedacos.
//
// Sem schema: aqui a saida e prosa, nao dado. O streaming existe por causa da
// CPU -- o modelo local gera ~10 tokens/s, entao esperar a resposta fechada
// seria dez segundos de tela parada. Em pedacos, a frase aparece escrevendo.
//
// `aoPedaco(texto)` e chamado a cada fragmento; o retorno traz o texto inteiro.
async function chatTextoStream({ mensagens, opcoes = {}, aoPedaco, sinal }) {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), config.ollamaTimeoutMs);
  // Cliente desistiu (fechou o app): aborta a geracao em vez de queimar CPU.
  if (sinal) sinal.addEventListener('abort', () => controlador.abort(), { once: true });

  let resposta;
  try {
    resposta = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controlador.signal,
      body: JSON.stringify({
        model: config.ollamaModelConselho,
        messages: mensagens,
        stream: true,
        options: {
          // Conselho nao e extracao: um pouco de temperatura evita a frase
          // robotica, sem soltar o modelo para inventar numero.
          temperature: 0.3,
          // O modelo escreve UMA frase de motivo -- ~30 tokens. O teto baixo e
          // a segunda trava: em CPU a 9 tok/s, cada token a mais e espera real,
          // e o modelo pequeno tende a emendar paragrafo depois de responder.
          num_predict: 60,
          ...opcoes,
        },
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      throw new ErroOllama(`O modelo local demorou mais de ${config.ollamaTimeoutMs / 1000}s para responder.`, e);
    }
    throw new ErroOllama('Nao foi possivel falar com o Ollama local. Ele esta rodando?', e);
  }

  if (!resposta.ok) {
    clearTimeout(timer);
    const corpo = await resposta.text().catch(() => '');
    if (resposta.status === 404) {
      throw new ErroOllama(
        `Modelo "${config.ollamaModelConselho}" nao encontrado no Ollama. Rode: ollama pull ${config.ollamaModelConselho}`,
      );
    }
    throw new ErroOllama(`Ollama respondeu HTTP ${resposta.status}: ${corpo.slice(0, 200)}`);
  }

  // NDJSON: uma linha JSON por pedaco. A linha pode chegar partida entre dois
  // chunks da rede, entao o resto fica no buffer ate fechar.
  const leitor = resposta.body.getReader();
  const decodificador = new TextDecoder();
  let buffer = '';
  let texto = '';

  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      buffer += decodificador.decode(value, { stream: true });
      const linhas = buffer.split('\n');
      buffer = linhas.pop() || '';
      for (const linha of linhas) {
        if (!linha.trim()) continue;
        let dados;
        try { dados = JSON.parse(linha); } catch { continue; }
        const pedaco = dados?.message?.content;
        if (pedaco) {
          texto += pedaco;
          if (aoPedaco) aoPedaco(pedaco);
        }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') throw new ErroOllama('Geracao interrompida.', e);
    throw new ErroOllama('Falha lendo a resposta do Ollama.', e);
  } finally {
    clearTimeout(timer);
  }

  return { texto: texto.trim(), modelo: config.ollamaModelConselho };
}

// Ping usado pelo /api/health: lista modelos disponiveis.
async function verificarSaude() {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), 5000);
  try {
    const r = await fetch(`${config.ollamaUrl}/api/tags`, { signal: controlador.signal });
    if (!r.ok) return { online: false, erro: `HTTP ${r.status}` };
    const dados = await r.json();
    const modelos = (dados.models || []).map((m) => m.name);
    return {
      online: true,
      modelos,
      // Avisa se o modelo configurado nao esta baixado.
      modelo_configurado_disponivel: modelos.some(
        (n) => n === config.ollamaModel || n === `${config.ollamaModel}:latest`,
      ),
    };
  } catch (e) {
    return { online: false, erro: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chatEstruturado, chatTextoStream, verificarSaude, ErroOllama };
