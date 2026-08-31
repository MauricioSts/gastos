# Folha — frontend do app de gastos

App de controle de gastos por linguagem natural. React 18 + Vite + Tailwind,
PWA instalável no iOS. Consome a [gastos-api](../gastos-api) — backend Node +
SQLite com extração por LLM local (Ollama).

O conceito que organiza a interface inteira:

```
disponível de fato = renda − comprometido − gasto livre
ritmo diário       = disponível de fato ÷ dias restantes
```

Os dois sentidos do dinheiro passam pelo mesmo campo de texto. `gastei 32 no
uber` reduz o disponível; `recebi um pix de 10` aumenta, virando uma linha de
renda do mês. Contas fixas e parcelamentos, que pesam em vários meses, nunca
são gravados direto: vão para um card de confirmação com os campos editáveis.

O número em destaque na Home é **sempre** o disponível de fato, nunca a renda
bruta, e a decomposição `Renda 1.700 − Comprometido 365 − Gasto 412` fica
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
│   ├── CardSugestao.jsx      card de compromisso recorrente (carimbo)
│   ├── FaixaErro.jsx         aviso discreto acima da barra
│   ├── LinhaLancamento.jsx   linha com swipe revelando editar/excluir
│   └── telas/                Home, Resumo, Historico, Compromissos,
│                             Projecao, Ajustes, Onboarding
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

## Direção visual

Livro-caixa impresso: papel bone, tinta preta, carimbo vermelho.

| Token | Hex | Uso |
|---|---|---|
| `papel` | `#E8E2D4` | fundo de todas as telas |
| `papel-claro` | `#F4EFE2` | inputs e barras vazias |
| `tinta` | `#16130D` | texto, bordas, gasto livre, telas invertidas |
| `tinta-clara` | `#F6F1E4` | texto sobre tinta e sobre carimbo |
| `carimbo` | `#D2360A` | acento único, poucas vezes por tela |

Três famílias, cada uma com um papel fixo: **Big Shoulders Display** só para
valores em reais, **IBM Plex Mono** para todo o aparato contábil (labels,
botões, navegação), **IBM Plex Sans** só para descrição de lançamento.

Regras que valem em todo lugar:

- **Raio de borda zero.** Em nada, nunca.
- Sombra só nos cards flutuantes, e é dura e deslocada (`6px 6px 0`), sem blur.
- **Hachura diagonal** = comprometido. **Sólido tinta** = gasto livre.
  **Vazio** = disponível. Esse par se repete na régua da Home, nas barras do
  Resumo e nas colunas da Projeção — é a linguagem visual do app.
- Os centavos do saldo herói saem em `carimbo`; isso não se repete em lugar
  nenhum, é a assinatura da tela.
- Ruído de papel (`feTurbulence`) sobre tudo, abaixo dos modais.

O onboarding cadastra compromissos de verdade — descrição, valor, vencimento,
categoria e, no parcelamento, **em que parcela você já está**. Esse último campo
é a razão do formulário existir: sem ele, uma compra na 9ª de 12 parcelas entra
como se estivesse na 1ª e o comprometido dos próximos meses nasce errado. A tela
Compromissos tem o mesmo formulário para criar, editar e excluir.

Só dois momentos ganham animação: a entrada dos cards (`carimbo`) e o saldo
herói re-animando a cada mudança de valor (`subirValor`, forçado por
`key={disponivel}`). Processamento é um tracejado que corre, nunca um spinner.

## iOS

- `viewport-fit=cover` + `env(safe-area-inset-*)` em todos os lados.
- Alvos de toque ≥ 44×44pt.
- `font-size: 16px` em todos os campos (abaixo disso o Safari dá zoom ao focar).
- Teclado: `visualViewport` mede quanto da tela foi coberto e a barra de
  entrada sobe junto (`--teclado` em `useTecladoIOS`).
- Manifest, ícones de 32 a 512 (incluindo `maskable`) e splash screens para as
  cinco resoluções de iPhone mais comuns.
- Vibração nos dois momentos de confirmação: `18ms` ao registrar um gasto,
  `[12,40,12]` ao sugerir um compromisso recorrente.
- Ditado por Web Speech API (`pt-BR`). Sem suporte, avisa na faixa discreta —
  nunca `alert`.

## Deploy

Ver [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md).
