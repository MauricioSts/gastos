#!/usr/bin/env bash
# Teste de fumaca das rotas principais da Gastos API.
# Uso: ./test.sh            (usa .env local e http://localhost:3334)
#      BASE=https://gastos.seu-dominio.com ./test.sh
#
# ATENCAO: este teste grava no banco que a instancia alvo estiver usando e nao
# remove os gastos que cria (so rendas, contas fixas e parcelamentos), alem de
# deixar um orcamento cadastrado. Nao rode contra o banco de producao. Suba uma
# instancia isolada:
#   PORT=3400 DB_PATH=data/teste.db node src/server.js &
#   BASE=http://localhost:3400 ./test.sh
set -uo pipefail

RAIZ="$(cd "$(dirname "$0")" && pwd)"
BASE="${BASE:-http://localhost:3334}"

# Le o token do .env se nao veio pelo ambiente.
if [ -z "${API_TOKEN:-}" ] && [ -f "$RAIZ/.env" ]; then
	API_TOKEN="$(grep -E '^API_TOKEN=' "$RAIZ/.env" | head -1 | cut -d= -f2-)"
fi
if [ -z "${API_TOKEN:-}" ]; then
	echo "API_TOKEN nao definido (nem no ambiente, nem no .env)"; exit 1
fi

MES="$(date +%Y-%m)"
OK=0
FALHA=0

# chamar <descricao> <status_esperado> <metodo> <rota> [json]
chamar() {
	local desc="$1" esperado="$2" metodo="$3" rota="$4" corpo="${5:-}"
	local args=(-s -w '\n%{http_code}' -X "$metodo" -H "X-API-Token: $API_TOKEN")
	[ -n "$corpo" ] && args+=(-H 'Content-Type: application/json' -d "$corpo")

	local saida status json
	saida="$(curl "${args[@]}" --max-time 120 "$BASE$rota")"
	status="$(printf '%s' "$saida" | tail -n1)"
	json="$(printf '%s' "$saida" | sed '$d')"

	if [ "$status" = "$esperado" ]; then
		OK=$((OK + 1)); printf '  ok   [%s] %s\n' "$status" "$desc"
	else
		FALHA=$((FALHA + 1)); printf '  FALHA [esperado %s, veio %s] %s\n' "$esperado" "$status" "$desc"
	fi
	printf '       %s\n' "$(printf '%s' "$json" | head -c 220)"
}

echo "Base: $BASE | mes: $MES"
echo
echo "== health e autenticacao =="
chamar "health (publico)" 200 GET /api/health
printf '  ...  sem token deve dar 401: '
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/saldo"

MES_PROX="$(date -d "$(date +%Y-%m-01) +1 month" +%Y-%m)"

echo
echo "== renda, orcamento e saldo =="
chamar "cadastra renda do mes" 201 POST /api/rendas "{\"mes_referencia\":\"$MES\",\"descricao\":\"salario teste\",\"valor\":1700}"
chamar "lista renda do mes" 200 GET "/api/rendas?mes=$MES"
chamar "renda sem valor (400)" 400 POST /api/rendas "{\"mes_referencia\":\"$MES\",\"descricao\":\"x\"}"
chamar "define orcamento do mes" 200 POST /api/orcamento "{\"mes_referencia\":\"$MES\",\"valor_total\":800}"
chamar "saldo do mes corrente" 200 GET /api/saldo
chamar "limite de categoria" 200 POST /api/limite-categoria "{\"categoria\":\"alimentacao\",\"mes_referencia\":\"$MES\",\"valor_limite\":400}"

echo
echo "== contas fixas e parcelamentos =="
chamar "cria conta fixa" 201 POST /api/contas-fixas '{"descricao":"internet teste","valor":99,"dia_vencimento":10,"categoria":"contas"}'
chamar "dia_vencimento invalido (400)" 400 POST /api/contas-fixas '{"descricao":"x","valor":10,"dia_vencimento":40,"categoria":"contas"}'
chamar "lista contas fixas" 200 GET /api/contas-fixas
chamar "parcelamento em andamento (9 de 12)" 201 POST /api/parcelamentos "{\"descricao\":\"celular teste\",\"valor_parcela\":200,\"total_parcelas\":12,\"parcela_inicial\":9,\"mes_inicio\":\"$MES\",\"categoria\":\"compras\"}"
chamar "parcelamento pelo valor total" 201 POST /api/parcelamentos "{\"descricao\":\"tv teste\",\"valor_total\":2160,\"total_parcelas\":12,\"mes_inicio\":\"$MES\",\"categoria\":\"compras\"}"
chamar "parcela_inicial > total (400)" 400 POST /api/parcelamentos "{\"descricao\":\"x\",\"valor_parcela\":10,\"total_parcelas\":3,\"parcela_inicial\":9,\"mes_inicio\":\"$MES\",\"categoria\":\"compras\"}"
chamar "parcelamento sem valor (400)" 400 POST /api/parcelamentos "{\"descricao\":\"x\",\"total_parcelas\":3,\"mes_inicio\":\"$MES\",\"categoria\":\"compras\"}"
chamar "compromissos do mes" 200 GET "/api/compromissos?mes=$MES"
chamar "compromissos do mes seguinte" 200 GET "/api/compromissos?mes=$MES_PROX"
chamar "projecao 6 meses" 200 GET "/api/projecao?meses=6"
chamar "saldo ja com o comprometido" 200 GET /api/saldo

echo
echo "== extracao via LLM local (pode levar ~15s por mensagem) =="
chamar "gasto simples" 201 POST /api/gastos '{"mensagem":"gastei 10 reais no almoco"}'
chamar "giria + ontem" 201 POST /api/gastos '{"mensagem":"torrei 45 pila no mercado ontem"}'
chamar "valor com virgula" 201 POST /api/gastos '{"mensagem":"uber pro trabalho, 18,50"}'
chamar "entrada de dinheiro vira renda" 201 POST /api/gastos '{"mensagem":"recebi um pix de 10 reais"}'
chamar "sem verbo e gasto, nao entrada" 201 POST /api/gastos '{"mensagem":"almoco 24 reais"}'
chamar "conta fixa vira sugestao, nao grava" 200 POST /api/gastos '{"mensagem":"meu aluguel e 800 e vence dia 5"}'
chamar "parcelamento vira sugestao, nao grava" 200 POST /api/gastos '{"mensagem":"comprei uma tv de 2160 em 12x"}'
chamar "nao e gasto (422)" 422 POST /api/gastos '{"mensagem":"bom dia, tudo bem?"}'
chamar "mensagem vazia (400)" 400 POST /api/gastos '{"mensagem":"   "}'

echo
echo "== consulta, correcao e remocao =="
chamar "lista do mes" 200 GET "/api/gastos?mes=$MES&limite=5"
chamar "filtro por categoria" 200 GET "/api/gastos?categoria=transporte&limite=5"
chamar "mes invalido (400)" 400 GET "/api/gastos?mes=agosto"
chamar "resumo do mes" 200 GET /api/resumo

# Pega o id do gasto mais recente para exercitar PATCH e DELETE.
ID="$(curl -s -H "X-API-Token: $API_TOKEN" "$BASE/api/gastos?limite=1" \
	| grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)"
if [ -n "$ID" ]; then
	chamar "corrige gasto $ID" 200 PATCH "/api/gastos/$ID" '{"categoria":"lazer","valor":"12,34"}'
	chamar "categoria invalida (400)" 400 PATCH "/api/gastos/$ID" '{"categoria":"cerveja"}'
	chamar "remove gasto $ID" 200 DELETE "/api/gastos/$ID"
	chamar "gasto inexistente (404)" 404 DELETE "/api/gastos/$ID"
fi

echo
echo "== limpeza do que este teste criou =="
limpar() {
	local rota="$1" campo="$2"
	local ids
	ids="$(curl -s -H "X-API-Token: $API_TOKEN" "$BASE$rota" \
		| python3 -c "import json,sys;print(' '.join(str(x['id']) for x in json.load(sys.stdin)['$campo'] if 'teste' in x['descricao']))" 2>/dev/null)"
	for id in $ids; do
		curl -s -o /dev/null -X DELETE -H "X-API-Token: $API_TOKEN" "$BASE$rota/$id"
		echo "  removido $rota/$id"
	done
}
# a entrada lancada pelo chat vira uma linha de renda; remove todas do mes
for id in $(curl -s -H "X-API-Token: $API_TOKEN" "$BASE/api/rendas?mes=$MES" \
	| python3 -c "import json,sys;print(' '.join(str(x['id']) for x in json.load(sys.stdin)['rendas']))" 2>/dev/null); do
	curl -s -o /dev/null -X DELETE -H "X-API-Token: $API_TOKEN" "$BASE/api/rendas/$id"
	echo "  removido /api/rendas/$id"
done
limpar /api/contas-fixas contas_fixas
limpar /api/parcelamentos parcelamentos

echo
echo "Resultado: $OK ok, $FALHA falha(s)."
[ "$FALHA" -eq 0 ]
