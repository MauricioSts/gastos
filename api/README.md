# Gastos API

Backend de controle de gastos pessoais que interpreta mensagens em linguagem
natural ("gastei 10 reais no almoço") usando um LLM **rodando localmente** via
[Ollama](https://ollama.com). Nenhuma API paga de LLM é usada — todo o
processamento de linguagem acontece na própria VM.

- Node.js 22 + Express (CommonJS, sem TypeScript)
- SQLite via `better-sqlite3` (arquivo local, sem servidor de banco)
- Saída do modelo forçada por **JSON Schema** (parâmetro `format` do Ollama),
  não apenas por instrução no prompt
- Autenticação por token, rate limit por IP, timezone `America/Sao_Paulo`

### Comprometido não é gasto

O orçamento do mês não é um número único. Ele se decompõe em:

| Peça | O que é |
|---|---|
| **Renda** | o que entra no mês (salário, freela) |
| **Comprometido** | obrigações já travadas antes do mês começar: contas fixas e parcelas em aberto |
| **Gasto livre** | o que já saiu no dia a dia (almoço, uber, mercado) |
| **Disponível de fato** | `renda − comprometido − gasto livre` |

O campo `disponivel` da API é **sempre** o último. Quem tem 1.700 de renda e 400
em parcelas tem 1.300 disponíveis no dia 1º, não 1.700. O mesmo vale para o
`ritmo_diario`, que é `disponivel ÷ dias_restantes`.

Parcelas **nunca** são materializadas como linhas no banco: quais parcelas
incidem em cada mês é calculado sob demanda a partir de `mes_inicio`,
`parcela_inicial` e `total_parcelas`. Quando as parcelas acabam, o valor para de
contar sozinho — e corrigir o cadastro recalcula o histórico inteiro.

### O mês de referência é o ciclo da fatura, não o calendário

O dinheiro não obedece ao calendário: o salário cai num dia, o cartão fecha em
outro e a fatura vence num terceiro. Por isso o período de referência da API vai
**do dia seguinte ao fechamento até o fechamento seguinte**.

Com a configuração padrão (fecha 28, recebe 30, paga 5), o ciclo `2026-09`:

| | |
|---|---|
| abre | 29/08 |
| fecha | 28/09 |
| renda que o banca | 30/08 |
| fatura vence | 05/10 |

Um gasto de 29/09 **não** é de setembro: ele entra na fatura que fecha em 28/10.
Somar por mês do calendário colocaria esse gasto no período errado e mostraria
um disponível que não existe.

O rótulo continua sendo `YYYY-MM` — o mês em que o ciclo fecha — então
`mes_referencia` segue valendo para renda, conta fixa, parcelamento, orçamento e
limite, sem migração de dados. O que mudou é o recorte dos **gastos**, que agora
é por intervalo de datas (`data_gasto BETWEEN inicio AND fim`).

Nada disso é gravado: a janela é derivada dos dias configurados em `CICLO_*`, de
modo que mudar o dia de fechamento recalcula o histórico inteiro. O cliente
descobre o ciclo aberto em `GET /api/ciclo` — no dia 29 o ciclo corrente já é o
do mês seguinte, e o calendário do navegador daria a resposta errada.

### Folga não é disponível

O consultor de compras (`/api/consultor`) responde "cabe ou não cabe" — e a
conta dele não é contra o `disponivel`, é contra a **folga**:

```
necessidade = média diária de gasto livre × dias que faltam no ciclo
folga       = disponivel − necessidade
```

Quem tem R$ 400 disponíveis e gasta R$ 25 por dia com 17 dias de ciclo pela
frente não tem R$ 400 para uma compra: tem R$ 400 menos os R$ 425 que o próprio
ritmo ainda vai consumir. Aprovar a compra pelo `disponivel` é aprovar um mês
que estoura no dia 20.

Sobre a folga ainda incide uma margem de 15%: compra que só cabe no mês perfeito
não cabe.

### O veredito não sai do modelo

O modelo local escreve a explicação. Ele **não decide** e **não calcula**:
veredito, meses e valores são computados em `consultorService.js`, e o prompt
recebe o veredito já pronto para justificar.

Isso não é preciosismo. Medido em `qwen2.5:3b`, o modelo respondeu "Comprar
agora é vantajoso" para uma compra que não cabia, e citou "R$ 224,81" — um valor
que não existia em lugar nenhum do contexto. Num app de dinheiro, conselho
inventado é pior que conselho nenhum.

Por isso a frase gerada passa por uma conferência antes de ir para o app: todo
número citado tem que estar no briefing. Frase com número desconhecido é
descartada e a geração é cortada ali — sobra a frase calculada, que é feia e
correta.

## Índice

1. [Requisitos](#requisitos)
2. [Instalação do Ollama (Ubuntu ARM64)](#instalação-do-ollama-ubuntu-arm64)
3. [Instalação da API](#instalação-da-api)
4. [Rodando como serviço (systemd)](#rodando-como-serviço-systemd)
5. [Expondo pelo Caddy](#expondo-pelo-caddy)
6. [Variáveis de ambiente](#variáveis-de-ambiente)
7. [Rotas e exemplos de curl](#rotas-e-exemplos-de-curl)
8. [Consultor de compras](#consultor-de-compras)
9. [Estrutura do projeto](#estrutura-do-projeto)
10. [Modelo de dados](#modelo-de-dados)
11. [Desempenho e escolha do modelo](#desempenho-e-escolha-do-modelo)
12. [Solução de problemas](#solução-de-problemas)

## Requisitos

- Ubuntu ARM64 (testado em Oracle VM.Standard.A1.Flex, 4 OCPUs, 24 GB RAM)
- Node.js 22+
- `zstd` (o instalador do Ollama precisa dele para extrair o pacote)
- ~5,5 GB de RAM livres para o modelo de 7B em CPU

## Instalação do Ollama (Ubuntu ARM64)

```bash
# 1) dependência do instalador
sudo apt-get update && sudo apt-get install -y zstd

# 2) instala o Ollama (detecta ARM64 sozinho; sem GPU roda em CPU)
curl -fsSL https://ollama.com/install.sh | sh

# 3) o instalador já cria e habilita o serviço systemd
systemctl is-active ollama
curl -s http://localhost:11434/api/tags
```

### Baixar o modelo

```bash
ollama pull qwen2.5:7b     # padrão: melhor qualidade de extração
# alternativa mais leve/rápida em CPU:
# ollama pull qwen2.5:3b
```

### Manter o modelo carregado na RAM (importante)

Por padrão o Ollama descarrega o modelo após 5 minutos ociosos. Em CPU, o
recarregamento leva ~20-40s e estoura o timeout de 30s da API. O override
abaixo mantém o modelo residente:

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<'EOF'
[Service]
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
EOF
sudo systemctl daemon-reload && sudo systemctl restart ollama

# aquece o modelo (primeira carga leva ~20s)
curl -s http://localhost:11434/api/chat \
  -d '{"model":"qwen2.5:7b","messages":[{"role":"user","content":"oi"}],"stream":false}' > /dev/null
```

Custo: ~5,5 GB de RAM ocupados permanentemente.

## Instalação da API

```bash
cd /home/ubuntu/gastos-api
npm install

# gera o .env a partir do exemplo, com um token aleatório
sed -e "s|^API_TOKEN=.*|API_TOKEN=$(openssl rand -hex 32)|" .env.example > .env
chmod 600 .env

npm start
```

O banco (`data/gastos.db`) e as tabelas são criados automaticamente no primeiro
boot. O servidor escuta apenas em `127.0.0.1` — o acesso externo passa pelo Caddy.

## Rodando como serviço (systemd)

```bash
sudo cp deploy/gastos-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gastos-api

systemctl status gastos-api
journalctl -u gastos-api -f       # logs em tempo real
```

O unit já traz `Restart=always`, encerramento limpo por SIGTERM e um
endurecimento básico (`ProtectSystem=strict`, com escrita liberada só em `data/`).

## Expondo pelo Caddy

Cole o conteúdo de `deploy/Caddyfile.snippet` no seu `/etc/caddy/Caddyfile`,
trocando `gastos.SEU-DOMINIO.com` pelo domínio real:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

O Caddy cuida do certificado HTTPS. Como a API só escuta em `127.0.0.1:3334`,
não há como alcançá-la sem passar por ele.

## Variáveis de ambiente

Todas documentadas em `.env.example`.

| Variável | Padrão | O que faz |
|---|---|---|
| `PORT` | `3334` | Porta local do Express |
| `API_TOKEN` | — | **Obrigatório**, mínimo 16 caracteres. Header `X-API-Token` |
| `TRUST_PROXY` | `true` | Confia no `X-Forwarded-For` (deixe ligado atrás do Caddy) |
| `DB_PATH` | `data/gastos.db` | Caminho do arquivo SQLite |
| `OLLAMA_URL` | `http://localhost:11434` | Endereço do Ollama local |
| `OLLAMA_MODEL` | `qwen2.5:3b` | Modelo usado na extração. O `qwen2.5:7b` continua funcionando e é ~2x mais lento |
| `OLLAMA_MODEL_CONSELHO` | vazio (usa `OLLAMA_MODEL`) | Modelo que escreve o conselho do consultor. Separado porque as duas tarefas têm exigências opostas: extração precisa de latência baixa (a pessoa espera para lançar um gasto), conselho roda em streaming e ganha mais com texto melhor |
| `OLLAMA_TIMEOUT_MS` | `90000` | Timeout da inferência (a extração leva ~15s com o modelo quente; a primeira chamada após mudar o prompt do sistema paga o *prompt eval* inteiro e pode passar de 45s) |
| `TZ_APP` | `America/Sao_Paulo` | Fuso usado para "hoje" e "ontem" |
| `CICLO_DIA_FECHAMENTO` | `28` | Dia em que a fatura fecha. Gasto feito depois dele já é do ciclo seguinte |
| `CICLO_DIA_RECEBIMENTO` | `30` | Dia em que a renda cai. Maior que o fechamento significa que a renda do ciclo chega no mês anterior ao rótulo |
| `CICLO_DIA_PAGAMENTO` | `5` | Dia em que a fatura fechada é paga, no mês seguinte ao fechamento |
| `RATE_LIMIT_JANELA_MS` | `60000` | Janela do rate limit |
| `RATE_LIMIT_MAX` | `60` | Requisições por IP por janela |
| `CORS_ORIGENS` | vazio | Origens de navegador autorizadas, separadas por vírgula. **Obrigatório** para o frontend hospedado em outro domínio (Vercel) conseguir chamar a API |

O processo **não sobe** se `API_TOKEN` estiver ausente ou curto demais.

## CORS

O frontend roda em outro domínio (Vercel), e o navegador só permite essa chamada
se a API autorizar a origem explicitamente. Liste as URLs em `CORS_ORIGENS`,
separadas por vírgula e sem barra no fim:

```bash
CORS_ORIGENS=https://folha.vercel.app,http://localhost:5173
sudo systemctl restart gastos-api
```

Origem fora da lista recebe **403** no preflight `OPTIONS` e nenhum cabeçalho
`Access-Control-Allow-Origin` — o navegador bloqueia a chamada. Requisições sem
header `Origin` (curl, app nativo) não são afetadas: CORS é uma regra de
navegador, não de autenticação. Quem protege a API é o `API_TOKEN`.

Conferindo:

```bash
curl -s -D- -o /dev/null -X OPTIONS \
  -H 'Origin: https://folha.vercel.app' \
  -H 'Access-Control-Request-Method: GET' \
  https://gastos.seu-dominio.com/api/saldo
```

## Rotas e exemplos de curl

Defina as variáveis usadas nos exemplos:

```bash
BASE=http://localhost:3334          # ou https://gastos.seu-dominio.com
TOKEN=$(grep '^API_TOKEN=' .env | cut -d= -f2)
```

Todas as rotas exigem o header `X-API-Token` (ou `Authorization: Bearer <token>`),
exceto `/api/health`.

### `GET /api/health` — status do serviço e do Ollama (público)

```bash
curl -s $BASE/api/health | jq
```

```json
{
  "status": "ok",
  "uptime_s": 107,
  "banco": { "online": true },
  "ollama": {
    "url": "http://localhost:11434",
    "modelo": "qwen2.5:7b",
    "online": true,
    "modelos": ["qwen2.5:7b"],
    "modelo_configurado_disponivel": true
  }
}
```

Responde **503** com `"status": "degradado"` se o banco ou o Ollama não responderem.

### `POST /api/gastos` — interpreta a mensagem e decide o que ela é

A mesma rota atende três casos. O modelo classifica a mensagem em `tipo`:

| `tipo` | O que acontece | HTTP |
|---|---|---|
| `gasto_avulso` | grava o gasto e devolve o saldo | 201 |
| `entrada` | grava uma linha de renda do mês — o dinheiro **entrou** | 201 |
| `conta_fixa` | **não grava**: devolve sugestão para o usuário confirmar | 200 |
| `parcelamento` | **não grava**: devolve sugestão para o usuário confirmar | 200 |

Um erro do LLM num gasto avulso estraga um registro; num compromisso recorrente
ele contamina vários meses. Por isso conta fixa e parcelamento passam
obrigatoriamente por confirmação. Gasto e entrada afetam só o mês corrente e
têm desfazer, então vão direto.

A classificação tem precedência explícita, nesta ordem: parcelamento (cita
parcelas) → conta fixa (recorre todo mês) → entrada (verbo de dinheiro
entrando) → gasto avulso (**o padrão**, inclusive quando não há verbo nenhum:
`almoço 24 reais` é gasto). A direção do dinheiro é o ponto delicado:
`paguei 120` é gasto, `me pagaram 120` é entrada; `pix de 30 pro joão` é gasto,
`pix de 30 do joão` é entrada.

**Entrada — o dinheiro que entrou:**

```bash
curl -s -X POST $BASE/api/gastos -H "X-API-Token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mensagem":"recebi um pix de 10 reais"}' | jq
```

```json
{
  "tipo": "entrada",
  "requer_confirmacao": false,
  "resposta": "Entrou: R$ 10,00 (pix). Disponível no mês: R$ 1.431,00",
  "entrada": { "id": 8, "mes_referencia": "2026-08", "descricao": "pix", "valor": 10 },
  "saldo": { "renda_total": 1710, "comprometido_total": 279, "disponivel": 1431 }
}
```

Vira uma linha em `rendas` do mês corrente, então **aumenta** o disponível — a
operação inversa do gasto. Desfazer é `DELETE /api/rendas/:id`.

**Gasto avulso:**

```bash
curl -s -X POST $BASE/api/gastos \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mensagem":"gastei 10 reais no almoço"}' | jq
```

```json
{
  "tipo": "gasto_avulso",
  "requer_confirmacao": false,
  "resposta": "Anotei: R$ 10,00 em alimentação. Disponível no mês: R$ 1.191,00",
  "gasto": {
    "id": 1, "valor": 10, "categoria": "alimentacao", "descricao": "almoço",
    "mensagem_original": "gastei 10 reais no almoço",
    "data_gasto": "2026-08-31", "criado_em": "2026-08-31T18:15:06.268Z"
  },
  "data_incerta": false,
  "saldo": { "renda_total": 1700, "comprometido_total": 499, "gasto_livre": 10,
             "disponivel": 1191, "ritmo_diario": 1191 },
  "llm": { "tentativas": 1, "duracao_ms": 15482, "modelo": "qwen2.5:7b" }
}
```

**Conta fixa — sugestão, nada gravado:**

```bash
curl -s -X POST $BASE/api/gastos -H "X-API-Token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mensagem":"meu aluguel e 800 e vence dia 5"}' | jq
```

```json
{
  "tipo": "conta_fixa",
  "requer_confirmacao": true,
  "resposta": "Isso parece uma conta fixa de R$ 800,00 em contas, que vai se repetir todo mês. Confere antes de eu salvar.",
  "confirmar_em": "POST /api/contas-fixas",
  "sugestao": { "descricao": "aluguel", "valor": 800, "dia_vencimento": 5,
                "categoria": "contas", "ativa": true },
  "mensagem_original": "meu aluguel e 800 e vence dia 5"
}
```

**Parcelamento — sugestão, nada gravado.** Quando a mensagem dá só o valor total
da compra, o backend divide:

```bash
curl -s -X POST $BASE/api/gastos -H "X-API-Token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mensagem":"comprei uma tv de 2160 em 12x"}' | jq
```

```json
{
  "tipo": "parcelamento",
  "requer_confirmacao": true,
  "resposta": "Isso parece uma compra parcelada: 12x de R$ 180,00 em compras. Confere antes de eu salvar.",
  "confirmar_em": "POST /api/parcelamentos",
  "sugestao": { "descricao": "tv compra", "valor_parcela": 180, "total_parcelas": 12,
                "valor_total": 2160, "parcela_inicial": 1, "mes_inicio": "2026-08",
                "categoria": "compras" }
}
```

A interface mostra os campos editáveis e, ao confirmar, faz o `POST` na rota
indicada em `confirmar_em`. `parcela_inicial` vem sempre como 1 (compra nova) —
para cadastrar algo já em andamento, o usuário corrige para a parcela atual.

Notas:

- `data_incerta: true` significa que o modelo detectou uma data que não é hoje
  nem ontem (ex.: "semana passada", "anteontem"). O gasto é gravado com a data de
  hoje — corrija com `PATCH` se precisar. O LLM nunca inventa datas absolutas.
- Se o modelo concluir que a mensagem não descreve nenhum lançamento
  (`valor <= 0`), a resposta é **422** e **nada é gravado**:

```bash
curl -s -X POST $BASE/api/gastos -H "X-API-Token: $TOKEN" \
  -H 'Content-Type: application/json' -d '{"mensagem":"bom dia, tudo bem?"}'
```

```json
{
  "erro": "Nao consegui identificar um gasto nessa mensagem. Tente algo como \"gastei 20 reais no almoco\".",
  "interpretado": false,
  "mensagem_original": "bom dia, tudo bem?"
}
```

### `GET /api/gastos` — lista com filtros

Filtros opcionais: `mes` (`YYYY-MM`), `categoria`, `limite` (padrão 50, teto 500).

```bash
curl -s -H "X-API-Token: $TOKEN" "$BASE/api/gastos?mes=2026-08&categoria=alimentacao&limite=10" | jq
```

### `PATCH /api/gastos/:id` — corrige um gasto que o LLM interpretou errado

Aceita qualquer combinação de `valor`, `categoria`, `descricao`, `data_gasto`.
O `valor` pode vir em formato brasileiro (`"47,90"`).

```bash
curl -s -X PATCH $BASE/api/gastos/2 \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"categoria":"compras","valor":"47,90"}' | jq
```

### `DELETE /api/gastos/:id` — remove um gasto

```bash
curl -s -X DELETE $BASE/api/gastos/2 -H "X-API-Token: $TOKEN" | jq
```

### `GET /api/ciclo` — janela do ciclo da fatura (padrão: ciclo corrente)

O app chama esta rota **antes** de qualquer número: no dia 29 o ciclo aberto já
é o do mês seguinte e o cliente não tem como deduzir isso sozinho.

```bash
curl -s -H "X-API-Token: $TOKEN" "$BASE/api/ciclo" | jq
```

```json
{
  "ciclo": "2026-09", "inicio": "2026-08-29", "fim": "2026-09-28",
  "data_recebimento": "2026-08-30", "vencimento_fatura": "2026-10-05",
  "dias_no_ciclo": 31, "ciclo_atual": "2026-09",
  "dias_decorridos": 4, "dias_restantes": 28,
  "configuracao": { "dia_fechamento": 28, "dia_recebimento": 30,
                    "dia_pagamento": 5, "notificar": true }
}
```

A `configuracao` sai do `.env` só enquanto ninguém a editar: o que estiver
gravado por `PATCH /api/fatura` vence.

### `GET /api/fatura` · `PATCH /api/fatura` — configuração do ciclo

O `.env` é o padrão de fábrica; esta rota é o ajuste do dia a dia, e o valor
gravado sobrevive a `systemctl restart`.

```bash
# fecha dia 20 e liga o aviso de véspera
curl -s -X PATCH $BASE/api/fatura \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"dia_fechamento": 20, "notificar": true}' | jq
```

Aceita `dia_fechamento`, `dia_recebimento`, `dia_pagamento` (inteiros de 1 a 31)
e `notificar` (booleano); pelo menos um é obrigatório. Dia fora da faixa é
**recusado**, nunca aparado para 31 — aparar em silêncio gravaria um ciclo que
ninguém pediu. A resposta devolve a configuração efetiva, a janela recalculada
e o saldo do ciclo corrente.

> Mudar um dia do ciclo **reescreve o passado**: nenhum gasto guarda a que mês
> pertence, então a janela nova vale para o histórico inteiro na consulta
> seguinte. É o comportamento desejado — quem cadastrou o fechamento errado
> conserta aqui e os meses passados param de estar errados junto. Como efeito
> colateral, um gasto pode trocar de ciclo: confira `GET /api/resumo` do mês
> anterior depois de mudar.

### `GET /api/dashboard` — retrato do gasto livre do ciclo

Existe separado de `/resumo` porque o público é outro: `/resumo` alimenta
decisão (quanto sobra, o que estourou), `/dashboard` alimenta leitura (curva do
dia a dia, semanas, maiores gastos, comparação com o ciclo anterior). Juntar os
dois faria toda tela pagar por agregação que não usa.

```bash
curl -s -H "X-API-Token: $TOKEN" "$BASE/api/dashboard?mes=2026-09" | jq
```

```json
{
  "mes_referencia": "2026-09",
  "ciclo": { "inicio": "2026-08-29", "fim": "2026-09-28", "dias_no_ciclo": 31 },
  "total": 349.41, "quantidade_gastos": 18,
  "media_diaria": 43.68,
  "maior_dia": { "data": "2026-09-06", "dia": 6, "valor": 177 },
  "dias_com_gasto": 8, "dias_no_ciclo": 31,
  "por_categoria": [
    { "categoria": "alimentacao", "valor": 147.91, "quantidade": 11, "percentual": 42.33 }
  ],
  "dia_a_dia": [ { "data": "2026-08-29", "dia": 29, "valor": 0 } ],
  "semanas": [ { "rotulo": "S1", "inicio": "2026-08-29", "fim": "2026-09-04", "valor": 20 } ],
  "maiores": [ { "id": 41, "descricao": "mercado", "valor": 177, "categoria": "alimentacao",
                 "data_gasto": "2026-09-06" } ],
  "comparativo": { "mes_anterior": "2026-08", "total_anterior": 0, "variacao": null },
  "hoje": "2026-09-09"
}
```

- Só gasto livre. O comprometido fica de fora: ele não acontece "por dia" nem
  foi escolha deste mês, então poluiria a curva e a rosca.
- `media_diaria` divide pelos **dias com gasto**, não pelo ciclo inteiro:
  dividir por 31 esconderia o tamanho do dia típico de quem gasta em rajadas.
- `dia_a_dia` traz todos os dias da janela, inclusive os zerados — buraco no
  eixo mentiria sobre o ritmo.
- `semanas` são blocos de 7 dias corridos a partir da abertura do ciclo, não
  semanas do calendário (que cortariam o ciclo em pedaços desalinhados).
- `comparativo.variacao` vem `null` quando o ciclo anterior não teve gasto: sem
  base a comparação seria ruído, e o cliente diz "sem base" em vez de inventar
  100%.

### `GET /api/saldo` — saldo do mês (padrão: ciclo corrente)

```bash
curl -s -H "X-API-Token: $TOKEN" "$BASE/api/saldo?mes=2026-08" | jq
```

```json
{
  "mes_referencia": "2026-08",
  "renda_definida": true,
  "renda_total": 1700,
  "comprometido_total": 499,
  "comprometido_contas_fixas": 99,
  "comprometido_parcelas": 400,
  "gasto_livre": 120,
  "quantidade_gastos": 1,
  "disponivel": 1081,
  "percentual_consumido": 36.41,
  "dias_restantes": 12,
  "ritmo_diario": 90.08,
  "gasto_hoje": 32,
  "ritmo_restante_hoje": 58.08,
  "fatura": {
    "dia_fechamento": 28, "dia_vencimento": 5,
    "fecha_em": "2026-08-28", "vence_em": "2026-09-05",
    "dias_para_fechar": 11, "total_ciclo": 619, "notificar": true
  },
  "orcamento_definido": false,
  "orcamento_gasto_livre": null
}
```

- `disponivel` = `renda_total − comprometido_total − gasto_livre`.
- `percentual_consumido` inclui o comprometido: ele já saiu da renda mesmo que o
  usuário não tenha gasto nada no dia a dia.
- `ritmo_diario` = `disponivel ÷ dias_restantes`. `dias_restantes` conta hoje,
  então nunca é zero no mês corrente. Fica `null` em meses já encerrados.
- `gasto_hoje` e `ritmo_restante_hoje` (`ritmo_diario − gasto_hoje`) respondem
  "quanto ainda cabe hoje". `ritmo_restante_hoje` negativo significa dia
  estourado — o sinal é informação, não erro. Em ciclo passado ou futuro,
  `gasto_hoje` é `0`: hoje não pertence àquela janela.
- `fatura.dias_para_fechar` conta a partir de hoje **sem** incluí-lo: `0` é o dia
  do fechamento, `1` é véspera. É o gatilho do aviso do app. Repare que
  `dias_restantes` inclui hoje, então os dois números diferem em 1 de propósito.
- `fatura.total_ciclo` é tudo que já pesa nesta fatura: comprometido + gasto livre.
- `orcamento_gasto_livre` é um **teto opcional de gasto livre**, independente da
  renda — serve para quem quer se limitar a menos do que poderia gastar. Não é o
  orçamento do mês; quem define o disponível é a renda.
- `total_gasto` continua presente como apelido de `gasto_livre`, para não quebrar
  clientes antigos.

Sem renda cadastrada para o mês, `disponivel`, `percentual_consumido` e
`ritmo_diario` vêm como `null` e `renda_definida` como `false` — nunca zero. Sem
renda o número não significa nada:

```json
{ "mes_referencia": "2026-09", "renda_definida": false, "renda_total": null,
  "comprometido_total": 499, "gasto_livre": 0, "disponivel": null,
  "percentual_consumido": null, "ritmo_diario": null }
```

### `GET /api/resumo` — agregado por categoria, separando compromisso de gasto

```bash
curl -s -H "X-API-Token: $TOKEN" "$BASE/api/resumo?mes=2026-08" | jq
```

```json
{
  "mes_referencia": "2026-08",
  "renda_total": 1700, "comprometido_total": 499, "gasto_livre": 120,
  "total_geral": 619, "disponivel": 1081, "percentual_consumido": 36.41,
  "dias_considerados": 31, "dias_restantes": 12,
  "media_diaria": 3.87, "ritmo_diario": 90.08,
  "categorias": [
    { "categoria": "compras", "total": 400, "gasto_livre": 0, "comprometido": 400,
      "quantidade_gastos": 0, "quantidade_compromissos": 2,
      "percentual_do_total": 64.62, "limite": null, "limite_estourado": null },
    { "categoria": "alimentacao", "total": 120, "gasto_livre": 120, "comprometido": 0,
      "quantidade_gastos": 1, "quantidade_compromissos": 0,
      "percentual_do_total": 19.39, "limite": 400, "limite_estourado": false }
  ]
}
```

Cada categoria traz `gasto_livre` e `comprometido` em campos separados, para a
interface não somar os dois numa barra só — são coisas de natureza diferente.

- `media_diaria` considera só o gasto livre: o comprometido não acontece "por dia".
- `dias_considerados` é o dia atual quando o mês é o corrente, e o total de dias
  quando o mês já terminou.
- `limite_estourado` compara o **gasto livre** com o limite, não o total: cobrar
  do usuário uma conta fixa que ele não escolheu no mês seria punição indevida.

### `GET /api/rendas` · `POST` · `PATCH /:id` · `DELETE /:id`

Mais de uma renda por mês é permitido (salário + freela). O `GET` aceita `?mes=`
e devolve a soma:

```bash
curl -s -X POST $BASE/api/rendas \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mes_referencia":"2026-09","descricao":"salário","valor":1700}' | jq
```

### `GET /api/contas-fixas` · `POST` · `PATCH /:id` · `DELETE /:id`

Recorre todo mês enquanto `ativa` for `true`. **Não gera linha em `gastos`** — é
compromisso, não gasto pontual. Use `?incluir_inativas=true` no `GET` para ver
também as desativadas.

```bash
curl -s -X POST $BASE/api/contas-fixas \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"descricao":"internet","valor":99,"dia_vencimento":10,"categoria":"contas"}' | jq
```

Para parar de contar sem apagar o cadastro: `PATCH /api/contas-fixas/:id` com
`{"ativa": false}`.

### `GET /api/parcelamentos` · `POST` · `PATCH /:id` · `DELETE /:id`

Aceita `valor_parcela` **ou** `valor_total` (nesse caso o backend divide pelo
número de parcelas). Para cadastrar algo já em andamento, informe
`parcela_inicial` e o `mes_inicio` correspondente a ela:

```bash
# já paguei 8 de 12; a 9ª cai em agosto/2026
curl -s -X POST $BASE/api/parcelamentos \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"descricao":"celular","valor_parcela":200,"total_parcelas":12,
       "parcela_inicial":9,"mes_inicio":"2026-08","categoria":"compras"}' | jq
```

O `GET` aceita `?mes=` e resolve os campos derivados para aquele mês:
`parcela_atual`, `parcelas_restantes`, `incide_no_mes`, `quitado` e `mes_fim`.

### `GET /api/compromissos?mes=YYYY-MM`

Contas fixas ativas + parcelas que realmente incidem naquele mês, já resolvidas.

```json
{
  "mes_referencia": "2026-08",
  "contas_fixas": [
    { "id": 1, "tipo": "conta_fixa", "descricao": "internet", "valor": 99,
      "dia_vencimento": 10, "categoria": "contas" }
  ],
  "parcelamentos": [
    { "id": 1, "tipo": "parcelamento", "descricao": "celular", "valor": 200,
      "categoria": "compras", "parcela_atual": 9, "total_parcelas": 12,
      "parcelas_restantes": 3, "mes_fim": "2026-11", "ultima_parcela": false }
  ],
  "total_contas_fixas": 99, "total_parcelas": 400, "total": 499
}
```

`ultima_parcela: true` marca o mês em que aquele parcelamento acaba.

### `GET /api/projecao?meses=6`

Comprometido projetado dos próximos N meses (padrão 6, teto 36), a partir de
`?mes=` ou do mês corrente.

```json
{
  "mes_inicial": "2026-08", "meses": 6,
  "projecao": [
    { "mes_referencia": "2026-11", "comprometido_total": 499,
      "comprometido_contas_fixas": 99, "comprometido_parcelas": 400,
      "renda_total": 1700, "renda_estimada": true, "sobra_projetada": 1201,
      "parcelamentos_terminando": [ { "id": 1, "descricao": "celular", "valor": 200 } ],
      "quantidade_parcelamentos": 2, "queda_no_mes_seguinte": 200 },
    { "mes_referencia": "2026-12", "comprometido_total": 299,
      "renda_total": 1700, "renda_estimada": true, "sobra_projetada": 1401,
      "parcelamentos_terminando": [], "quantidade_parcelamentos": 1 }
  ]
}
```

- `parcelamentos_terminando` e `queda_no_mes_seguinte` marcam o mês de alívio.
- `renda_estimada: true` significa que aquele mês ainda não tem renda cadastrada
  e a projeção repetiu a renda do mês inicial.

### `POST /api/orcamento` — teto opcional de gasto livre

Um por mês; redefinir o mesmo mês substitui o valor sem apagar histórico. **Não é
o orçamento do mês**: quem determina o disponível é a renda menos o comprometido.
Isto aqui é um teto voluntário sobre o gasto livre.

```bash
curl -s -X POST $BASE/api/orcamento \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mes_referencia":"2026-09","valor_total":800}' | jq
```

### `POST /api/limite-categoria` — teto por categoria em um mês

```bash
curl -s -X POST $BASE/api/limite-categoria \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"categoria":"alimentacao","mes_referencia":"2026-09","valor_limite":400}' | jq
```

Os limites aparecem em `/api/resumo` nos campos `limite` e `limite_estourado`.

### Categorias válidas

`alimentacao`, `transporte`, `lazer`, `saude`, `compras`, `contas`,
`assinaturas`, `educacao`, `outros`.

Ficam sem acento no banco (é o enum do JSON Schema); a frase em `resposta` usa
os rótulos acentuados.

### Códigos de erro

| Status | Quando |
|---|---|
| 400 | Input inválido (mensagem vazia, mês fora do formato, categoria desconhecida) |
| 401 | Token ausente ou incorreto |
| 404 | Gasto ou rota inexistente |
| 422 | A mensagem não descreve um gasto — nada é gravado |
| 429 | Rate limit por IP estourado (veja `Retry-After`) |
| 502 | O modelo devolveu saída inválida duas vezes seguidas |
| 503 | Ollama fora do ar, modelo não baixado ou inferência acima do timeout |

Toda resposta de erro é JSON com o campo `erro`.

## Consultor de compras

Duas rotas para a mesma pergunta: "quando vale a pena comprar X por Y?".

A análise é conta de banco e volta em milissegundos. O texto é escrito pelo
modelo local, que em CPU gera ~10 tokens/s. Por isso existe a versão em
streaming: o app pinta o veredito na hora e deixa a frase aparecer escrevendo.

### `POST /api/consultor` — resposta fechada (JSON)

```bash
curl -s -X POST $BASE/api/consultor \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"pergunta":"vale a pena comprar um fone de 300 agora?"}' | jq
```

Campos aceitos:

| Campo | Obrigatório | O que é |
|---|---|---|
| `pergunta` | sim | A dúvida em português (3 a 500 caracteres) |
| `mes` | não | Ciclo de referência `YYYY-MM` (padrão: ciclo aberto) |
| `valor` | não | Preço, quando o app já o tem; tem prioridade sobre a frase |
| `parcelas` | não | Número de parcelas a testar; idem |

O valor e o número de parcelas são lidos da própria frase quando não vêm no
corpo — `"6x de 90"` vira R$ 540 em 6 parcelas, `"um monitor de 1.200,00"` vira
R$ 1.200 à vista, `"50 mil"` vira R$ 50.000. Sem nenhum número, a pergunta é
tratada como dúvida geral e a resposta usa a fotografia do ciclo.

Resposta:

```json
{
  "pergunta": "vale a pena comprar um fone de 300 agora?",
  "tipo": "compra",
  "veredito": "esperar",
  "titulo": "Melhor esperar.",
  "texto": "Melhor esperar, pois à vista sem aperto só a partir de jan/2027…",
  "modelo": "qwen2.5:3b",
  "analise": {
    "valor": 300,
    "veredito": "esperar",
    "a_vista": { "cabe": false, "folga_util": -16.55, "sobra_depois": -316.55 },
    "parcelado_pedido": null,
    "parcelado_sugerido": null,
    "parcelado_a_partir": { "mes_inicio": "2026-10", "parcelas": 3,
                            "valor_parcela": 100, "meses_afetados": [] },
    "dentro_do_ritmo": { "cabe": false, "cabe_hoje": 23.58, "gasto_hoje": 0 },
    "esperar_ate": { "mes_referencia": "2027-01", "folga_util": 526.97 },
    "juntando": { "meses": 2, "mes_referencia": "2026-11", "por_mes": 150 },
    "alivios": [
      { "mes_referencia": "2026-10", "valor": 77.22,
        "itens": [{ "descricao": "Monitor Gamer", "valor": 77.22 }] }
    ],
    "retrato": { "disponivel": 400.94, "media_diaria": 24.73,
                 "necessidade_ate_fechar": 420.41, "folga_atual": -19.47,
                 "cabe_hoje": 23.58, "meses_futuros": [] }
  }
}
```

Vereditos possíveis:

| `veredito` | Significa |
|---|---|
| `cabe_agora` | A folga com margem paga a compra à vista |
| `cabe_no_ritmo` | Não cabe na folga, mas cabe no gasto de hoje (ver abaixo) |
| `cabe_parcelado` | À vista não cabe, mas existe parcelamento que cabe em **todos** os meses afetados, começando agora |
| `cabe_parcelado_depois` | Começando neste ciclo não cabe; começando num mês futuro, cabe — `parcelado_a_partir` diz qual mês e em quantas vezes |
| `esperar` | Nenhum parcelamento cabe antes, mas há um mês futuro em que a compra cabe à vista |
| `nao_cabe` | Não cabe em 12 meses de projeção, de nenhuma forma |
| `sem_renda` | Sem renda cadastrada no ciclo não há o que calcular |
| `contexto` | Pergunta sem compra: a resposta é a fotografia do ciclo |

`esperar_ate` é o mês cuja folga **sozinha** paga a compra. `juntando` é quando
ela é paga acumulando a folga de vários meses — são datas diferentes, e as duas
são respostas legítimas para "quando".

Um parcelamento só é aprovado se a parcela cabe em cada um dos meses que ela
atinge. Testar apenas o primeiro mês é o erro clássico: a parcela 9 cai num mês
que talvez já esteja cheio de outra coisa.

`parcelado_a_partir` existe porque a primeira parcela entra no ciclo aberto: com
o ciclo corrente já estourado, **nenhum** número de parcelas passava, e a
pergunta "quando eu consigo, e em quantas vezes?" ficava literalmente sem
resposta — o veredito caía em `nao_cabe`. A busca varre mês de início (1 a 12) e
número de parcelas (2, 3, 4, 5, 6, 10, 12) e devolve o primeiro par que cabe
inteiro, mês mais cedo primeiro, menos parcelas primeiro. Quando o usuário diz
um número de parcelas, esse número é testado antes dos usuais: respeitar o que
ele pediu vale mais que economizar um mês.

`cabe_no_ritmo` resolve a pergunta mais comum do app, e o erro era grosseiro: um
café de R$ 8 era testado contra a folga — o que sobra **depois** do ritmo de
vida — e reprovado sempre que o ciclo estava apertado. Café não é gasto extra, é
o ritmo. Compra até `retrato.cabe_hoje` (o que ainda cabe hoje sem estourar o
ritmo) recebe este veredito, e o briefing do modelo encurta para 4 linhas: é a
pergunta que mais se repete, e cada linha de prompt custa ~23ms de leitura.

### `POST /api/consultor/stream` — a mesma coisa em SSE

Mesmo corpo. A resposta é `text/event-stream`:

| Evento | Quando | `data` |
|---|---|---|
| `analise` | uma vez, imediato | igual à resposta fechada, sem `texto` |
| `pedaco` | N vezes | `{ "texto": "…" }`, uma frase por vez |
| `fim` | uma vez | `{ "texto": "frase inteira", "modelo": "…", "reserva": true? }` |
| `erro` | em falha não tratada | `{ "erro": "…" }` |

```bash
curl -sN -X POST $BASE/api/consultor/stream \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"pergunta":"posso comprar um monitor de 1200 em 6x?"}'
```

Erro de validação acontece antes de o stream abrir e volta como HTTP 400 normal.

`reserva: true` no evento `fim` significa que o texto não veio do modelo: ou o
Ollama estava fora do ar, ou a frase gerada foi reprovada na conferência de
número. Nos dois casos a resposta é a frase calculada — a decisão nunca dependeu
do modelo.

Os pedaços são frases fechadas, não tokens: a conferência de número só faz
sentido em frase inteira ("R$ 22" ainda pode virar "R$ 224,81"). Uma frase leva
~2s, então o texto continua aparecendo escrito.

## `GET /api/boot` — tudo do ciclo em uma resposta

```bash
curl -s "$BASE/api/boot" -H "X-API-Token: $TOKEN" | jq 'keys'
# ["ciclo","compromissos","dashboard","gastos","projecao","rendas","resumo","saldo"]
```

Cada chave traz exatamente o que a rota individual correspondente devolve —
`/api/ciclo`, `/api/saldo`, `/api/gastos`, `/api/dashboard`, `/api/resumo`,
`/api/compromissos`, `/api/projecao` e `/api/rendas` continuam existindo
sozinhas, e o cliente usa o mesmo normalizador para as duas origens.

Aceita `?mes=YYYY-MM` (padrão: ciclo aberto), `?limite=` (gastos, padrão 200) e
`?meses=` (projeção, padrão 6).

Por que existe: o app não consegue pedir número nenhum antes de saber qual ciclo
está aberto — dia 29 já pertence ao ciclo seguinte. O boot era `/api/ciclo` e
**só então** sete chamadas em paralelo: duas rodadas de rede em série, cada uma
custando um ida-e-volta completo, e a primeira ainda pagando DNS e TLS do
domínio da API. No celular em rede móvel essa é a diferença entre abrir na hora
e ficar em "Ligando o painel…".

Do lado do servidor não há custo: tudo é síncrono e sai do mesmo SQLite local,
então juntar as sete consultas custa microssegundos de CPU e economiza um RTT.

## Estrutura do projeto

```
gastos-api/
├── src/
│   ├── server.js              bootstrap do Express
│   ├── config.js              env vars validadas
│   ├── db/                    conexão SQLite + schema.sql
│   ├── middleware/            auth, rate limit, tratamento de erro
│   ├── routes/                gastos, finanças, compromissos, health,
│   │                          boot (tudo do ciclo numa resposta), consultor
│   ├── services/              ollama, extrator, gastosService, saldoService,
│   │                          compromissosService, painelService (dashboard),
│   │                          configService (config editável em runtime),
│   │                          consultorService (decide a compra),
│   │                          conselho (escreve e confere a frase)
│   └── utils/                 datas (timezone) e validação
├── deploy/                    unit systemd + snippet do Caddy
├── data/gastos.db             banco (criado no primeiro boot)
├── test.sh                    teste de fumaça das rotas (35 checks, HTTP)
├── teste-atalho.js            atalho sem LLM (19 casos)
├── teste-ciclo.js             ciclo da fatura (16 casos)
├── teste-classificacao.js     matriz de classificação do LLM (18 casos)
└── teste-consultor.js         veredito e briefing do consultor (32 casos)
```

Os quatro `teste-*.js` rodam com `node`. `teste-consultor.js` cria e apaga o seu
próprio banco (`data/teste-consultor.db`); `./test.sh` **suja o banco da
instância que ele ataca**, então aponte-o para uma instância isolada:

```bash
PORT=3400 DB_PATH=data/teste.db node src/server.js &
BASE=http://localhost:3400 ./test.sh
```

As rotas só orquestram: toda regra de negócio vive em `src/services/`.

## Modelo de dados

**`gastos`** — `id`, `valor` (REAL, > 0), `categoria`, `descricao`,
`mensagem_original`, `data_gasto` (`YYYY-MM-DD`), `criado_em` (ISO 8601).

A `mensagem_original` é sempre gravada, o que permite auditar depois toda vez
que o modelo interpretar algo errado:

```sql
SELECT id, mensagem_original, valor, categoria, descricao FROM gastos ORDER BY id DESC LIMIT 20;
```

**`configuracoes`** — `chave` (PK), `valor` (texto), `atualizado_em`. Guarda o
que `PATCH /api/fatura` grava: `ciclo_dia_fechamento`, `ciclo_dia_recebimento`,
`ciclo_dia_pagamento`, `fatura_notificar`. Chave desconhecida é recusada na
escrita, para a tabela não virar depósito de lixo, e o `.env` continua valendo
para toda chave que ninguém gravou.

**`orcamentos`** — `id`, `mes_referencia` (`YYYY-MM`, único), `valor_total`.

**`limites_categoria`** — `id`, `categoria`, `mes_referencia`, `valor_limite`,
único por (categoria, mês).

**`rendas`** — `id`, `mes_referencia` (`YYYY-MM`), `descricao`, `valor`,
`criado_em`. Mais de uma linha por mês é permitido.

**`contas_fixas`** — `id`, `descricao`, `valor`, `dia_vencimento` (1–31),
`categoria`, `ativa` (0/1), `criado_em`.

**`parcelamentos`** — `id`, `descricao`, `valor_parcela`, `total_parcelas`,
`parcela_inicial`, `mes_inicio` (`YYYY-MM`), `categoria`, `criado_em`.

Não existe tabela de parcelas. Em que mês cada parcela cai é derivado:

```
deslocamento  = meses entre mes_inicio e o mês consultado
parcela_atual = parcela_inicial + deslocamento
incide        = deslocamento >= 0 e parcela_atual <= total_parcelas
mes_fim       = mes_inicio + (total_parcelas − parcela_inicial) meses
```

Consequência prática: quando as parcelas acabam o valor some sozinho dos meses
seguintes, e corrigir o cadastro recalcula o histórico inteiro sem migração.

**Limitação conhecida:** uma conta fixa ativa incide em *todos* os meses
consultados, inclusive meses anteriores ao cadastro dela — a tabela não guarda
mês de início. Isso não afeta o mês corrente nem a projeção, só a consulta de
meses passados. Resolver exige acrescentar `mes_inicio`/`mes_fim` a
`contas_fixas`.

Consultas diretas ao banco:

```bash
sqlite3 data/gastos.db "SELECT categoria, SUM(valor) FROM gastos GROUP BY 1 ORDER BY 2 DESC;"
```

## Desempenho e escolha do modelo

Medições nesta VM (4 OCPUs ARM, sem GPU, `qwen2.5:7b` Q4), com o schema atual
(classificação em três tipos):

| Situação | Tempo |
|---|---|
| Modelo carregado, prompt do sistema já em cache | **~15 a 18s** por mensagem |
| Primeira chamada após alterar `PROMPT_SISTEMA` | ~50s (paga o *prompt eval* inteiro) |
| Modelo descarregado (cold start) | ~20 a 40s |

O gargalo é a geração em CPU, cerca de 4,5 tokens/s. O custo por mensagem é
proporcional ao número de campos do JSON de saída, e não ao tamanho da mensagem —
por isso o schema tem oito campos, não mais. Foi essa a razão de o valor total da
compra parcelada não virar um campo próprio: ele chega em `valor` e o backend
divide.

Acurácia da classificação em 18 casos (gasto avulso com e sem verbo, gíria,
"ontem", vírgula decimal, conta fixa com e sem dia de vencimento, parcelamento
por valor de parcela e por valor total, entrada por vários verbos, os pares
`paguei`/`me pagaram` e `pix pro`/`pix do`, e mensagem que não é lançamento):
**18/18 corretos**.

Duas regras do `PROMPT_SISTEMA` existem por causa de erro observado, não por
precaução — se você mexer nele, teste esses casos de novo:

- **`gasto_avulso` é o padrão explícito**, inclusive sem verbo. Sem essa frase o
  modelo classificava `almoço 24 reais` como entrada.
- **A descrição só pode usar palavras da mensagem.** Sem essa frase o modelo
  gravava `recebi um pix de 10` como "pix do joao", inventando um nome.

Se quiser respostas mais rápidas, troque o modelo em `.env`:

```bash
ollama pull qwen2.5:3b
sed -i 's|^OLLAMA_MODEL=.*|OLLAMA_MODEL=qwen2.5:3b|' .env
sudo systemctl restart gastos-api
```

O 3B responde em ~5 a 8s e usa ~2,5 GB de RAM, com acurácia menor em gírias e
frases ambíguas. Rode `./test.sh` depois de trocar para comparar — vale conferir
principalmente a classificação de `conta_fixa` e `parcelamento`, que é a parte
mais sensível.

### O consultor

Medições nesta VM com `qwen2.5:3b` quente:

| Etapa | Tempo |
|---|---|
| Análise completa (veredito, meses, folgas) | **~50ms** — é só SQLite e aritmética |
| Primeira frase do texto no ar | ~3 a 6s |
| Resposta inteira (2 frases) | ~8 a 15s |

Medido nesta VM (4 vCPU, sem GPU) com o prompt inteiro em 440 tokens:

| | `qwen2.5:3b` | `qwen2.5:7b` |
|---|---|---|
| Ler o prompt (cacheado) | 0,1s | 0,2s |
| Ler o prompt (briefing novo) | 43 tok/s | 12,6 tok/s |
| Gerar o texto | 9,3 tok/s | 4,7 tok/s |
| Resposta completa, modelo quente | **4s** | 9,8s |
| Primeira resposta com o modelo frio | ~20s | 98,8s |

O 3b fica. O 7b escreve uma prosa um pouco melhor e custa 2 a 3 vezes mais em
cada pergunta — e o que corrigiu as respostas confusas não foi modelo maior, foi
tirar do briefing o que o modelo pequeno invertia (ver abaixo).

**Contexto não é o gargalo, e aumentá-lo não ajuda.** O prompt inteiro são ~440
tokens dentro de uma janela de 4096: nunca houve truncamento para consertar.
Subir `num_ctx` só reserva mais RAM para KV cache. O que custa tempo é ler o
prompt a 43 tok/s — cada 43 tokens de briefing são 1s de espera antes da
primeira palavra — então mandar MAIS contexto deixa a resposta mais lenta, não
mais inteligente. O ganho está em curar quais números entram, não em mandar
todos.

**O modelo mora na RAM de propósito.** `OLLAMA_KEEP_ALIVE=-1` mantém o 3b
residente: 2,4 GB dos 23 GB da VM. Deixar o Ollama descarregar por inatividade
devolveria essa RAM e cobraria 20-40s de carga na primeira pergunta de cada uso
— exatamente no momento em que alguém está esperando resposta.

Trocar para `qwen2.5:7b` só no consultor:

```bash
sed -i 's|^OLLAMA_MODEL_CONSELHO=.*|OLLAMA_MODEL_CONSELHO=qwen2.5:7b|' .env
sudo systemctl restart gastos-api
```

Vale a conta se o 7B ficar quente na RAM (`OLLAMA_KEEP_ALIVE`); carregá-lo do
zero custa ~45s e ele ocupa ~5,5 GB ao lado do 3B que atende o lançamento de
gasto.

### O que o modelo pequeno errava, e como cada erro foi barrado

Nenhum destes é hipótese: todos saíram do `qwen2.5:3b` respondendo perguntas
reais deste banco.

| Saída errada | Causa | Conserto |
|---|---|---|
| "apenas R$ 16,55 de folga real" para uma folga de **−**16,55 | número negativo no briefing; o modelo perde o sinal | folga e disponível negativos vão em palavra ("nenhuma", "o ciclo já está R$ 100,00 no negativo") |
| "começando em novembro de 2026" quando a conta dizia out/2026 | mês inventado, que a conferência de número não pega | `mesesConferem` barra a frase que cita mês ausente do briefing, por abreviação ou nome inteiro |
| "faltam R$ 14,67 para a próxima parcela" (era a sobra do mês mais apertado) | número que o modelo inverte | o detalhe do mês mais apertado saiu do briefing |
| "a compra deixa a última parcela do Monitor Gamer sem folga" | o item que está **acabando** lido como o item da pergunta | alívio só entra no briefing quando é o argumento da espera |
| "VEREDITO: cabe parcelado…" / "Decisão: …" | modelo pequeno copia o formato do que lê | rótulo proibido no prompt e removido do início da frase no código |
| "junta em 5 meses" misturado com "parcele em 10x" | duas alternativas competindo no mesmo briefing | com saída parcelada decidida, a linha de juntar dinheiro sai |

## Solução de problemas

**`/api/health` responde 503 com `ollama.online: false`**
O Ollama caiu: `sudo systemctl status ollama` e `journalctl -u ollama -n 50`.

**`modelo_configurado_disponivel: false`**
O modelo do `.env` não foi baixado: `ollama pull qwen2.5:7b`.

**503 "O modelo local demorou mais de 30s para responder"**
Cold start. Confirme o override `OLLAMA_KEEP_ALIVE=-1` e aqueça o modelo (seção
de instalação do Ollama). Se persistir, use `qwen2.5:3b` ou aumente
`OLLAMA_TIMEOUT_MS`.

**502 "nao devolveu um gasto valido apos 2 tentativas"**
Raro, já que o `format` com JSON Schema restringe a saída. Veja o motivo exato
em `journalctl -u gastos-api | grep extrator`.

**Categoria sistematicamente errada**
Ajuste os exemplos de cada categoria no `PROMPT_SISTEMA` em
`src/services/extrator.js` — as descrições ali guiam a classificação. Depois
rode `./test.sh` para confirmar que nada regrediu.

**Zerar os dados de teste**

```bash
sudo systemctl stop gastos-api
rm -f data/gastos.db data/gastos.db-wal data/gastos.db-shm
sudo systemctl start gastos-api
```
