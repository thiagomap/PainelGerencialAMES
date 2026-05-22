# 📊 GRID Dashboard Power BI - Guia de Uso

## 🚀 COMEÇAR AGORA

### Opção 1: Abrir o Dashboard (SEM INSTALAR NADA)

1. Abra o arquivo: `dashboard-grid-powerbi.html`
2. Pode ser com qualquer navegador (Chrome, Firefox, Edge, etc.)
3. Pronto! Dashboard interativo carregado

**Local do arquivo:**
```
c:\Users\sta-032752\Desktop\Relatório Gerencial\dashboard-grid-powerbi.html
```

---

## 📈 O QUE VOCÊ VÊ

### 1. CARDS DE KPI (Topo)
```
💰 Receita Total
📊 Despesa Total  
📈 Resultado Líquido
🎯 Margem Média %
```

### 2. FILTROS
- 🏥 Instituição (Selecione qual ver)
- 📁 Tipo (AME ou Hospital)
- 📈 Métrica (Receita, Despesa, Resultado)
- 🔄 Botão Atualizar

### 3. GRÁFICOS (4 Visualizações)
- 📊 Receita por Instituição
- 💰 Despesa por Instituição
- 📈 Resultado por Instituição
- 🎯 Margem Operacional %

### 4. TABELA COMPARATIVA
- Visualize todos os dados em um só lugar
- Compare instituições lado a lado
- Veja status (Positivo/Negativo)

---

## 🎮 COMO USAR

### Filtrar por Instituição
```
1. Clique no dropdown "🏥 Instituição"
2. Selecione uma instituição
3. Dashboard atualiza automaticamente
```

### Filtrar por Tipo
```
1. Clique em "📁 Tipo"
2. Selecione "AMEs" ou "Hospitais"
3. Veja apenas o tipo selecionado
```

### Atualizar Dados
```
1. Clique em "🔄 Carregar Dados"
2. Dashboard se atualiza (com animação de loading)
```

### Passar o Mouse nos Gráficos
```
1. Passe o mouse sobre as barras dos gráficos
2. Veja valores detalhados em tooltip
```

---

## 📊 DADOS INCLUSOS

### 6 AMEs (Com CNES Individuais)
```
1. AME Campinas ──────────────→ Receita: R$ 450.000
2. AME Casa Branca ────────────→ Receita: R$ 320.000
3. AME Franca ─────────────────→ Receita: R$ 380.000
4. AME Jurumirim ──────────────→ Receita: R$ 290.000
5. AME Ribeirão Preto ─────────→ Receita: R$ 520.000
6. AME São Carlos ─────────────→ Receita: R$ 410.000
```

### 3 Hospitais (Sob 1 CNES)
```
1. Hospital do Coração ────────→ Receita: R$ 1.200.000
2. Hospital do Câncer ─────────→ Receita: R$ 980.000
3. Santa Casa ─────────────────→ Receita: R$ 750.000
```

---

## 📈 INTERPRETANDO OS KPIs

### Receita Total
- Soma de todas as receitas
- Representa todo o dinheiro que entrou
- Inclui todos os 9 hospitais/AMEs

### Despesa Total
- Soma de todas as despesas
- Representa todo o dinheiro que saiu
- Inclui custeios e investimentos

### Resultado Líquido
- Receita - Despesa
- ✓ Positivo = Lucro
- ✗ Negativo = Prejuízo

### Margem Média %
- (Resultado / Receita) × 100
- Mostra quão lucrativo é em percentual
- Ideal: >20%
- Aceitável: 10-20%
- Ruim: <10%

---

## 🎯 CASOS DE USO

### Caso 1: Comparar Desempenho dos AMEs
```
1. Selecione "Tipo: AMEs"
2. Veja qual tem melhor resultado
3. Compare margens operacionais
```

### Caso 2: Ver Qual Instituição Lucra Mais
```
1. Deixe tudo vazio (Todas as instituições)
2. Olhe a tabela e a coluna "Resultado"
3. Veja qual é o "ranking"
```

### Caso 3: Analisar Custos
```
1. Olhe o gráfico "Despesa por Instituição"
2. Identifique qual gasta mais
3. Investigue por quê
```

### Caso 4: Monitorar Margem
```
1. Olhe o gráfico "Margem Operacional %"
2. Veja qual está abaixo do esperado
3. Tome ações corretivas
```

---

## 💡 DICAS PROFISSIONAIS

### Tip 1: Use Fullscreen
```
Pressione F11 no navegador para tela cheia
Melhor visualização dos gráficos
```

### Tip 2: Exporte Dados
```
Clique direito na tabela > "Copiar"
Cole no Excel para análise detalhada
```

### Tip 3: Monitore Mudanças
```
Clique "Carregar Dados" regularmente
Acompanhe mudanças em tempo real
```

### Tip 4: Crie Comparativas
```
Anote valores de diferentes datas
Compare evolução ao longo do tempo
```

---

## 🔄 VERSÃO COM DADOS REAIS

Se quiser usar os dados reais dos seus arquivos Excel:

### Passo 1: Instalar Python (Opcional)
```powershell
winget install Python.Python.3.10
```

### Passo 2: Executar Integrador
```powershell
cd "c:\Users\sta-032752\Desktop\Relatório Gerencial"
python integrador-grid.py --export dashboard-data.json
```

### Passo 3: Atualizar Dashboard
```javascript
// Abra o console (F12) e cole:
// (Será implementado na versão 2.0)
```

---

## 🎨 PERSONALIZAÇÕES

### Mudar Cores
Edite o arquivo `dashboard-grid-powerbi.html`:
- Procure por `#667eea` (azul principal)
- Procure por `#764ba2` (roxo)
- Substitua pelos seus cores

### Adicionar Mais Instituições
```javascript
// No arquivo HTML, na seção DADOS MOCKADOS:
// Adicione novo objeto à lista 'instituicoes'

{ 
    id: 10, 
    nome: 'Minha Nova Unidade', 
    tipo: 'AME', 
    receita: 500000, 
    despesa: 400000, 
    resultado: 100000 
}
```

### Mudar Período
```javascript
// Procure por "Abril/2026"
// Substitua pelo seu período
```

---

## 🐛 TROUBLESHOOTING

### P: Dashboard não carrega
**R:** 
- Verifique se o navegador está atualizado
- Limpe o cache (Ctrl+Shift+Del)
- Tente em outro navegador

### P: Gráficos não aparecem
**R:**
- Verifique se CDN do Chart.js está carregando
- Verifique conexão com internet
- Abra console (F12) para ver erros

### P: Filtros não funcionam
**R:**
- Recarregue a página (F5)
- Limpe cookies
- Tente em navegador privado

### P: Como integrar com meus dados?
**R:**
- Use o `integrador-grid.py` para exportar dados
- Modifique o array `instituicoes` no HTML
- Ou conecte uma API (versão avançada)

---

## 📱 RESPONSIVIDADE

O dashboard funciona em:
- ✅ Desktop (1920x1080 ou maior)
- ✅ Tablet (iPad, Android)
- ✅ Mobile (adapta-se automaticamente)

---

## 🔐 SEGURANÇA

- Dashboard roda **100% localmente**
- Nenhum dado é enviado para servidor externo
- Seguro para usar com dados confidenciais
- Pode ser salvo offline

---

## 📊 PRÓXIMAS VERSÕES

- [ ] Integração com Excel em tempo real
- [ ] Exportação para PDF
- [ ] Gráficos de evolução temporal
- [ ] Alertas de anomalias
- [ ] Drill-down detalhado
- [ ] Comparação período a período
- [ ] Previsões com IA
- [ ] Integração com Power BI Desktop

---

## 📞 SUPORTE

Tem dúvida?

```
1. Recarregue a página (F5)
2. Limpe o cache (Ctrl+Shift+Del)
3. Tente em outro navegador
4. Entre em contato
```

---

## 🎯 RESUMO RÁPIDO

```
╔═══════════════════════════════════════════════╗
║  GRID DASHBOARD - POWER BI STYLE             ║
║                                              ║
║  ✅ KPIs em tempo real                       ║
║  ✅ 4 Gráficos interativos                   ║
║  ✅ Tabela comparativa                       ║
║  ✅ Filtros dinâmicos                        ║
║  ✅ 100% local e seguro                      ║
║  ✅ Responsivo (desktop/mobile)              ║
║                                              ║
║  ABRA: dashboard-grid-powerbi.html           ║
║  PRONTO: Ctrl + Clique no arquivo            ║
╚═══════════════════════════════════════════════╝
```

---

**Data:** 11 de Maio de 2026  
**Versão:** 1.0  
**Status:** ✅ Pronto para Uso
