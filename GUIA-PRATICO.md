# 🏥 Como Usar o MCP GRID Hospital com Claude

## ✨ O QUE FOI CRIADO PARA VOCÊ:

### Arquivos Gerados:
1. **mcp-server-grid.py** - Servidor MCP (requer Python)
2. **validar-mcp.py** - Script de validação
3. **config-grid-estrutura.json** - Configuração da estrutura
4. **README-MCP-GRID.md** - Documentação completa
5. **mcp-servers.json** - Configuração VS Code
6. **GUIA-PRATICO.md** ← Você está aqui

---

## 🎯 OPÇÃO 1: USO IMEDIATO (SEM INSTALAR NADA)

Você pode usar **AGORA** comigo (Claude) para:

### ✅ Exemplo 1: Listar todas as instituições

**Você escreve:**
```
Me mostre a estrutura de todas as instituições que gerencio
```

**Eu respondo com:**
- 1 CNES administrativo gerenciando 3 hospitais
- 6 AMEs com CNES individuais
- 1 Santa Casa com CNES separado

---

### ✅ Exemplo 2: Ler dados de um arquivo específico

**Você escreve:**
```
Leia os dados de fluxo de caixa do AME Campinas
```

**Eu leio:** `Fluxo de Caixa\AME Campinas 04 2026.xlsx`

---

### ✅ Exemplo 3: Consolidar dados

**Você escreve:**
```
Consolide o fluxo de caixa de todos os 6 AMEs
```

**Eu processo todos:**
- AME Campinas
- AME Casa Branca
- AME Franca
- AME Jurumirim
- AME Ribeirão Preto
- AME São Carlos

---

### ✅ Exemplo 4: Gerar relatório gerencial

**Você escreve:**
```
Gere um relatório gerencial consolidado dos 3 hospitais + 6 AMEs
```

**Eu crio um relatório com:**
- Estrutura organizacional
- Resumo de dados por instituição
- Comparativas por CNES
- Totalizações

---

## 🔧 OPÇÃO 2: CONFIGURAR LOCALMENTE (COM PYTHON)

### Passo 1: Instalar Python
```bash
# Windows - baixe em: https://www.python.org/downloads/
# Ou use: winget install python
python --version  # Confirmar instalação
```

### Passo 2: Instalar dependências
```bash
cd "c:\Users\sta-032752\Desktop\Relatório Gerencial"
pip install mcp pandas openpyxl
```

### Passo 3: Rodar validação
```bash
python validar-mcp.py
```

### Passo 4: Ativar MCP no VS Code
```
Ctrl+Shift+P > "Connect MCP Server"
```

---

## 📊 ESTRUTURA DE DADOS

```
┌─────────────────────────────────────────────────────┐
│  ADMINISTRADOR GERAL (1 CNES: ADMIN001)             │
│  Gerencia:                                           │
│  ├─ Hospital do Coração                             │
│  ├─ Hospital do Câncer                              │
│  └─ Santa Casa                                      │
└─────────────────────────────────────────────────────┘
         ↓ (visão consolidada)

┌─────────────────────────────────────────────────────┐
│  6 AMEs (CNES INDIVIDUAIS)                          │
├─ cnes_campinas ──────→ AME Campinas 04 2026.xlsx    │
├─ cnes_casa_branca ───→ AME Casa Branca 04 2026.xlsx │
├─ cnes_franca ────────→ AME Franca 04 2026.xlsx      │
├─ cnes_jurumirim ─────→ AME Jurumirim 04 2026.xlsx   │
├─ cnes_ribeirao_preto → AME Ribeirão Preto 04.xlsx   │
└─ cnes_sao_carlos ────→ AME São Carlos 04 2026.xlsx  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  SANTA CASA (CNES SEPARADO)                         │
├─ cnes_santa_casa ────→ Santa Casa 04 2026.xlsx      │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 COMEÇAR AGORA!

### Pedir dados específicos:
```
Claude, para o AME Campinas em abril 2026:
- Qual foi a receita total?
- Quais foram as despesas?
- Qual é o saldo final?
```

### Comparar unidades:
```
Claude, entre os 6 AMEs:
- Qual teve melhor resultado?
- Qual teve piores índices?
- Qual é a média de receita?
```

### Relatórios:
```
Claude, gere um relatório que mostre:
1. Status de cada hospital e AME
2. Comparativa de desempenho
3. Principais indicadores
4. Recomendações
```

---

## 🔄 FLUXO DE DADOS

```
Você                   Claude              Arquivos Excel
  │                      │                      │
  ├─→ Solicitação ──────→ │                      │
  │                      │                      │
  │                      ├─→ Ler arquivo ──────→ │
  │                      │                      │
  │                      │ ←─ Dados ────────────┤
  │                      │                      │
  │                      ├─→ Processar/Consolidar
  │                      │                      │
  │ ←─ Resposta ─────────┤                      │
  │                      │                      │
```

---

## 💡 DICAS

✅ **Para leitura rápida:**
```
"Leia o AME Campinas e mostre os 3 principais indicadores"
```

✅ **Para consolidação:**
```
"Compare todos os AMEs por: receita, despesas e margem"
```

✅ **Para alertas:**
```
"Identifique qual unidade está com desempenho abaixo da média"
```

✅ **Para planejamento:**
```
"Com base nos dados de abril, projete o resultado de maio"
```

---

## ❓ PERGUNTAS FREQUENTES

**P: Preciso instalar Python?**
A: Não! Você pode usar comigo (Claude) imediatamente. Python é opcional para rodar localmente.

**P: Posso ver os dados em tempo real?**
A: Sim! Basta me pedir para ler o arquivo específico quando quiser.

**P: Como integrar com GRID?**
A: Vou exportar os dados em JSON pronto para API do GRID. Basta me pedir:
```
"Exporte todos os dados em formato JSON para GRID"
```

**P: Posso adicionar novas unidades?**
A: Sim! Basta criar um arquivo Excel em `Fluxo de Caixa/` com o nome da unidade e me informar o CNES.

---

## 📞 SUPORTE

Qualquer dúvida, é só me chamar!

Exemplos de comandos:
```
- "Me liste todas as instituições"
- "Leia o fluxo de caixa do AME [Nome]"
- "Consolide todos os AMEs"
- "Gere um relatório gerencial"
- "Compare o desempenho de cada unidade"
- "Identifique anomalias nos dados"
- "Projete resultados para o próximo mês"
```

---

**Configurado em:** 11/05/2026
**Status:** ✅ Pronto para uso
**Versão:** 1.0
