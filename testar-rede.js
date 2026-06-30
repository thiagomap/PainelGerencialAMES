const XLSX = require('xlsx');
const path = require('path');
const BASE = '\\\\172.16.10.2\\regulacao_e_planejamento\\ROSANA_PASTA REDE';

// Lê atendimentos
try {
  const wb1 = XLSX.readFile(path.join(BASE, '0000. PAINEL DE INDICADORES', "ATENDIMENTOS PA'S POR ANO.xlsx"));
  console.log('ATENDIMENTOS - Abas:', wb1.SheetNames);
  const ws1 = wb1.Sheets[wb1.SheetNames[0]];
  const r1 = XLSX.utils.sheet_to_json(ws1, {header:1, defval:''});
  console.log('Primeiras 6 linhas:');
  r1.slice(0,6).forEach((r,i) => console.log(i+1, JSON.stringify(r.slice(0,8))));
} catch(e) { console.log('ERRO atendimentos:', e.message); }

// Lê cirurgias
try {
  const wb2 = XLSX.readFile(path.join(BASE, '0000. PAINEL DE INDICADORES', 'RELATORIO CIRURGIAS - ATUALIZADA 16.07.2025.xlsx'));
  console.log('\nCIRURGIAS - Abas:', wb2.SheetNames);
  wb2.SheetNames.forEach(aba => {
    const ws = wb2.Sheets[aba];
    const r = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
    console.log('\nAba:', aba);
    r.slice(0,5).forEach((row,i) => console.log(i+1, JSON.stringify(row.slice(0,8))));
  });
} catch(e) { console.log('ERRO cirurgias:', e.message); }
