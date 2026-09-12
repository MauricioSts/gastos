# Minimau — frontend do app de gastos

App de controle de gastos por conversa. React 18 + Vite, estilos sob medida
(sem framework de UI), PWA instalável no iOS. Consome a
[gastos-api](../gastos-api) — backend Node + SQLite com extração por LLM local
(Ollama).

O conceito que organiza a interface inteira:

```
disponível de fato = renda − travado (contas fixas + parcelas) − gasto livre
ritmo do dia       = disponível de fato ÷ dias restantes
```

Os dois sentidos do dinheiro passam pelo mesmo campo de texto. `gastei 32 no
uber` reduz o disponível; `recebi um pix de 10` aumenta, virando uma linha de
renda do mês. Contas fixas e parcelamentos, que pesam em vários meses, nunca
são gravados direto: vão para um card de confirmação com os campos editáveis.

O número em destaque na Home é **sempre** o disponível de fato, nunca a renda
bruta, e a decomposição `Renda 1.700 − Travado 365 − Gasto 412` fica
permanentemente visível abaixo dele. Quem tem 1.700 de renda e 365 travados em
contas fixas e parcelas não tem 1.700 para gastar no dia 1º.

O mesmo campo de texto também tira dúvida de compra, na aba Consultor: *"vale a
pena comprar um fone de 300?"* é respondido com os números do próprio ciclo —
veredito calculado no servidor, explicação escrita pelo LLM local. Ver
[Consultor financeiro](#consultor-financeiro).

---

## Rodar local

```bash
npm install
npm run dev          # http://localhost:5173
```

Sem nenhuma variável de ambiente o app sobe com **dados de demonstração** que
reproduzem exatamente as telas de referência (renda 1.700, Internet 99, Luz 86,
Celular 12x de 180 na parcela 9). Nada de backend é necessário para ver o app
de pé.

### Ligando no backend real

Crie um `.env.local`:

```bash
VITE_USAR_MOCK=false
VITE_API_URL=http://localhost:3334
VITE_API_TOKEN=<o mesmo API_TOKEN do .env da gastos-api>
```

E autorize a origem no backend (`gastos-api/.env`), senão o navegador bloqueia
as chamadas por CORS:

```bash
CORS_ORIGENS=http://localhost:5173
sudo systemctl restart gastos-api
```

## Variáveis de ambiente

| Variável | Padrão | O que faz |
|---|---|---|
| `VITE_USAR_MOCK` | `true` | `false` liga no backend real |
| `VITE_API_URL` | vazio | Base da API, sem barra no fim. Em produção **precisa ser HTTPS** |
| `VITE_API_TOKEN` | vazio | Vai no header `X-API-Token` de toda chamada |

> Tudo que começa com `VITE_` é embutido no bundle e fica visível para quem
> abrir o DevTools. O token protege contra varredura automática, não contra
> uma pessoa determinada. Não é autenticação de usuário — é o que o projeto
> pede, mas vale saber o que ele é.

## Estrutura

```
src/
├── api/index.js              toda conversa com o servidor, mock incluído
├── App.jsx                   estado, navegação e orquestração das telas
├── splash.js                 quando a logo que pisca sai de cena
├── fontes.css                @font-face das fontes servidas pelo próprio app
├── componentes/
│   ├── BarraEntrada.jsx      input + microfone + navegação (fixos na base)
│   ├── CardConfirmacao.jsx   card de gasto ou entrada, com desfazer de 5s
│   ├── FormularioCompromisso.jsx  conta fixa / parcelamento, com variante
│   │                              invertida para o onboarding
│   ├── CardSugestao.jsx      card de compromisso recorrente (fósforo sólido)
│   ├── FaixaErro.jsx         aviso discreto acima da barra
│   ├── LinhaLancamento.jsx   linha com swipe revelando editar/excluir
│   ├── Mascote.jsx           o Minimau, SVG animado por CSS (prop corOlho)
│   ├── Logo.jsx              o rosto em viewBox quadrado: header e ícone PWA
│   ├── Notificacao.jsx       aviso de fatura no formato de notificação do iOS
│   └── telas/                Home, Painel, Historico, Compromissos,
│                             Projecao, Conselho, Ajustes, Onboarding
├── tema.js                   paleta, fontes, raios e rampa de categorias
├── hooks/                    placeholder rotativo, teclado iOS, vibração
└── utils/formato.js          formatação e leitura de valores em reais

public/
├── sw.js                     service worker (cache da casca do app)
├── fontes/                   woff2 das duas famílias, subsets latin
├── icones/                   32 a 1024, incluindo maskable
└── splash/                   splash estáticos do iOS, por resolução
```

Só a Home vem no bundle principal. As outras telas chegam por `import()` quando
a pessoa abre cada uma — no celular o que importa é o tempo até a **primeira**
tela aparecer, e gráfico, histórico e ajustes não participam dele.

Nenhum componente chama `fetch`. Trocar mock por backend real, ou mudar o
formato de uma rota, se resolve inteiramente em `src/api/index.js`.

### Tradução de contrato

O backend e as telas usam nomes diferentes para as mesmas coisas. A conversão
vive nas funções `normaliza*` de `src/api/index.js`:

| Backend | Telas |
|---|---|
| `resumo.categorias[].gasto_livre` | `por_categoria[].livre` |
| `resumo.gasto_livre` | `total` |
| `compromissos.contas_fixas` / `.parcelamentos` | `fixas` / `parcelas` |
| `projecao[].mes_referencia` / `.comprometido_total` / `.sobra_projetada` | `mes` / `comprometido` / `sobra` |
| `gastos[].data_gasto` + `.criado_em` | `data_gasto` com hora (`2026-08-14T13:12`) |

No modo mock o backend não existe, então o Painel do mês é derivado em
`getPainel(mes)`, na mesma camada, a partir dos gastos do ciclo e do ciclo
anterior (só para a variação). Contra o backend real quem entrega isso pronto é
`/api/dashboard`.

## Abertura no celular

O app abre em **uma** requisição de rede à API, e na segunda abertura abre sem
nenhuma.

Medido em Chromium com 4G simulado (9 Mbps, 150ms de latência por request),
mesma API pública nos dois casos, até o primeiro número real na tela:

| | Antes | Depois |
|---|---|---|
| Primeira abertura | 1132ms | 717ms |
| Segunda abertura | 1132ms | **121ms** |
| Requisições | 15 | 7 |
| Chamadas de API | 8 | 1 |
| Domínios envolvidos | 4 | 2 |

O que estava custando:

1. **Google Fonts bloqueando o primeiro paint.** Um `<link rel="stylesheet">`
   para `fonts.googleapis.com` põe dois domínios de terceiro no caminho crítico
   (o CSS vem de um, os arquivos de fonte de outro): dois DNS e dois TLS antes de
   qualquer texto poder aparecer. As duas famílias agora são servidas pelo
   próprio app, em `public/fontes/`, com `font-display: swap`, e só os subsets
   `latin` e `latin-ext` — cirílico, tailandês e vietnamita eram 17 arquivos de
   peso morto. As duas faces da primeira tela vão em `<link rel="preload">`.
2. **Cascata de boot.** Nenhum número pode ser pedido antes de saber qual ciclo
   está aberto (dia 29 já pertence ao seguinte), então o boot era `/api/ciclo` e
   **só então** sete chamadas em paralelo: duas rodadas de rede em série. Hoje é
   uma só, `/api/boot`, e a tela fica em "Ligando o painel…" por um RTT, não dois.
3. **Nada em cache entre aberturas.** Sem service worker, cada abertura baixava
   HTML, bundle, CSS e fontes de novo. O `public/sw.js` agora guarda a casca do
   app (cache primeiro para `/assets`, `/fontes`, `/icones`; rede primeiro com
   cache de reserva para o HTML) e **nunca** toca em `/api/*` — saldo velho
   servido de cache como se fosse o de agora seria o erro mais caro deste app.
4. **Tela vazia enquanto o primeiro número não chega.** O último boot
   bem-sucedido fica no `localStorage` e pinta a tela na hora, com o cabeçalho
   dizendo `atualizando…` (ou `dados de antes`, se a atualização falhar). O
   retrato é descartado se tiver mais de 7 dias ou se o ciclo virou desde que
   foi salvo — para isso o dia de fechamento vai gravado junto, já que a pessoa
   pode tê-lo mudado.

Efeito colateral útil do item 3 com o item 4: o app abre offline, mostrando os
números da última vez, marcados como antigos.

## A logo que pisca antes de abrir

O splash do iOS (`apple-touch-startup-image`) é um PNG estático — o sistema o
desenha antes de existir navegador, então não há como animá-lo. A animação vive
no `#splash` do `index.html`: o mesmo rosto, em SVG inline, no mesmo fundo e na
mesma posição do PNG, agora piscando. A troca entre os dois é invisível.

- **Inline, e não `<img>`**: o splash tem que aparecer sem esperar request
  nenhum — é justamente o que estamos tentando cortar. O CSS dele também é
  inline, pelo mesmo motivo.
- **Duas piscadas em ~600ms.** Pálpebra que fecha em intervalo constante parece
  máquina quebrada, não bicho olhando. Ambas acontecem no começo do ciclo de
  1,1s porque com service worker o app fica pronto em ~150ms: piscada que
  começasse depois disso nunca seria vista.
- **`MINIMO_MS = 700`** em `src/splash.js`: o splash não sai antes disso, mesmo
  com o app pronto. É o custo declarado de ter a logo piscando antes de abrir, e
  está calibrado para as duas piscadas terminarem pouco antes.
- Sai quando existe **conteúdo**, não quando o JS terminou de carregar. Erro no
  boot também encerra o splash — ficar na logo piscando para sempre esconderia a
  mensagem de erro.
- `prefers-reduced-motion` recebe a logo parada.

## Consultor financeiro

A aba **Consultor** responde dúvidas de compra com os números da pessoa:
"vale a pena comprar um fone de 300?", "cabe um monitor de 1200 em 6x?",
"quanto posso gastar hoje?".

A mesma barra de entrada faz as duas coisas — na aba do consultor ela pergunta
em vez de lançar, e o placeholder muda para avisar disso (sem ele a pessoa
digitaria "almoço 24" esperando registrar e receberia um conselho).

A tela é montada em duas ondas, e essa é a decisão de projeto central:

| Onda | O que é | Quando chega |
|---|---|---|
| Veredito + a conta | Aritmética no backend | ~200ms |
| A frase da resposta (mês, parcelas, valor) | Calculada no backend, não passa pelo modelo | com o veredito |
| O motivo | Texto do LLM local, em streaming | ~3s com o modelo quente |

O cartão de veredito (com cor e sinal próprios por resultado) aparece
praticamente na hora e o texto vai aparecendo escrito abaixo. Esperar o texto
para mostrar tudo junto transformaria uma resposta instantânea em dez segundos
de tela parada.

A primeira frase do texto **não vem do modelo**: mês, número de parcelas e valor
da parcela são calculados no backend e chegam junto com o veredito. O modelo
escreve só a frase do motivo, depois. Foi um teste que forçou isso: perguntado
"em que mês eu poderei comprar um fone de 1600 e em quantas parcelas?", o modelo
local respondeu três vezes de três jeitos, uma sem o mês e uma sem o ano, mesmo
com o dado na frente dele.

Nada é recalculado no cliente: os valores exibidos vêm do mesmo cálculo que
gerou o veredito, para a tela não conseguir divergir dele. E o modelo local não
decide nem calcula — quem faz isso é o `consultorService` do backend, que também
descarta qualquer frase que cite número inventado. Detalhes no README da API.

A conta central é a **folga**, não o disponível: `disponivel` menos o que o
próprio ritmo de gasto ainda vai consumir até a fatura fechar. Quem tem R$ 400
disponíveis e gasta R$ 25 por dia com 17 dias de ciclo pela frente não tem
R$ 400 para uma compra.

Dois vereditos existem porque a folga sozinha responde mal a duas perguntas
comuns, e a tela tem linha própria para cada um:

- `cabe_no_ritmo` — a compra é pequena e cabe no **gasto de hoje**, não na
  folga do ciclo. Um café de R$ 8 não é gasto extra; testá-lo contra a folga
  reprovava café sempre que o ciclo estava apertado.
- `cabe_parcelado_depois` — começando neste ciclo nada cabe, mas começando num
  mês futuro cabe. A linha mostra as parcelas e o mês de início, que é a resposta
  de "quando eu consigo, e em quantas vezes?".

## Direção visual

Terminal industrial: painel de instrumentos escuro com fósforo verde. Nada de
card branco, gradiente colorido, cofrinho ou gráfico de pizza.

| Token | Hex | Uso |
|---|---|---|
| `fundo` | `#05080A` | fundo do app |
| `painel` | `#0B1013` | campos e caixas internas |
| `tinta` | `#EDF3E9` | texto principal |
| `fosforo` | `#9BFF3B` | acento único: valores, ativos, bordas vivas |
| `fosforo-claro` | `#C9FF8F` | hover e olho do mascote em repouso |
| `atencao` | `#FFC24A` | processando, fatura fechando |
| `alerta` | `#FF5A3C` | ritmo estourado, ações destrutivas |

O fósforo aparece poucas vezes por tela e **nunca** como fundo de área grande.
Os tokens moram em `src/tema.js`; os estilos são objetos inline, junto do JSX.

Duas famílias, cada uma com um papel fixo: **Chakra Petch** para títulos,
interface e valores; **IBM Plex Mono** para todo o aparato (labels, metadados,
navegação, campos), sempre em caixa alta com `letter-spacing` entre `.14em` e
`.24em` nos labels. Nada abaixo de 9.5px.

Regras que valem em todo lugar:

- Raio 14px em campos e chips, 18–22px em cards. Bordas de 1px em
  `rgba(155,255,59,.22)`, sem sombra difusa colorida.
- **Scanline** fixa sobre tudo (`linear-gradient` de 1px a cada 3px, opacidade
  .5). Sem ela o app perde a leitura de terminal.
- Travado em verde escuro, gasto livre em fósforo, disponível vazio. Esse par
  se repete na régua da Home, nas barras do Painel e do Travado e na Projeção.
- Os centavos do saldo herói saem em fósforo; isso não se repete em lugar
  nenhum, é a assinatura da tela.
- Processamento é um tracejado que corre (`esteira`), nunca um spinner.

### O Minimau

O mascote é SVG vetorial animado por CSS (`src/componentes/Mascote.jsx`) — não
é vídeo, GIF nem Lottie. Ele flutua 7px em 4,2s, inclina a cabeça, acena com a
mão direita de quatro dedos (±17° em 1,15s, sem pulo) e **pisca duas vezes** por
ciclo de 6,4s. A cor da íris é `prop corOlho` e reflete o estado do app: verde
em repouso, laranja processando, vermelho quando o ritmo estourou.

O rosto isolado em viewBox quadrado é a logo (`Logo.jsx`), usada no cabeçalho a
22px, no avatar da notificação e como ícone do PWA — os PNGs de
`public/icones/` são rasterizações dele.

A fala do card da Home é gerada pelo estado, nunca texto fixo: dia limpo, ritmo
em dia, ritmo estourado, fatura fechando ou processando.

O onboarding cadastra compromissos de verdade — descrição, valor, vencimento,
categoria e, no parcelamento, **em que parcela você já está**. Esse último campo
é a razão do formulário existir: sem ele, uma compra na 9ª de 12 parcelas entra
como se estivesse na 1ª e o travado dos próximos meses nasce errado. A tela
Travado tem o mesmo formulário para criar, editar e excluir.

## iOS

- `viewport-fit=cover` + `env(safe-area-inset-*)` em todos os lados.
- Alvos de toque ≥ 44×44pt.
- `font-size: 16px` em todos os campos (abaixo disso o Safari dá zoom ao focar).
- Teclado: `visualViewport` mede quanto da tela foi coberto e a barra de
  entrada sobe junto (`--teclado` em `useTecladoIOS`).
- Manifest, ícones de 32 a 1024 (incluindo `maskable`) e splash screens para as
  cinco resoluções de iPhone mais comuns, todos gerados do SVG da logo. O splash
  estático emenda no `#splash` animado do HTML — mesma imagem, agora piscando.
- Vibração nos dois momentos de confirmação: `18ms` ao registrar um gasto,
  `[12,40,12]` ao sugerir um compromisso recorrente.
- Ditado por Web Speech API (`pt-BR`). Sem suporte, avisa na faixa discreta —
  nunca `alert`.

## Deploy

Ver [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md).
