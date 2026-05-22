# 🏥 Servidor MCP GRID Hospital - Guia de Implementação

## 📋 Visão Geral da Estrutura

```
ADMINISTRADOR GERAL (1 CNES)
├─ Hospital do Coração
├─ Hospital do Câncer  
└─ Santa Casa

6 AMEs (CNES individuais cada):
├─ AME Campinas
├─ AME Casa Branca
├─ AME Franca
├─ AME Jurumirim
├─ AME Ribeirão Preto
└─ AME São Carlos

Santa Casa (CNES separado)
```

## 🚀 Instalação

### Pré-requisitos
- Python 3.10+
- pandas
- openpyxl (para ler Excel)

### Instalar dependências:

```bash
pip install mcp pandas openpyxl
```

## 📂 Arquivos Criados

1. **mcp-server-grid.py** - Servidor MCP principal
   - Tools para consultar dados
   - Resources para acesso direto
   - Consolidação de fluxo de caixa

2. **validar-mcp.py** - Script de validação
   - Verifica existência de arquivos
   - Lista colunas
   - Gera resumo

3. **mcp-servers.json** - Configuração do MCP
   - Localizado em: `C:\Users\sta-032752\AppData\Roaming\Code\User\`

## 🔧 Usando o MCP

### Via Claude (já conectado):

```
1. Me liste todas as instituições
2. Mostre o fluxo de caixa do AME Campinas
3. Consolide os dados de todos os AMEs
4. Exporte os dados em formato GRID JSON
5. Gere um relatório gerencial
```

### Via Python direto:

```python
python validar-mcp.py
```

## 📊 Tools Disponíveis

### 1. `listar_instituicoes`
Lista todas as instituições com seus CNES

**Resposta esperada:**
```
📋 ESTRUTURA DE INSTITUIÇÕES
Admin Geral: ADMIN001
  • Hospital do Coração
  • Hospital do Câncer
  • Santa Casa
6 AMEs:
  • AME Campinas (cnes_campinas)
  • AME Casa Branca (cnes_casa_branca)
  ... etc
```

### 2. `ler_fluxo_caixa`
Lê dados de uma instituição específica

**Parâmetros:**
- `cnes`: CNES da instituição (ex: `cnes_campinas`, `cnes_santa_casa`)

### 3. `consolidar_fluxo_caixa`
Consolida dados de múltiplas instituições

**Parâmetros:**
- `tipo`: `ames`, `santa_casa`, ou `todos`

### 4. `exportar_grid_json`
Exporta em formato JSON para GRID

**Parâmetros:**
- `cnes` (opcional): Deixe vazio para exportar todas

### 5. `gerar_relatorio_gerencial`
Relatório consolidado de todas as unidades

## 🔗 Resources (Acesso Direto)

- `GET /instituicoes` - Todas as instituições em JSON
- `GET /instituicoes/{cnes}` - Dados de uma instituição específica

## 📈 Casos de Uso

### Caso 1: Visualizar estrutura geral
```
claude> Me mostre a estrutura de todas as instituições que gerencio
```

### Caso 2: Consultafluxo de caixa de um AME
```
claude> Qual é o fluxo de caixa do AME Campinas no mês de abril?
```

### Caso 3: Comparar desempenho entre AMEs
```
claude> Consolide o fluxo de caixa de todos os AMEs e mostre qual teve melhor resultado
```

### Caso 4: Relatório para administração
```
claude> Gere um relatório gerencial consolidado de todos os hospitais e AMEs
```

### Caso 5: Exportar para GRID
```
claude> Exporte todos os dados no formato JSON pronto para GRID
```

## 🛠️ Configuração Avançada

Se precisar adicionar novas instituições, edite o dicionário `AMES` ou `SANTA_CASA` em `mcp-server-grid.py`:

```python
AMES = {
    "cnes_nova_unidade": {
        "nome": "Nome da Unidade", 
        "arquivo": "Nome do Arquivo 04 2026.xlsx"
    },
    ...
}
```

## 🐛 Troubleshooting

### Erro: "Arquivo não encontrado"
- Verifique se os arquivos .xlsx estão em `Fluxo de Caixa/`
- Confirme os nomes dos arquivos (case-sensitive no Linux)

### Erro: "CNES não encontrado"
- Use um dos CNES válidos listados em `listar_instituicoes()`

### Pandas não encontrado
```bash
pip install pandas openpyxl
```

## 📝 Notas Importantes

- ✅ Estrutura suporta 1 CNES administrativo gerenciando 3 hospitais
- ✅ Cada AME tem seu CNES individual
- ✅ Santa Casa tem CNES separado
- ✅ Dados consolidados por tipo (AME, Santa Casa, Todos)
- ✅ Exportação em JSON para integração com APIs

## 🎯 Próximos Passos

1. ✅ Servidor MCP configurado
2. ⏳ Integração com dashboard GRID
3. ⏳ Webhooks para atualizações automáticas
4. ⏳ Autenticação de usuários por CNES
5. ⏳ Alerts de anomalias no fluxo de caixa

---

**Desenvolvido para:** Administração Geral de Hospitais
**Data:** 11/05/2026
**Versão:** 1.0
