# Publicar o Folha na Vercel

O frontend é estático: a Vercel só serve os arquivos gerados por `npm run build`.
Quem faz o trabalho pesado (LLM, banco) é a `gastos-api`, que continua na sua VM.

Por isso o deploy tem **duas metades**, e a segunda é a que costuma travar:

1. Subir o app na Vercel.
2. Deixar a API alcançável a partir do navegador — HTTPS público + CORS.

Dá para fazer a parte 1 sozinha e ficar em modo demonstração enquanto a parte 2
não estiver pronta.

---

## Parte 1 — subir o app

### 1. Colocar o código no GitHub

Este projeto ainda não é um repositório git. Da pasta `gastos-app`:

```bash
cd ~/gastos-app
git init
git add .
git commit -m "feat: frontend do app de gastos"
git branch -M main
git remote add origin git@github.com:MauricioSts/gastos-app.git
git push -u origin main
```

Crie o repositório vazio em <https://github.com/new> antes do `push`. Se
preferir reaproveitar o repo `gastos` que já tem os arquivos de design, o
caminho é o mesmo trocando o remote — só lembre que a Vercel vai precisar
saber que o app está numa subpasta (campo **Root Directory**, no passo 2).

O `.gitignore` já exclui `node_modules`, `dist` e `.env.local`, então o token
da API não vai junto.

### 2. Importar na Vercel

1. Entre em <https://vercel.com/new> com a conta do GitHub.
2. **Import** no repositório.
3. A Vercel detecta Vite sozinha. Confira: framework **Vite**, build
   `npm run build`, output `dist`. O `vercel.json` do projeto já fixa isso.
4. Em **Environment Variables**, adicione — por enquanto só esta:

   | Nome | Valor |
   |---|---|
   | `VITE_USAR_MOCK` | `true` |

5. **Deploy**.

Em cerca de um minuto o app está no ar em `https://<nome>.vercel.app`, rodando
com os dados de demonstração. Abra no iPhone, **Compartilhar → Adicionar à Tela
de Início** e ele instala como app, com ícone e splash.

> Cada `git push` na `main` gera um novo deploy de produção. Push em outra
> branch gera um deploy de preview com URL própria.

---

## Parte 2 — ligar na API de verdade

### 3. Publicar a API num domínio HTTPS

Hoje a `gastos-api` só escuta em `127.0.0.1:3334` — de fora ninguém alcança.
O Caddy da VM já serve outros subdomínios seus, então é só mais um bloco.

**a)** Aponte um registro DNS `A` de `gastos.mauriciosts.com` para o IP da VM,
no mesmo lugar onde você configurou `questoesapi` e `tela`.

**b)** Acrescente ao `/etc/caddy/Caddyfile` o bloco que já está pronto em
`~/gastos-api/deploy/Caddyfile.snippet`, trocando o domínio:

```caddy
gastos.mauriciosts.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3334 {
		header_up X-Real-IP {remote_host}
	}
	log {
		output file /var/log/caddy/gastos-api.log {
			roll_size 10MiB
			roll_keep 5
		}
	}
}
```

**c)** Valide e recarregue:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -s https://gastos.mauriciosts.com/api/health
```

O Caddy emite o certificado Let's Encrypt sozinho no primeiro acesso.

> **HTTPS não é opcional aqui.** A Vercel serve o app em HTTPS, e o navegador
> se recusa a chamar `http://` a partir de uma página `https://` — o app
> quebraria sem mensagem de erro visível.

### 4. Autorizar a origem da Vercel (CORS)

O navegador só deixa o app chamar outro domínio se esse domínio autorizar. Em
`~/gastos-api/.env`, liste as URLs da Vercel:

```bash
CORS_ORIGENS=https://SEU-APP.vercel.app,http://localhost:5173
```

Depois:

```bash
sudo systemctl restart gastos-api
```

Se você também usa os deploys de preview, acrescente a URL de preview à lista —
a Vercel gera uma URL diferente por branch e cada uma é uma origem distinta.

Para conferir que ficou de pé:

```bash
curl -s -D- -o /dev/null -X OPTIONS \
  -H 'Origin: https://SEU-APP.vercel.app' \
  -H 'Access-Control-Request-Method: GET' \
  https://gastos.mauriciosts.com/api/saldo
```

Tem que voltar `204` com um `Access-Control-Allow-Origin` igual à sua origem.

### 5. Apontar o app para a API

De volta à Vercel, em **Settings → Environment Variables**, ajuste para:

| Nome | Valor |
|---|---|
| `VITE_USAR_MOCK` | `false` |
| `VITE_API_URL` | `https://gastos.mauriciosts.com` |
| `VITE_API_TOKEN` | o mesmo `API_TOKEN` do `.env` da `gastos-api` |

**Variável de ambiente do Vite só entra no bundle durante o build.** Mudar o
valor não muda o site sozinho: vá em **Deployments**, nos três pontinhos do
deploy mais recente, **Redeploy**.

Abra o app, vá em **Ajustes → Conexão → TESTAR**. Tem que aparecer
`online · qwen2.5:7b · <n>ms`. Se aparecer `offline`, o problema está no
passo 3 ou 4 — o console do navegador diz qual.

---

## O que esperar quando estiver ligado

- A primeira mensagem leva **~15 a 18 segundos**: é a extração pelo LLM local
  rodando em CPU ARM. A barra tracejada correndo na base é esse tempo. Não é
  travamento.
- Se a VM reiniciar e o modelo sair da RAM, a primeira mensagem seguinte pode
  levar 40s ou mais. O `OLLAMA_KEEP_ALIVE=-1` existe justamente para isso não
  acontecer.
- Contas fixas e parcelamentos **nunca** são gravados direto: o app mostra o
  card vermelho de confirmação e você revisa antes.

## Dois pontos honestos sobre segurança

1. **O token fica visível no app.** Qualquer variável `VITE_*` é embutida no
   JavaScript entregue ao navegador. Ele evita que um robô que varra a internet
   grave gastos no seu banco; não impede alguém que abra o DevTools do seu
   celular. Para o uso pretendido — um app pessoal, um usuário — é o que o
   projeto pede. Se um dia virar multiusuário, isso precisa virar login de
   verdade.
2. **A API fica exposta na internet** a partir do passo 3. O rate limit por IP
   (60 req/min) e o token são a defesa. Vale acompanhar
   `/var/log/caddy/gastos-api.log` nas primeiras semanas.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| App abre com os dados da demonstração | `VITE_USAR_MOCK` ainda é `true`, ou faltou o redeploy |
| Tela carrega e nada aparece; console acusa CORS | Origem da Vercel fora de `CORS_ORIGENS`, ou faltou reiniciar a `gastos-api` |
| `Mixed Content` no console | `VITE_API_URL` está em `http://`; tem que ser `https://` |
| `Ajustes → TESTAR` diz `offline` | Caddy não está roteando, ou a `gastos-api` caiu (`systemctl status gastos-api`) |
| 401 em tudo | `VITE_API_TOKEN` diferente do `API_TOKEN` do backend |
| Mudou a env var e nada mudou | Falta **Redeploy**: Vite embute a variável no build |
