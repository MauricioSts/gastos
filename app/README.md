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
│                             Projecao, Ajustes, Onboarding
├── tema.js                   paleta, fontes, raios e rampa de categorias
├── hooks/                    placeholder rotativo, teclado iOS, vibração
└── utils/formato.js          formatação e leitura de valores em reais
```

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

O backend não tem rota de dashboard: o Painel do mês é derivado em
`getPainel(mes)`, na mesma camada, a partir dos gastos do ciclo e do ciclo
anterior (só para a variação).

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
  cinco resoluções de iPhone mais comuns, todos gerados do SVG da logo.
- Vibração nos dois momentos de confirmação: `18ms` ao registrar um gasto,
  `[12,40,12]` ao sugerir um compromisso recorrente.
- Ditado por Web Speech API (`pt-BR`). Sem suporte, avisa na faixa discreta —
  nunca `alert`.

## Deploy

Ver [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md).
