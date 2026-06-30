# Relatório Gerencial — Instruções para Claude

## Acesso ao Portal
- **URL principal:** http://172.16.182.3:3000/
- Servidor rodando via PM2, processo `relatorio-gerencial` (id=0), porta 3000
- IP da máquina na rede: 172.16.182.3

## Comandos PM2
```bash
npx pm2 restart relatorio-gerencial   # reiniciar após alterações
npx pm2 logs relatorio-gerencial --lines 40 --nostream  # ver logs
npx pm2 status  # ver status de todos os processos
```

## Arquivos principais
- `servidor.js` — backend Node.js (API + proxy SIRESP)
- `portal-unificado.html` — frontend completo (SPA)
- `CONFIGURACAO.env` — credenciais e configurações
- `siresp-amb-dados.json` — cache dos dados SIRESP AMB (sobrescrito a cada busca)
- `dados-dashboard.json` — dados do dashboard principal

## Credenciais SIRESP
- SIRESP Ambulatorial primário: `antalves` / hash no .env — acesso a Franca, Campinas, Casa Branca, Jurumirim
- SIRESP Ambulatorial secundário: SIRESP_AMB_USER2 / SIRESP_AMB_SENHA2 (vazio = não configurado ainda; para RP e SC)
- `ddgsilva`/`260718` = credenciais Gestão SES APENAS (gestao.saude.sp.gov.br) — NÃO tem acesso ambulatorial
- SIRESP_AMB_CODE=9042 / SIRESP_AMB_LABEL=AME FRANCA (padrão)
- SIRESP_AMB_EXTRA_UNITS=10825|AME CAMPINAS,2211|AME CASA BRANCA,11153|AME VALE DO JURUMIRIM,11300|AME RIBEIRAO PRETO,10355|AME SAO CARLOS

## Arquitetura relevante
- PM2 tem `watch: enabled` — reinicia automaticamente quando arquivos mudam
- Sessions SIRESP: `_sirespAmb` (objeto global), unitList cacheado após login, `currentUser` rastreado
- Dual-user fallback: quando tipo_doc="" (unidade inacessível), tenta SIRESP_AMB_USER2 automaticamente
- Consultas split: médica (FLT_TIPO_CONSULTA=CM) + não médica (CN), CBO 22214
