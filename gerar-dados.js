'use strict';
const fs   = require('fs');
const path = require('path');

const BASE = __dirname;
const QTDE = path.join(BASE, 'Fluxo de Caixa', 'Metas de Quantidade');
const FIN  = path.join(BASE, 'Fluxo de Caixa', 'Metas Financeiras');
const DET  = path.join(BASE, 'Fluxo de Caixa', 'metas detalhadas');

// ── helpers ──────────────────────────────────────────────────────────────────

function parseBR(s = '') {
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;
}

function stripTags(s = '') {
  return s.replace(/<[^>]+>/g, '').trim();
}

// Extrai todos os valores <td> de uma string de linha HTML
function tdVals(rowStr) {
  const vals = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(rowStr)) !== null) vals.push(stripTags(m[1]));
  return vals;
}

// Normaliza nome para chave AME
function getKey(nome = '') {
  const n = nome.toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (n.includes('CAMPINAS'))    return 'cp';
  if (n.includes('CASA BRANCA')) return 'cb';
  if (n.includes('FRANCA'))      return 'frc';
  if (n.includes('RIBEIRAO'))    return 'rp';
  if (n.includes('SAO CARLOS'))  return 'scl';
  if (n.includes('JURUMIRIM') || n.includes('VALE')) return 'avj';
  return null;
}

function readHtml(filePath) {
  return fs.readFileSync(filePath, 'latin1');
}

function getAmeName(html) {
  // "AME CAMPINAS - Período: De 01 até 04/2026"
  const m = html.match(/AME\s+([A-ZÁÉÍÓÚÀÃÕÂÊÎÔÛÇ\s]+?)(?:\s*-\s*Per|\s*<)/i);
  return m ? m[1].trim() : null;
}

// ── Parser: Metas de Quantidade ──────────────────────────────────────────────

// Retorna valores mensais (jan-abr) + totais de uma seção
function parseSectionMonthly(html, code) {
  const reTotal = new RegExp(
    `<b>${code}\\s*-[\\s\\S]*?` +
    `<td[^>]*id=['"]tit_esquerda['"][^>]*>Total<\\/td>(.*?)<\\/tr>`,
    'i'
  );
  const m = html.match(reTotal);
  if (!m) return { jan:{c:0,r:0}, fev:{c:0,r:0}, mar:{c:0,r:0}, abr:{c:0,r:0}, cont:0, real:0 };
  const tds = tdVals('<tr>' + m[1] + '</tr>');
  // [0]=jan_c [1]=jan_r [2]=fev_c [3]=fev_r [4]=mar_c [5]=mar_r [6]=abr_c [7]=abr_r
  // [8]=tot_cont [9]=tot_real
  return {
    jan: { c: parseBR(tds[0]), r: parseBR(tds[1]) },
    fev: { c: parseBR(tds[2]), r: parseBR(tds[3]) },
    mar: { c: parseBR(tds[4]), r: parseBR(tds[5]) },
    abr: { c: parseBR(tds[6]), r: parseBR(tds[7]) },
    cont: parseBR(tds[8]), real: parseBR(tds[9]),
  };
}

// Retorna {cont, real} da linha "Total" de uma seção (código = "271", "571", etc.)
function parseSectionTotal(html, code) {
  // Regex: do legend da seção até o primeiro <td id='tit_esquerda'>Total</td>
  const reTotal = new RegExp(
    `<b>${code}\\s*-[\\s\\S]*?` +
    `<td[^>]*id=['"]tit_esquerda['"][^>]*>Total<\\/td>(.*?)<\\/tr>`,
    'i'
  );
  const m = html.match(reTotal);
  if (!m) return { cont: 0, real: 0 };

  const tds = tdVals('<tr>' + m[1] + '</tr>');
  // Após remover a célula "Total", a ordem é:
  // [0]=jan_c [1]=jan_r [2]=feb_c [3]=feb_r [4]=mar_c [5]=mar_r [6]=apr_c [7]=apr_r
  // [8]=tot_cont [9]=tot_real [10]=pct
  return { cont: parseBR(tds[8]), real: parseBR(tds[9]) };
}

// Retorna {cont, real} de uma linha de dados identificada por label parcial (para sub-linhas)
function parseDataRow(html, labelFragment) {
  const safe = labelFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<td[^>]*id=['"]lst_primeira['"][^>]*>(${safe}[^<]*)<\\/td>(.*?)<\\/tr>`,
    'i'
  );
  const m = html.match(re);
  if (!m) return { cont: 0, real: 0 };
  // m[2] = restante das tds da linha (sem a célula label)
  // [0]=jan_c [1]=jan_r ... [8]=tot_cont [9]=tot_real [10]=pct
  const tds = tdVals('<tr>' + m[2] + '</tr>');
  return { cont: parseBR(tds[8]), real: parseBR(tds[9]) };
}

function parseQtde(html) {
  return {
    s271:     parseSectionTotal(html, '271'),  // Consultas Médicas (total)
    s272:     parseSectionTotal(html, '272'),  // Seção 272 (total combinado)
    naoMed:   parseDataRow(html, 'Consultas N'),  // sub: Consultas Não Médicas
    procTer:  parseDataRow(html, 'Procedimentos Terap'),  // sub: Proc. Terapêuticos
    cmaA:     parseSectionTotal(html, '571'),  // CMA
    cmaM:     parseSectionTotal(html, '572'),  // cma
    sadtExt:  parseSectionTotal(html, '680'),  // SADT Externo
  };
}

// ── Parser: Metas Financeiras ─────────────────────────────────────────────────

// Busca label (string literal) na linha do HTML e retorna o último valor numérico <b>
function findFinRow(html, label) {
  const idx = html.indexOf(label);
  if (idx === -1) return 0;
  const trEnd = html.indexOf('</tr>', idx);
  if (trEnd === -1) return 0;
  const rowHtml = html.slice(idx, trEnd);
  // Pegar todos <NOBR><b>VALOR</b></NOBR> e retornar o último
  const re = /<NOBR><b>([\d.,]+)<\/b><\/NOBR>/gi;
  let last = 0, m;
  while ((m = re.exec(rowHtml)) !== null) last = parseBR(m[1]);
  return last;
}

// Retorna o PRIMEIRO valor numérico <NOBR> de uma linha (para saldos mensais)
function findFinRowFirst(html, label) {
  const idx = html.indexOf(label);
  if (idx === -1) return 0;
  const trEnd = html.indexOf('</tr>', idx);
  if (trEnd === -1) return 0;
  const rowHtml = html.slice(idx, trEnd);
  const m = rowHtml.match(/<NOBR>(?:<b>)?([\d.,]+)(?:<\/b>)?<\/NOBR>/i);
  return m ? parseBR(m[1]) : 0;
}

// Retorna TODOS os valores numéricos <NOBR> de uma linha como array [jan,fev,mar,abr,total]
function findFinRowAll(html, label) {
  const idx = html.indexOf(label);
  if (idx === -1) return [0,0,0,0,0];
  const trEnd = html.indexOf('</tr>', idx);
  if (trEnd === -1) return [0,0,0,0,0];
  const rowHtml = html.slice(idx, trEnd);
  const re = /<NOBR>(?:<b>)?([\d.,]+)(?:<\/b>)?<\/NOBR>/gi;
  const vals = []; let m;
  while ((m = re.exec(rowHtml)) !== null) vals.push(parseBR(m[1]));
  // Preenche até 5 com 0
  while (vals.length < 5) vals.push(0);
  return vals; // [jan, fev, mar, abr, total]
}

function parseFin(html) {
  const r = {
    receita:        findFinRow(html, 'Total de Receitas'),
    pessoal:        findFinRow(html, 'Pessoal (CLT)'),
    terceiros:      findFinRow(html, 'Terceirizados'),       // total Serviços Terceirizados
    assistenciais:  findFinRow(html, 'Assistenciais'),       // sub: assistenciais PJ
    administrativos:findFinRow(html, 'Administrativos'),     // sub: administrativos
    materiais:      findFinRow(html, '>Materiais<'),         // evitar sub-linhas
    utilidades:     findFinRow(html, 'Utilidade P'),         // Utilidade Pública
    ressarcimento:  findFinRow(html, 'por Rateio'),           // Ressarcimento por Rateio
    despesa:        findFinRow(html, 'Total de Despesas'),
  };
  r.saldoAbr = findFinRow(html, 'SALDO FINAL');
  r.saldoJan = findFinRowFirst(html, 'Saldo do M');
  // Séries mensais [jan, fev, mar, abr]
  const mRec  = findFinRowAll(html, 'Total de Receitas');
  const mDesp = findFinRowAll(html, 'Total de Despesas');
  const mPes  = findFinRowAll(html, 'Pessoal (CLT)');
  r.mensal = {
    receita:  mRec.slice(0,4),
    despesa:  mDesp.slice(0,4),
    pessoal:  mPes.slice(0,4),
    resultado: mRec.slice(0,4).map((v,i)=>v-mDesp[i]),
  };
  return r;
}

// ── Parser: metas detalhadas (especialidades) ─────────────────────────────────
// Estrutura: <td id='lst_primeira' rowspan='5'>ESPECIALIDADE</td> (rowspan=5 = Jan+Fev+Mar+Abr+Total)
// Última coluna de cada linha = "Total Realizado na Especialidade"

function parseDet(html) {
  const especialidades = {};

  // Divide o HTML por blocos de especialidade (cada td lst_primeira com rowspan)
  const parts = html.split(/<td[^>]+id=['"]lst_primeira['"]\s+rowspan=['"][^'"]+['"]\s*>/i);

  for (let i = 1; i < parts.length; i++) {
    // Nome da especialidade: texto até o primeiro </td>
    const nm = parts[i].match(/^([^<\n]{1,80})<\/td>/);
    if (!nm) continue;
    const nome = nm[1].trim();
    if (!nome || nome.length > 80 || nome.includes('<')) continue;

    // Encontra todas as linhas de dados neste bloco (até o próximo bloco de especialidade)
    const blockEnd = parts[i].indexOf("id='lst_primeira'");
    const block = blockEnd > 0 ? parts[i].slice(0, blockEnd) : parts[i];

    const rowRe = /<tr[^>]*class='dados listagem[^']*'[^>]*>([\s\S]*?)<\/tr>/gi;
    const vals = [];
    let rm;
    while ((rm = rowRe.exec(block)) !== null && vals.length < 5) {
      const tds = tdVals(rm[1]);
      // Último td = Total Realizado na Especialidade
      vals.push(parseBR(tds[tds.length - 1]));
    }

    if (vals.length >= 4) {
      especialidades[nome] = {
        jan: vals[0] || 0,
        fev: vals[1] || 0,
        mar: vals[2] || 0,
        abr: vals[3] || 0,
        total: vals[4] !== undefined ? vals[4] : vals.reduce((s, v) => s + v, 0),
      };
    }
  }
  return especialidades;
}

// ── processamento principal ──────────────────────────────────────────────────

const MESES = 4;
const SEM   = 6;
const FATOR = SEM / MESES; // 1.5

// Mínimos contratuais
const MIN = { consulta: 90, naoMed: 90, cmaA: 95, cmaM: 95, sadt: 90 };

// Lê metas mensais de Mai/Jun do CONFIGURACAO.env para calcular meta semestral real
// (necessário para AMEs com reajuste mid-semester, ex: Franca +19.4% a partir de Mai/2026)
function lerMetasEnv() {
  const cfgPath = path.join(BASE, 'CONFIGURACAO.env');
  const result = {};
  if (!fs.existsSync(cfgPath)) return result;
  const lines = fs.readFileSync(cfgPath, 'utf8').split('\n');
  const get = k => { const l = lines.find(l => l.startsWith(k+'=')); return l ? l.slice(k.length+1).trim() : ''; };
  const ENV_AMES = { cp:'CAMPINAS', cb:'CASA_BRANCA', frc:'FRANCA', rp:'RIBEIRAO', scl:'SAO_CARLOS', avj:'JURUMIRIM' };
  Object.entries(ENV_AMES).forEach(([k, ek]) => {
    result[k] = { mutirao: get(`${ek}_MUTIRAO`) === '1' };
    ['CONS','NMED','CMA','CMA_MENOR','SADT'].forEach(met => {
      result[k][met] = {};
      ['MAI','JUN'].forEach(m => {
        const v = get(`${ek}_${met}_${m}`);
        result[k][met][m] = v ? (Number(v.split('|')[1]) || 0) : 0;
      });
    });
  });
  return result;
}
const envMetas = lerMetasEnv();

const ames = {};

// 1. Metas de Quantidade
console.log('\n── Metas de Quantidade ──');
for (const file of fs.readdirSync(QTDE).filter(f => f.endsWith('.xls')).sort()) {
  const html = readHtml(path.join(QTDE, file));
  const nome = getAmeName(html);
  if (!nome) { console.log(`  SKIP ${file} (sem nome AME)`); continue; }
  const key  = getKey(nome);
  if (!key)  { console.log(`  SKIP ${file} (nome desconhecido: "${nome}")`); continue; }

  if (!ames[key]) ames[key] = { label: nome.replace('AME ', '') };
  ames[key].qtde = parseQtde(html);
  ames[key].s272mensal = parseSectionMonthly(html, '272'); // mensal para NMED
  console.log(`  ${key} (${nome}): consulta=${ames[key].qtde.s271.real} | CMA=${ames[key].qtde.cmaA.real} | cma=${ames[key].qtde.cmaM.real} | SADT=${ames[key].qtde.sadtExt.real}`);
}

// 2. Metas Financeiras
console.log('\n── Metas Financeiras ──');
for (const file of fs.readdirSync(FIN).filter(f => f.endsWith('.xls')).sort()) {
  const html = readHtml(path.join(FIN, file));
  const nome = getAmeName(html);
  if (!nome) { console.log(`  SKIP ${file}`); continue; }
  const key  = getKey(nome);
  if (!key)  { console.log(`  SKIP ${file} (desconhecido: "${nome}")`); continue; }

  if (!ames[key]) ames[key] = { label: nome.replace('AME ', '') };
  if (!ames[key].fin) {  // evitar duplicata (ex: 7º arquivo extra de Franca)
    ames[key].fin = parseFin(html);
    console.log(`  ${key}: receita=${ames[key].fin.receita.toFixed(0)} | despesa=${ames[key].fin.despesa.toFixed(0)}`);
  } else {
    console.log(`  ${key}: duplicata ignorada (${file})`);
  }
}

// 3. metas detalhadas (especialidades)
console.log('\n── metas detalhadas ──');
const espGlobal = {};
for (const file of fs.readdirSync(DET).filter(f => f.endsWith('.xls')).sort()) {
  const html = readHtml(path.join(DET, file));
  const nome = getAmeName(html);
  if (!nome) { console.log(`  SKIP ${file}`); continue; }
  const key  = getKey(nome);
  if (!key)  continue;

  if (!ames[key]) ames[key] = { label: nome.replace('AME ', '') };
  ames[key].especialidades = parseDet(html);
  const nEsp = Object.keys(ames[key].especialidades).length;
  console.log(`  ${key}: ${nEsp} especialidades`);

  // Acumula no global
  for (const [esp, v] of Object.entries(ames[key].especialidades)) {
    if (!espGlobal[esp]) espGlobal[esp] = {};
    espGlobal[esp][key] = v;
  }
}

// 4. Análise por AME
console.log('\n── Análise Contratual (semestral) ──');
const AME_LABELS = { cp:'Campinas', cb:'Casa Branca', frc:'Franca', rp:'Ribeirão Preto', scl:'São Carlos', avj:'Jurumirim' };

for (const [key, ame] of Object.entries(ames)) {
  const q = ame.qtde;
  if (!q) continue;

  const pcts = {
    consulta: q.s271.cont   > 0 ? (q.s271.real   / q.s271.cont)   * 100 : 0,
    naoMed:   q.s272.cont   > 0 ? (q.s272.real   / q.s272.cont)   * 100 : 0,
    cmaA:     q.cmaA.cont   > 0 ? (q.cmaA.real   / q.cmaA.cont)   * 100 : 0,
    cmaM:     q.cmaM.cont   > 0 ? (q.cmaM.real   / q.cmaM.cont)   * 100 : 0,
    sadt:     q.sadtExt.cont> 0 ? (q.sadtExt.real/ q.sadtExt.cont)* 100 : 0,
  };

  const riscos = [];
  if (pcts.consulta < MIN.consulta) riscos.push(`Consultas ${pcts.consulta.toFixed(0)}%`);
  if (pcts.naoMed   < MIN.naoMed)   riscos.push(`NMed ${pcts.naoMed.toFixed(0)}%`);
  if (pcts.cmaA     < MIN.cmaA)     riscos.push(`CMA ${pcts.cmaA.toFixed(0)}%`);
  if (pcts.cmaM     < MIN.cmaM)     riscos.push(`cma ${pcts.cmaM.toFixed(0)}%`);
  if (pcts.sadt     < MIN.sadt)     riscos.push(`SADT ${pcts.sadt.toFixed(0)}%`);

  const minPct = Math.min(...Object.values(pcts));
  const status = riscos.length === 0 ? 'ok'
               : minPct < 75         ? 'critico'
               : riscos.length >= 2  ? 'risco'
               : 'atencao';

  ame.analise = {
    label:         AME_LABELS[key] || ame.label,
    // realizados 4m
    consultReal:   q.s271.real,
    naoMedReal:    q.naoMed.real,
    procTerReal:   q.procTer.real,
    s272Real:      q.s272.real,
    cmaAReal:      q.cmaA.real,
    cmaMReal:      q.cmaM.real,
    sadtReal:      q.sadtExt.real,
    // contratados 4m
    consultCont:   q.s271.cont,
    naoMedCont:    q.naoMed.cont,
    procTerCont:   q.procTer.cont,
    s272Cont:      q.s272.cont,
    cmaACont:      q.cmaA.cont,
    cmaMCont:      q.cmaM.cont,
    sadtCont:      q.sadtExt.cont,
    // metas semestrais reais: 4m cont + metas de Mai e Jun do CONFIGURACAO.env
    // fallback: média mensal (cont/4) quando env não tem o mês
    ...(() => {
      const cm = envMetas[key] || {};
      const avg = v => Math.round(v / MESES);
      const consultMetaSem = q.s271.cont    + (cm.CONS?.MAI     || avg(q.s271.cont))     + (cm.CONS?.JUN     || avg(q.s271.cont));
      const cmaAMetaSem    = q.cmaA.cont    + (cm.CMA?.MAI      || avg(q.cmaA.cont))     + (cm.CMA?.JUN      || avg(q.cmaA.cont));
      const cmaMMetaSem    = q.cmaM.cont    + (cm.CMA_MENOR?.MAI|| avg(q.cmaM.cont))     + (cm.CMA_MENOR?.JUN|| avg(q.cmaM.cont));
      const sadtMetaSem    = q.sadtExt.cont + (cm.SADT?.MAI     || avg(q.sadtExt.cont))  + (cm.SADT?.JUN     || avg(q.sadtExt.cont));
      const s272MetaSem    = q.s272.cont    + (cm.NMED?.MAI      || avg(q.s272.cont))     + (cm.NMED?.JUN      || avg(q.s272.cont));
      return {
        // metas semestrais corretas (com variações mensais)
        consultMetaSem, s272MetaSem, cmaAMetaSem, cmaMMetaSem, sadtMetaSem,
        // retrocompat
        consultMeta: consultMetaSem,
        cmaAMeta:    cmaAMetaSem,
        cmaMeta:     cmaMMetaSem,
        sadtMeta:    sadtMetaSem,
        // projeções ao ritmo atual (real × 1.5)
        consultProj: Math.round(q.s271.real    * FATOR),
        cmaAProj:    Math.round(q.cmaA.real    * FATOR),
        cmaMProj:    Math.round(q.cmaM.real    * FATOR),
        sadtProj:    Math.round(q.sadtExt.real * FATOR),
      };
    })(),
    // % contratuais (4m real / 4m cont)
    pctConsulta:   +pcts.consulta.toFixed(1),
    pctNaoMed:     +pcts.naoMed.toFixed(1),
    pctCmaA:       +pcts.cmaA.toFixed(1),
    pctCmaM:       +pcts.cmaM.toFixed(1),
    pctSadt:       +pcts.sadt.toFixed(1),
    // semaforo
    riscos,
    status,
    // mutirao: meta CMA Maior = 100% no semestre (nao 95%)
    mutirao: envMetas[key]?.mutirao || false,
  };

  console.log(`  ${key}: ${status.toUpperCase()} | ${riscos.length ? riscos.join(', ') : 'OK'}`);
}

// 5. Totais consolidados
const totais = { qtde: {}, fin: {}, analise: {} };

for (const ame of Object.values(ames)) {
  if (ame.qtde) {
    for (const [k, v] of Object.entries(ame.qtde)) {
      if (v && typeof v.real !== 'undefined') {
        if (!totais.qtde[k]) totais.qtde[k] = { cont: 0, real: 0 };
        totais.qtde[k].cont += v.cont;
        totais.qtde[k].real += v.real;
      }
    }
  }
  if (ame.fin) {
    for (const [k, v] of Object.entries(ame.fin)) {
      totais.fin[k] = (totais.fin[k] || 0) + v;
    }
  }
  if (ame.analise) {
    for (const [k, v] of Object.entries(ame.analise)) {
      if (typeof v === 'number') {
        totais.analise[k] = (totais.analise[k] || 0) + v;
      }
    }
  }
}

// 5b. Atualizar CONFIGURACAO.env com valores mensais de NMED extraídos do Excel
(function atualizarNmedNoEnv() {
  const cfgPath = path.join(BASE, 'CONFIGURACAO.env');
  if (!fs.existsSync(cfgPath)) return;
  let cfgLines = fs.readFileSync(cfgPath, 'utf8').split('\n');
  const setVal = (key, val) => {
    const idx = cfgLines.findIndex(l => l.startsWith(key + '='));
    const nova = `${key}=${val}`;
    if (idx >= 0) cfgLines[idx] = nova; else cfgLines.push(nova);
  };
  const ENV_AMES = { cp:'CAMPINAS', cb:'CASA_BRANCA', frc:'FRANCA', rp:'RIBEIRAO', scl:'SAO_CARLOS', avj:'JURUMIRIM' };
  const MESES_MAP = { jan:'JAN', fev:'FEV', mar:'MAR', abr:'ABR' };
  let atualizados = 0;
  for (const [key, ek] of Object.entries(ENV_AMES)) {
    const nm = ames[key]?.s272mensal;
    if (!nm) continue;
    for (const [mes, envMes] of Object.entries(MESES_MAP)) {
      const r = nm[mes]?.r || 0;
      const c = nm[mes]?.c || 0;
      if (r > 0 || c > 0) {
        setVal(`${ek}_NMED_${envMes}`, `${r||''}|${c||''}`);
        atualizados++;
      }
    }
  }
  if (atualizados > 0) {
    fs.writeFileSync(cfgPath, cfgLines.join('\n'), 'utf8');
    console.log(`\n  ✓ CONFIGURACAO.env atualizado: ${atualizados} valores NMED mensais`);
  }
})();

// 6. Escrita do JSON
const saida = {
  geradoEm: new Date().toISOString(),
  periodo:  'Janeiro-Abril 2026',
  meses:    MESES,
  mesesRealizados: MESES,
  ames,
  totais,
  especialidades: espGlobal,
};

// 6a. JSON completo para uso externo
const outPath = path.join(BASE, 'dados-dashboard.json');
fs.writeFileSync(outPath, JSON.stringify(saida, null, 2), 'utf8');

// 6b. Arquivo JS embutível para o dashboard (funciona em file://)
const jsPath = path.join(BASE, 'dados-embutidos.js');
// Excluir especialidades do embutido (economiza ~1MB) — espGlobal é carregado separado
const saidaSemEsp = { ...saida };
delete saidaSemEsp.especialidades;
fs.writeFileSync(jsPath,
  `/* Gerado automaticamente por gerar-dados.js em ${saida.geradoEm} */\n` +
  `window.DADOS_DASH = ${JSON.stringify(saidaSemEsp, null, 1)};\n`,
  'utf8'
);

console.log(`\n✓ dados-dashboard.json gerado (${Object.keys(ames).length} AMEs)`);
console.log(`✓ dados-embutidos.js gerado`);
console.log(`  Caminho: ${outPath}`);
