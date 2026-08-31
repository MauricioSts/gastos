# Prompt de implementação — App de Gastos "Folha" (React + Vite + Tailwind, PWA iOS)

> Cole tudo a partir da linha `---` na IA que vai implementar.
> As 9 imagens em `telas/` são a **referência visual normativa**: onde este texto
> e a imagem divergirem, a imagem vence.

---

Implemente o frontend descrito abaixo. Ele já foi desenhado e prototipado — seu
trabalho é **reproduzir o design com fidelidade**, não redesenhar. As imagens
anexadas são a verdade visual. Não introduza cores, fontes, raios de borda,
sombras ou componentes que não estejam nelas.

## Stack obrigatória

- React 18 + Vite
- Tailwind CSS (com as cores e fontes abaixo registradas no `tailwind.config.js`)
- Sem biblioteca de componentes (nada de MUI, Chakra, shadcn) — tudo sob medida
- Deploy alvo: Vercel
- Comentários no código em português

---

## 1. Direção estética — "Folha de escrituração"

O conceito é **livro-caixa impresso**: papel bone, tinta preta, carimbo
vermelho. Nada de card branco com sombra suave, nada de gradiente, nada de
ícone de cofrinho, nada de donut chart. Tudo é retângulo de borda dura sobre
papel.

### Paleta (exata, sem variações)

| Token | Hex | Uso |
|---|---|---|
| `papel` | `#E8E2D4` | fundo de todas as telas |
| `papel-claro` | `#F4EFE2` | fundo de campos de input e barras vazias |
| `tinta` | `#16130D` | texto, bordas, preenchimento de "gasto livre", fundo de telas invertidas |
| `tinta-clara` | `#F6F1E4` | texto sobre `tinta` e sobre `carimbo` |
| `carimbo` | `#D2360A` | acento único: centavos do saldo, ritmo diário, ações destrutivas, marcadores |
| `moldura` | `#211E17` | fundo fora do device (só no mock/preview) |

Regras de uso do acento:
- `carimbo` aparece **poucas vezes por tela**. Nunca como fundo de área grande.
- Opacidades derivadas de `tinta`: `.65` para labels secundários, `.55` para
  metadados, `.4`–`.45` para texto desativado, `.16` para linhas divisórias.

### Tipografia

Duas famílias, via Google Fonts:

- **Big Shoulders Display** (700/800) — **exclusivamente para valores em reais**
  e números grandes. É o herói. `line-height` entre `.82` e `1.05`,
  `letter-spacing: -.01em` nos tamanhos grandes.
- **IBM Plex Mono** (400/500/600) — todo o aparato contábil: labels, metadados,
  cabeçalhos de seção, botões, inputs de texto, navegação. Sempre
  `text-transform: uppercase` + `letter-spacing` entre `.1em` e `.24em` nos
  labels; caixa normal e sem tracking extra nos textos corridos.
- **IBM Plex Sans** (400/500/600) — apenas descrições de lançamento
  ("Almoço no Tonico"). É a única coisa em sans humanista da interface.

Escala de números (não altere):
- Saldo herói: `104px` / peso 800
- Ritmo diário: `44px`
- Totais de bloco (total do mês, média diária): `38px`
- Valores de linha de lançamento: `28–30px`
- Valor no card de confirmação: `36px`
- Prefixo `R$`: IBM Plex Mono `17px` peso 600, alinhado à base do número

Regra tipográfica central: **os centavos do saldo herói são impressos em
`carimbo`**, o resto do número em `tinta`. Isso se repete em nenhum outro lugar
— é a assinatura da tela.

### Textura

Overlay de ruído sobre toda a tela: SVG `feTurbulence`
(`baseFrequency=0.75`, `numOctaves=4`), `opacity: .3` no rect,
`opacity: .45` + `mix-blend-mode: multiply` no overlay, `pointer-events: none`,
`z-index` acima do conteúdo e abaixo dos modais. Sem isso o app fica plano e
perde a leitura de papel.

### Vocabulário de formas

- Bordas: `2px solid tinta` para contêineres estruturais, `1.5px` para
  contêineres internos, `1px solid rgba(22,19,13,.16)` para divisores de lista.
- **Raio de borda: zero.** Em nada, nunca (o único arredondado da imagem é o
  bezel do iPhone, que não faz parte do app).
- Sombra: apenas nos cards flutuantes, e é sombra dura deslocada
  (`6px 6px 0`), nunca desfoque.
- **Hachura diagonal** = comprometido/travado:
  `repeating-linear-gradient(45deg, #16130D 0 2px, transparent 2px 4px)`.
  **Sólido `tinta`** = gasto livre. **Vazio** = disponível. Esse par
  hachurado/sólido é a linguagem visual do app inteiro — repete na régua da
  Home, nas barras do Resumo e nas colunas da Projeção.

### Movimento

Só dois momentos ganham animação; não espalhe micro-interações:

1. **`carimbo`** — entrada dos cards de confirmação:
   `scale(.9) rotate(-2deg) opacity 0` → `scale(1.04) rotate(.5deg)` a 55% →
   `scale(1) rotate(0)`. Duração `.34s`, `cubic-bezier(.2,.9,.25,1)`.
2. **`subirValor`** — o saldo herói re-anima a cada mudança de valor:
   `translateY(10px) opacity 0` → `translateY(0) opacity 1`, `.45s`. Force o
   remount com `key={valorDisponivel}`.

Além disso: barra de progresso do processamento é um **tracejado que corre**
(`repeating-linear-gradient` horizontal + `background-position` animando
44px em `.7s linear infinite`), altura 4px, cor `carimbo` — nunca um spinner.

---

## 2. Conceito de dados: comprometido ≠ gasto

```
disponível de fato = renda − comprometido − gasto livre
ritmo diário       = disponível de fato ÷ dias restantes
```

O número herói é **sempre** o disponível de fato. Nunca a renda bruta. A
decomposição `Renda 1.700 − Comprometido 365 − Gasto 412` fica **sempre
visível** logo abaixo do herói, em Plex Mono 11.5px, com os valores em peso 600
e o comprometido em `carimbo`.

Parcelas nunca são materializadas no banco: o mês em que incidem é calculado a
partir de `mes_inicio`, `parcela_inicial` e `total_parcelas`, sob demanda.

---

## 3. Camada de API

Módulo isolado (`src/api/index.js`) com todas as chamadas. Base URL de env var,
header `X-API-Token` em todas. Flag `USAR_MOCK` que troca entre mock e backend
real sem tocar em nenhum componente. Contrato:

```
POST   /api/gastos            { mensagem }
       → { gasto, renda_total, comprometido_total, gasto_livre, disponivel, ... }
       → { requer_confirmacao: true, tipo: 'conta_fixa'|'parcelamento', sugestao }
       → 422 { erro }
GET    /api/gastos?mes=&categoria=&limite=
PATCH  /api/gastos/:id        DELETE /api/gastos/:id
GET    /api/saldo?mes=        → renda_total, comprometido_total,
                                comprometido_contas_fixas, comprometido_parcelas,
                                gasto_livre, disponivel, percentual_consumido,
                                dias_restantes, ritmo_diario, renda_definida
GET    /api/resumo?mes=       → por_categoria [{categoria, livre, comprometido, total, percentual}],
                                total, media_diaria
GET    /api/compromissos?mes= → { fixas, parcelas } com parcela_atual/total_parcelas/mes_fim
GET    /api/projecao?meses=6  → [{ mes, comprometido, renda, sobra, termina[] }]
CRUD   /api/rendas  /api/contas-fixas  /api/parcelamentos
GET    /api/health
```

Categorias: `alimentacao, transporte, lazer, saude, compras, contas,
assinaturas, educacao, outros`.

Comece com mock que reproduz o estado das imagens: renda 1.700, contas fixas
Internet 99 (dia 10) e Luz 86 (dia 18), parcelamento Celular 12x de 180 na
parcela 9, e os lançamentos visíveis na Home.

---

## 4. Telas

Estrutura fixa em todas: **status bar → cabeçalho → área rolável → barra
inferior fixa**. O cabeçalho é uma faixa com `border-bottom: 2px solid tinta`,
Plex Mono 11px uppercase: à esquerda `AGO / 2026 — FOLHA 01` (o nome da tela
substitui "folha 01"), à direita `46% CONSUMIDO`. `white-space: nowrap` +
ellipsis à esquerda — não pode quebrar em duas linhas.

### `01-home.png` — Home

De cima para baixo:
1. Label `DISPONÍVEL DE FATO`
2. `R$` + saldo 104px, centavos em `carimbo`
3. Decomposição `Renda − Comprometido − Gasto`
4. **Régua do mês**: 24 blocos dentro de uma caixa `2px` de 18px de altura,
   separados por `1px rgba(22,19,13,.2)`. Os primeiros N hachurados
   (comprometido), os seguintes M sólidos (gasto livre), o resto vazio.
   Legenda embaixo com os dois swatches + `18D RESTANTES`.
5. **Ritmo diário**: caixa `2px` dividida — texto à esquerda sobre papel, valor
   à direita em bloco `carimbo` sólido com `/DIA` em mono 10px.
6. Lista de lançamentos com cabeçalho `ÚLTIMOS LANÇAMENTOS / VALOR`.
   Cada linha: descrição (Plex Sans 15px) + `CATEGORIA · HOJE 13:12` (mono 10px
   uppercase, opacidade .5) à esquerda; valor (Big Shoulders 30px) à direita.

**Swipe horizontal** em cada linha: ações reveladas por baixo, `EDITAR`
(fundo `tinta`) e `EXCLUIR` (fundo `carimbo`), 76px cada. Arraste via pointer
events, limite `-152px`, snap em `-60px`, transição
`.26s cubic-bezier(.2,.9,.25,1)` só quando não está arrastando,
`touch-action: pan-y` na linha.

Estado vazio: `Folha em branco. / Registre o primeiro gasto abaixo.` em mono
12px opacidade .5 — nunca `R$ 0,00`.

### `02-confirmacao-gasto.png` — confirmação inline

Card flutuando acima da barra de entrada, borda `2px tinta`, sombra dura
`6px 6px 0 rgba(22,19,13,.9)`, animação `carimbo`. Faixa superior `tinta`:
`REGISTRADO` à esquerda, `DESFAZER 5s` (contagem regressiva real) à direita.
Corpo: input de valor (Big Shoulders 36px, borda 1.5px) + select de categoria
(mono uppercase) **editáveis direto no card, sem modal**. Descrição interpretada
embaixo em mono opacidade .6. Rodapé com dois botões meio a meio: `DESFAZER`
(papel) e `OK` (`carimbo`). O card some sozinho ao fim da contagem.
Vibration API: `18ms` ao registrar.

### `03-confirmacao-parcelamento.png` — sugestão recorrente

**Visualmente distinto** do card comum: borda e sombra em `carimbo`, faixa
superior `carimbo` com o texto `ISTO VAI SE REPETIR — CONFIRME`. Explica em
uma frase por que é diferente ("'Fone' parece um parcelamento. Vai pesar no
comprometido de vários meses."). Dois campos: valor da parcela + total de
parcelas (ou valor + dia de vencimento, no caso de conta fixa), com legenda
mono embaixo. Rodapé: `DESCARTAR` / `CADASTRAR`. Vibração `[12,40,12]`.

Nada é gravado como recorrente sem passar por este card.

### `04-resumo.png` — Resumo do mês

Seletor de mês `◀ AGO/2026 ▶` em caixa `2px`. Abaixo, uma caixa dividida em
dois: `TOTAL DO MÊS` e `MÉDIA DIÁRIA`, valores em Big Shoulders 38px.
Por categoria: para cada uma, label mono uppercase + total 26px, e uma
**barra-régua** de 12px com borda 1px, largura proporcional ao maior total,
dividida em segmento hachurado (comprometido) + segmento `carimbo` (livre).
Sem donut, sem pizza, sem legenda colorida. Tocar na categoria leva ao
Histórico já filtrado.

### `05-historico.png` — Histórico

Busca por texto (input mono, borda 2px), fileira de chips de categoria com
scroll horizontal (chip ativo = fundo `tinta`, texto `tinta-clara`),
agrupamento por dia com cabeçalho `14 DE AGO` + total do dia e
`border-bottom: 2px`. Mesmas linhas com swipe da Home. Vazio:
`Nenhum lançamento com esse filtro.` centralizado.

### `06-compromissos.png` — Compromissos

Bloco de topo **invertido** (fundo `tinta`, texto `tinta-clara`) com o total
comprometido do mês em Big Shoulders 44px e a contagem
`2 contas fixas · 1 parcelamento(s)`.
Seção `CONTAS FIXAS`: descrição + `VENCE DIA 10 · TODO MÊS` + valor.
Seção `PARCELAMENTOS`: descrição + valor da parcela, e abaixo uma **fileira de
ticks** — um retângulo de 9px com borda 1px por parcela, preenchidos em `tinta`
até a parcela atual. Legenda `9 DE 12 · TERMINA EM MAI/2027`. Esse tick é o
dado mais motivador do app: dê a ele espaço.
Rodapé: linha clicável `VER PROJEÇÃO DE 6 MESES →` com a seta em `carimbo`.

### `07-projecao.png` — Projeção

Uma linha por mês: rótulo + `SOBRAM 1.335` à direita, e uma barra de 22px com
borda 1.5px sobre `papel-claro`, preenchida em hachura na proporção do
comprometido, com o valor impresso dentro à esquerda
(`mix-blend-mode: multiply`). Nos meses em que um parcelamento termina, o
rótulo vai a peso 600 e aparece um selo `carimbo`: `↓ CELULAR ACABA`. Esse é o
momento de alívio — é o único ponto vermelho da tela.

### `08-ajustes.png` — Configurações

Renda do mês em campo grande (Big Shoulders 40px) com botão `SALVAR` em bloco
`tinta`. Status de conexão com `/api/health` + ação `TESTAR` em `carimbo`.
`EXPORTAR CSV` e `REFAZER CONFIGURAÇÃO INICIAL`, ambos em caixa `2px`.

### `09-onboarding.png` — Onboarding

Tela cheia **invertida** (`tinta` de fundo). Passo N de 3, título em Big
Shoulders 56px, explicação em mono, e um único campo grande com underline
`2px` — sem caixa. Passos: **renda (obrigatória)**, contas fixas (pulável),
parcelamentos (puláveis). Botões: `PULAR` (borda translúcida) e ação primária
em `carimbo`. Aparece sempre que `renda_definida === false`.

---

## 5. Barra de entrada + navegação (persistentes)

Fixas na base, acima da safe area, presentes em todas as telas.

- Input de texto, `font-size: 16px` (obrigatório, previne zoom no iOS), borda
  `2px`, fundo `papel-claro`, **placeholder rotativo** trocando a cada 3.2s
  entre exemplos reais: `gastei 32 no uber…`, `almoço 24 reais`,
  `comprei um fone em 6x de 90`, `todo mês pago 99 de internet`,
  `mercado 187,40`.
- Botão de microfone 46×46 (Web Speech API, `lang: pt-BR`, `interimResults`);
  enquanto ouve, inverte para fundo `carimbo`. Sem suporte → mensagem leve, não
  alerta.
- Botão de envio 46×46, fundo `tinta`, glifo `↵`.
- Navegação: 5 alvos de 44px mínimo — `HOJE · RESUMO · HISTÓRICO · TRAVADO ·
  AJUSTES`. O ativo ganha um traço `carimbo` de 16×3px acima do rótulo; os
  inativos ficam em `rgba(22,19,13,.42)`. Sem ícones.

Erro 422: faixa discreta acima da barra de entrada, borda 1.5px, mono 11.5px,
glifo `≠` e um `✕` para dispensar. Sem cor de alarme, sem ícone de aviso.

---

## 6. Requisitos de iOS

- `env(safe-area-inset-*)` respeitado em todos os lados; barra inferior com
  `padding-bottom` da home bar.
- Alvos de toque ≥ 44×44pt em absolutamente tudo que é clicável.
- `-webkit-overflow-scrolling: touch` + `overscroll-behavior: contain`;
  scrollbar oculta.
- Meta tags PWA: `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style=black-translucent`,
  `viewport-fit=cover`, ícones em todos os tamanhos, splash screens, manifest.
- Teclado: o input sobe junto (use `visualViewport`), o layout não quebra.
- `font-size: 16px` em todos os campos.
- Vibration API nos dois momentos de confirmação.
- Funciona em standalone fora do Safari sem perder navegação.

---

## 7. Entregáveis

- Componentes pequenos, um por bloco visual, comentados em português.
- Estados de **carregando, erro e vazio** tratados em cada tela, no vocabulário
  visual acima (nunca skeleton cinza genérico, nunca spinner).
- Sem autenticação de usuário — o token da API basta.
