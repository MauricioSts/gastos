# Minimau — pacote de entrega

App de gastos por conversa. Tudo o que a IA de implementação precisa está aqui.

## O que abrir primeiro

| Arquivo | O que é |
|---|---|
| `PROMPT-IMPLEMENTACAO.md` | **Cole isto na IA.** Especificação completa: stack, paleta, tipografia, mascote, telas, API, requisitos de iOS. |
| `Minimau - App iOS.dc.html` | Protótipo funcional de referência (abre direto no navegador). Onde o texto e ele divergirem, **ele vence**. |
| `api.js` | Contrato da API + mock completo. Flag `USAR_MOCK` troca mock ↔ backend real. |

## Mascote e identidade

| Arquivo | Uso |
|---|---|
| `Minimau Mascote.dc.html` | Mascote animado (fonte editável) |
| `Minimau Logo.dc.html` | Rosto como logo (fonte editável) |
| `downloads/minimau-mascote.svg` | SVG animado por CSS — **use este no app**, não vídeo/GIF |
| `downloads/minimau-logo.svg` | Ícone quadrado, para header e PWA |
| `downloads/minimau-logo-1024.png` | Ícone de app 1024×1024 |
| `downloads/minimau-mascote-2x.png` | Preview estático do mascote |

O mascote flutua, inclina a cabeça, acena com 4 dedos e **pisca duas vezes** por
ciclo. A cor da íris é prop: verde em repouso, laranja processando, vermelho
quando o ritmo estourou.

## Telas de referência

`telas-minimau/` — 6 capturas do protótipo: hoje, painel, histórico, travado,
projeção, ajustes.

## Outras direções (arquivo morto)

`home-noir.dc.html`, `home-ledger.dc.html` e `Gastos - App iOS.dc.html` são
explorações visuais anteriores. **Não implemente a partir delas** — a direção
final é a do Minimau.
