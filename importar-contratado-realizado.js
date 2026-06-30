// Importa dados de CMA e produção dos arquivos "Contratado x Realizado" para o CONFIGURACAO.env
// Uso: node importar-contratado-realizado.js
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const PASTA = path.join(__dirname, 'Metas Trimestrais', 'Resultado 1º Trimestre - Gestão', 'Contratado x Realizado');
const ENV_FILE = path.join(__dirname, 'CONFIGURACAO.env');

const MESES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const MESES_IDX = { JAN:0, FEV:1, MAR:2, ABR:3, MAI:4, JUN:5, JUL:6, AGO:7, SET:8, OUT:9, NOV:10, DEZ:11 };

// Mapeia nome do arquivo → prefixo da AME no env
const AME_MAP = {
  'AME Campinas': 'CAMPINAS',
  'AME Casa Branca': 'CASA_BRANCA',
  'AME Franca': 'FRANCA',
  'AME Ribeirão Preto': 'RIBEIRAO',
  'AME São Carlos': 'SAO_CARLOS',
  'AME Vale do Jurumirim': 'JURUMIRIM',
};

// Lê valor realizado de uma seção do relatório
// ws = worksheet, rows = flat array, secName = "571 - Cirurgia" etc, rowLabel = "Cirurgias ambulatoriais"
function extrairSerie(flat, secKeyword, rowKeyword) {
  let secRow = -1;
  let headerRow = -1;

  // Encontra a seção
  for (let i = 0; i < flat.length; i++) {
    if (flat[i][0] && flat[i][0].includes(secKeyword)) {
      secRow = i;
      break;
    }
  }
  if (secRow < 0) return null;

  // Encontra linha de cabeçalho (Janeiro | Fevereiro | ...)
  for (let i = secRow; i < Math.min(secRow + 8, flat.length); i++) {
    if (flat[i].some(c => c === 'Janeiro' || c === 'Jan.')) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) return null;

  // Mapeia colunas: par (Cont., Real.) por mês
  // Cabeçalho: | Janeiro | | Fevereiro | | ... (col 1=Jan, col 3=Fev, etc)
  // Linha de tipo: | Cont. | Real. | Cont. | Real. | ...
  // Cada mês ocupa 2 colunas (Cont. e Real.)

  // Encontra linha com "Real." para saber qual coluna é realizado
  let realCols = []; // índices das colunas de realizado por mês
  for (let i = headerRow; i < Math.min(headerRow + 3, flat.length); i++) {
    const row = flat[i];
    if (row.includes('Real.') || row.includes('Realizado')) {
      row.forEach((v, ci) => {
        if (v === 'Real.' || v === 'Realizado') realCols.push(ci);
      });
      break;
    }
  }

  if (realCols.length === 0) {
    // Tenta inferir: meses estão na linha de header, cols pares são contratado, ímpares são realizado
    const headerLine = flat[headerRow];
    for (let ci = 1; ci < headerLine.length - 1; ci++) {
      if (headerLine[ci] && !headerLine[ci+1]) {
        // ci = Contratado, ci+1 = Realizado
        realCols.push(ci + 1); // realizado está na próxima coluna
      }
    }
  }

  // Encontra linha com o dado
  for (let i = secRow + 1; i < Math.min(secRow + 20, flat.length); i++) {
    const row = flat[i];
    if (row[0] && row[0].toLowerCase().includes(rowKeyword.toLowerCase())) {
      // Extrai realizado por mês
      const serie = {};
      realCols.forEach((ci, mi) => {
        const mes = MESES[mi];
        if (mes) {
          const val = parseFloat(row[ci]);
          serie[mes] = isNaN(val) ? 0 : val;
        }
      });
      return serie;
    }
  }
  return null;
}

// Lê o env e retorna mapa key→valor
function lerEnv() {
  const content = fs.readFileSync(ENV_FILE, 'utf8');
  const lines = content.split('\n');
  return { content, lines };
}

// Atualiza ou insere uma chave no env
function setEnvVal(lines, key, value) {
  const idx = lines.findIndex(l => l.startsWith(key + '='));
  const nova = `${key}=${value}`;
  if (idx >= 0) {
    lines[idx] = nova;
  } else {
    lines.push(nova);
  }
}

// Processa todos os arquivos
const arquivos = fs.readdirSync(PASTA).filter(f => f.endsWith('.xlsx'));
const { lines } = lerEnv();
let totalAtualizados = 0;

arquivos.forEach(file => {
  const nomeBase = file.replace('.xlsx', '');
  const ame = AME_MAP[nomeBase];
  if (!ame) {
    console.log(`⚠️  Arquivo não mapeado: ${file}`);
    return;
  }

  console.log(`\n📊 ${file} → AME: ${ame}`);

  const wb = xlsx.readFile(path.join(PASTA, file));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const flat = rows.map(r => r.map(c => String(c).trim()));

  // Identifica colunas de realizado (pares de Cont./Real. por mês)
  // Estrutura: linha 5 = header de meses, linha 6 = Cont./Real., data começa na linha 7
  // Cols: 0=label, 1=Jan Cont, 2=Jan Real, 3=Fev Cont, 4=Fev Real, ...

  // Extrai de forma direta: encontra linha do header e mapeia
  let maioRealCol = -1;
  let mesesCols = {}; // mes → coluna do realizado

  for (let ri = 0; ri < Math.min(flat.length, 15); ri++) {
    const row = flat[ri];
    // Linha com "Janeiro", "Fevereiro", etc
    if (row.some(c => c === 'Janeiro')) {
      // Próxima linha deve ter Cont. / Real.
      const nextRow = flat[ri + 1] || [];
      let mesIdx = 0;
      let ci = 1; // começa na col 1 (col 0 é o label)
      while (ci < row.length) {
        if (row[ci] && row[ci] !== '') {
          const mes = MESES[mesIdx];
          if (mes) {
            // Próxima coluna vazia é par (Cont. | Real.)
            // nextRow[ci] = "Cont.", nextRow[ci+1] = "Real."
            mesesCols[mes] = ci + 1; // Real. está em ci+1
            mesIdx++;
          }
          ci += 2; // pula Cont + Real
        } else {
          ci++;
        }
      }
      break;
    }
  }

  console.log('  Meses mapeados:', Object.entries(mesesCols).map(([m,c])=>`${m}=col${c}`).join(', '));

  // Helper para extrair dados de uma seção
  function getSecao(secKeyword, rowKeyword) {
    let inSec = false;
    for (let ri = 0; ri < flat.length; ri++) {
      const row = flat[ri];
      if (!inSec && row[0] && row[0].includes(secKeyword)) {
        inSec = true;
        continue;
      }
      if (inSec && row[0] && row[0].toLowerCase().includes(rowKeyword.toLowerCase())) {
        const result = {};
        Object.entries(mesesCols).forEach(([mes, ci]) => {
          const val = parseFloat(row[ci]);
          result[mes] = isNaN(val) ? 0 : Math.round(val);
        });
        return result;
      }
      // Sai da seção se encontrar outra seção
      if (inSec && ri > 0 && row[0] && /^\d{3} -/.test(row[0]) && !row[0].includes(secKeyword)) {
        inSec = false;
      }
    }
    return null;
  }

  // Extrai dados
  const cons   = getSecao('271 -', 'Total') || getSecao('271 -', 'Subtotal (1)');
  const nmed   = getSecao('272 -', 'Total');
  const cmaMai = getSecao('571 -', 'Cirurgias ambulatoriais CMA');
  const cmaMen = getSecao('572 -', 'Cirurgias ambulatoriais cma');
  const sadt   = getSecao('680 -', 'Total');

  console.log('  CONS:', cons ? Object.entries(cons).filter(([,v])=>v>0).map(([m,v])=>`${m}=${v}`).join(', ') : 'não encontrado');
  console.log('  CMA Maior:', cmaMai ? Object.entries(cmaMai).filter(([,v])=>v>0).map(([m,v])=>`${m}=${v}`).join(', ') : 'não encontrado');
  console.log('  CMA Menor:', cmaMen ? Object.entries(cmaMen).filter(([,v])=>v>0).map(([m,v])=>`${m}=${v}`).join(', ') : 'não encontrado');
  console.log('  NMED:', nmed ? Object.entries(nmed).filter(([,v])=>v>0).map(([m,v])=>`${m}=${v}`).join(', ') : 'não encontrado');
  console.log('  SADT:', sadt ? Object.entries(sadt).filter(([,v])=>v>0).map(([m,v])=>`${m}=${v}`).join(', ') : 'não encontrado');

  // Atualiza apenas os campos que têm valor > 0 e que estão vazios no env
  const atualizarSeMaior = (dados, prefixo) => {
    if (!dados) return;
    MESES.forEach(mes => {
      const val = dados[mes];
      if (!val || val === 0) return;
      const key = `${ame}_${prefixo}_${mes}`;
      const idxLine = lines.findIndex(l => l.startsWith(key + '='));
      if (idxLine >= 0) {
        const atual = lines[idxLine].split('=')[1] || '';
        const realizado = atual.split('|')[0];
        const meta = atual.split('|')[1] || '';
        if (!realizado || realizado === '0') {
          lines[idxLine] = `${key}=${val}|${meta}`;
          console.log(`  ✅ ${key} → ${val}|${meta}`);
          totalAtualizados++;
        }
      }
    });
  };

  atualizarSeMaior(cmaMai, 'CMA');
  atualizarSeMaior(cmaMen, 'CMA_MENOR');
  // Não sobrescreve CONS/SADT/NMED pois já foram preenchidos manualmente
});

// Salva o arquivo
fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf8');
console.log(`\n✅ Atualização concluída! ${totalAtualizados} campos atualizados em CONFIGURACAO.env`);
console.log('\n⚠️  ATENÇÃO: os arquivos foram gerados em 21/05/2026 (antes do fechamento de Maio).');
console.log('   Os valores de Maio aparecem como 0. Para ter os dados reais de Maio,');
console.log('   baixe novos relatórios do SIRESP (período até 31/05/2026) e substitua na pasta:');
console.log('   ' + PASTA);
