# Prompt de implementação — Minimau (app de gastos por conversa)

> Cole tudo a partir da linha `---` na IA que vai implementar.
> Anexe junto: `Minimau - App iOS.dc.html` (protótipo funcional de referência),
> `api.js` (contrato + mock), `downloads/minimau-mascote.svg`,
> `downloads/minimau-logo.svg` e as 6 imagens de `telas-minimau/`.
> Onde este texto e o protótipo divergirem, **o protótipo vence**.

---

Implemente o frontend abaixo. Ele já foi desenhado, prototipado e validado —
seu trabalho é **reproduzir com fidelidade**, não redesenhar. Não introduza
cores, fontes, raios, sombras ou componentes que não estejam especificados.

## Stack obrigatória

- React 18 + Vite
- CSS-in-JS ou CSS Modules (sem MUI, Chakra, shadcn — tudo sob medida)
- Deploy alvo: Vercel · PWA instalável no iOS
- Comentários e nomes de variáveis em português

---

## 1. Direção estética — terminal industrial

Painel de instrumentos escuro com fósforo verde. Nada de card branco, nada de
gradiente colorido, nada de ícone de cofrinho, nada de gráfico de pizza.

### Paleta (exata)

| Token | Hex | Uso |
|---|---|---|
| `fundo` | `#05080A` | fundo do app |
| `fundo-fora` | `#03060A` | fora do device (só no mock) |
| `painel` | `#0B1013` | fundo de campos, caixas internas |
| `painel-alto` | `#0E1518` → `#080C0E` | gradiente 155° dos cards |
| `tinta` | `#EDF3E9` | texto principal |
| `fosforo` | `#9BFF3B` | acento único: valores, ativos, bordas vivas |
| `fosforo-claro` | `#C9FF8F` | hover, olho do mascote em repouso |
| `atencao` | `#FFC24A` | estado "processando" |
| `alerta` | `#FF5A3C` | estourou o ritmo, ações destrutivas |
| linhas | `rgba(155,255,59,.18–.28)` | bordas de contêiner |
| apagado | `opacity .4 / .5 / .55` | labels, metadados, texto inativo |

O `fosforo` aparece poucas vezes por tela e **nunca** como fundo de área grande.

### Tipografia

- **Chakra Petch** (400/500/600/700) — títulos, textos de interface, valores.
- **IBM Plex Mono** (400/500/600) — labels, metadados, navegação, inputs de
  aparato. Sempre `uppercase` + `letter-spacing` entre `.14em` e `.24em` nos
  labels; caixa normal e sem tracking extra em texto corrido.
- Escala: saldo herói ~72px peso 700; totais de bloco 34–38px; valores de linha
  26–30px; corpo 15.5px; labels mono 9.5–11px. **Nada abaixo de 9.5px.**

### Formas e movimento

- Raio: 14px em campos e chips, 18–22px em cards, 46px no bezel do device.
- Bordas de 1px em `rgba(155,255,59,.22)`; sem sombra difusa colorida.
- **Scanline**: overlay fixo `linear-gradient(rgba(155,255,59,.045) 1px,transparent 1px)`,
  `background-size:100% 3px`, `opacity:.5`, `pointer-events:none`. Sem ele o app
  perde a leitura de terminal.
- Animações: `subirValor` no saldo a cada mudança (remount por `key`),
  `descer` na notificação, `emergir` nos cards de confirmação, `esteira`
  (tracejado correndo) na barra de processamento — nunca spinner.

---

## 2. Mascote Minimau (identidade)

O robô é **SVG vetorial animado por CSS** — `minimau-mascote.svg`. Não use
vídeo, GIF, Lottie ou imagem rasterizada.

- Cabeça esférica com placas brancas laterais, trilhas de circuito em `fosforo`,
  duas engrenagens girando e uma lente central com íris concêntrica.
- **Piscadinha dupla**: duas pálpebras (topo e base) recortadas pelo círculo da
  lente, deslizando para o centro em ~88% e ~95% do ciclo de 6.4s.
- **Tchauzinho**: mão direita levantada com 4 dedos + polegar, oscilando
  ±17° em 1.15s; o braço acompanha com ±2.5°. **Sem pulo** — só flutuação
  vertical de 7px em 4.2s, sombra elíptica respirando junto.
- A **cor da íris reflete o estado do app**: `fosforo-claro` em repouso,
  `atencao` processando, `alerta` quando o ritmo estourou.
- **O rosto é a logo**: `minimau-logo.svg` é a mesma cabeça em viewBox quadrado,
  usada no cabeçalho (22px), no ícone PWA (1024px) e no avatar de notificação.

---

## 3. Conceito de dados: travado ≠ gasto

```
disponível de fato = renda − travado (contas fixas + parcelas) − gasto livre
ritmo do dia       = disponível de fato ÷ dias restantes
```

O número herói é **sempre** o disponível de fato, nunca a renda bruta. Logo
abaixo, sempre visível: `Renda 1.700 · Travado 365 · Gasto 412` em mono 11px.

Parcelas nunca são materializadas no banco: o mês em que incidem é derivado de
`mes_inicio`, `parcela_inicial` e `total_parcelas`, sob demanda.

---

## 4. Camada de API

Use `api.js` como está: módulo isolado, `BASE_URL` e `TOKEN` por env var,
header `X-API-Token` em toda chamada, e a flag `USAR_MOCK` que alterna mock ↔
backend real sem tocar em nenhum componente.

```
POST   /api/gastos            { mensagem }
       → { gasto, renda_total, comprometido_total, gasto_livre, disponivel, … }
       → { requer_confirmacao: true, tipo: 'conta_fixa'|'parcelamento', sugestao }
       → 422 { erro }
GET    /api/gastos?mes=&limite=      PATCH/DELETE /api/gastos/:id
GET    /api/saldo?mes=        → renda_total, comprometido_total, gasto_livre,
                                disponivel, percentual_consumido, dias_restantes,
                                ritmo_diario, renda_definida
GET    /api/dashboard?mes=    → por_categoria, dia_a_dia, semanas, maiores, comparativo
GET    /api/resumo?mes=       GET /api/compromissos?mes=   GET /api/projecao?meses=6
PATCH  /api/fatura            CRUD /api/rendas /api/contas-fixas /api/parcelamentos
GET    /api/health
```

Categorias: `alimentacao, transporte, lazer, saude, compras, contas,
assinaturas, educacao, outros`.

Mock inicial: renda 1.700; contas fixas Internet 99 (dia 10) e Luz 86 (dia 18);
parcelamento Celular 12× de 180 na parcela 9; fatura fechando em 1 dia.

---

## 5. Telas

Estrutura fixa: **status bar → cabeçalho → área rolável → barra de entrada →
navegação**. Cabeçalho: logo 22px + `MINIMAU` (tracking .3em) + `/ nome da tela`
à esquerda; ciclo da fatura à direita, colorido pelo risco. `nowrap` + ellipsis.

### Hoje (`home`)
1. **Card do Minimau**: mascote animado à esquerda (104px), à direita o estado
   (`escutando` / `processando` / `alerta`) em mono `fosforo` e a fala em 15.5px.
   A fala é gerada pelo estado, nunca texto fixo.
2. `DISPONÍVEL DE FATO` + saldo herói (centavos em `fosforo`).
3. Decomposição `Renda · Travado · Gasto`.
4. **Régua do mês**: 24 blocos de 1px de gap — travado em verde escuro, gasto
   livre em `fosforo`, restante vazio; legenda com swatches + `18D RESTANTES`.
5. Par de caixas: `RITMO DO DIA` (valor/dia) e `PASSOU HOJE` (em `alerta`
   quando acima do ritmo).
6. Lista de lançamentos com swipe horizontal revelando `EDITAR` / `EXCLUIR`
   (76px cada, limite −152px, snap −60px, `touch-action: pan-y`).
   Vazio: `Memória vazia. / Diga o primeiro gasto ao Minimau ali embaixo.`

### Painel
Seletor `◀ mês ▶`, totais do mês, gasto por categoria em barras-régua, curva
dia a dia, semanas e maiores gastos. Sem pizza, sem donut.

### Histórico
Busca por texto + chips de categoria com scroll horizontal (ativo = fundo
`fosforo`, texto escuro), agrupado por dia com total do dia.

### Travado (compromissos)
Bloco de topo destacado com o total travado do mês. `CONTAS FIXAS`: descrição +
`VENCE DIA 10 · TODO MÊS` + valor. `PARCELAMENTOS`: fileira de ticks (um
retângulo por parcela, preenchidos até a atual) + `9 DE 12 · TERMINA EM MAI/2027`.
Rodapé: `VER PROJEÇÃO DE 6 MESES →`.

### Projeção
Uma linha por mês: rótulo + `SOBRAM 1.335`, barra proporcional ao travado. No
mês em que um parcelamento acaba, selo em `fosforo`: `↓ CELULAR ACABA`. É o
único momento de alívio da tela — dê espaço a ele.

### Ajustes
Renda do mês em campo grande + `SALVAR`; ciclo da fatura; toggle
`Avisar 1 dia antes`; status `/api/health` com ação `TESTAR`; `EXPORTAR CSV`;
`REFAZER CONFIGURAÇÃO INICIAL`.

### Onboarding
Tela cheia sobre gradiente escuro, mascote 86px ao lado de `MINIMAU ONLINE` e
`passo N de 3`. Passos: renda (obrigatória), contas fixas (pulável),
parcelamentos (puláveis). Aparece sempre que `renda_definida === false`.

---

## 6. Barra de entrada + navegação (persistentes)

- Input `font-size:16px` (obrigatório, evita zoom no iOS), **placeholder
  rotativo** a cada 3.2s: `gastei 32 no uber…`, `almoço 24 reais`,
  `comprei um fone em 6x de 90`, `todo mês pago 99 de internet`, `mercado 187,40`.
- Microfone 46×46 (Web Speech API, `lang: pt-BR`, `interimResults: true`);
  ouvindo → inverte para `fosforo`. Sem suporte → mensagem leve, nunca alert.
- Envio 46×46 com glifo `↵`.
- Navegação de 5 alvos ≥44px: `HOJE · PAINEL · HISTÓRICO · TRAVADO · AJUSTES`.
  Ativo ganha o quadradinho preenchido em `fosforo`; inativos em opacidade .42.
- Erro 422: faixa discreta acima da barra, mono 11.5px, com `✕` para dispensar.

### Confirmações
- **Gasto comum**: card `emergir` acima da barra, valor e categoria editáveis
  ali mesmo (sem modal), `DESFAZER 5s` com contagem real. Vibração `18ms`.
- **Recorrente** (parcelamento/conta fixa): card visualmente distinto, explica
  em uma frase por que é diferente, campos parcela + total (ou valor + dia).
  `DESCARTAR` / `CADASTRAR`. Vibração `[12,40,12]`.
  Nada vira recorrente sem passar por aqui.

---

## 7. Requisitos de iOS

- `env(safe-area-inset-*)` em todos os lados; barra inferior respeita a home bar.
- Alvos ≥ 44×44pt. `-webkit-overflow-scrolling: touch` + `overscroll-behavior: contain`,
  scrollbar oculta.
- PWA: `apple-mobile-web-app-capable`, `status-bar-style=black-translucent`,
  `viewport-fit=cover`, manifest, ícones (use `minimau-logo.svg`) e splash.
- Teclado: input sobe junto via `visualViewport`, layout não quebra.
- Vibration API nos dois momentos de confirmação.

---

## 8. Entregáveis

- Componentes pequenos, um por bloco visual, comentados em português.
- Estados de carregando, erro e vazio em cada tela, no vocabulário acima —
  nunca skeleton cinza genérico, nunca spinner.
- Sem autenticação de usuário: o token da API basta.
- O mascote em arquivo próprio (`Mascote.jsx` + SVG inline), com prop `corOlho`
  para o estado, reutilizado na Home e no Onboarding.
