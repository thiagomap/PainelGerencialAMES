'use strict';
/**
 * gerar-dados-trim.js
 * Lê todos os XLS da pasta "Metas Trimestrais" e gera:
 *   - metas-trimestrais.json   (status + valores por indicador)
 *   - procedimentos-trim.json  (detalhe por procedimento com real vs meta)
 * Uso: node gerar-dados-trim.js
 */
const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const BASE = path.join(__dirname, 'Metas Trimestrais');

// ─── helpers ──────────────────────────────────────────────────────────────────
function readSheet(file, sheetName) {
  try {
    const wb = XLSX.readFile(file);
    const sn = sheetName
      ? wb.SheetNames.find(s => s.toLowerCase().includes(sheetName.toLowerCase())) || wb.SheetNames[0]
      : wb.SheetNames[0];
    return XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null });
  } catch(e) { return []; }
}

function num(v) { return typeof v === 'number' ? v : (parseFloat(String(v||'').replace(',','.')) || 0); }
function pct(r, m) { return m > 0 ? Math.round(r / m * 100) : null; }
// min = limiar SES mínimo aceitável: 90 para Consultas/SADT/NMed, 95 para CMA Maior/cma menor
function status(p, min) {
  const m = min || 90; // padrão SES = 90%
  if (p === null || p === undefined) return 'pendente';
  if (p >= 100) return 'sim';
  if (p >= m)   return 'parcial'; // dentro da tolerância SES mas abaixo do ideal
  return 'nao';                   // abaixo do mínimo SES
}

// ─── NEW: Mapeamento de pastas por AME ────────────────────────────────────────
const AME_PATHS = {
  cp:  { nspDir: 'Ame Campinas',           humPat: /campinas/i,              matPat: /campinas/i },
  frc: { nspDir: 'Ame Franca',             humPat: /franca/i,                matPat: /franca/i },
  cb:  { nspDir: 'Ame Casa Branca',        humPat: /casa[\s._-]?branca/i,    matPat: /casa[\s._-]?branca/i },
  avj: { nspDir: 'Ame Vale do Jurumirim',  humPat: /avar|vale|jurumirim/i,   matPat: /avar|vale|jurumirim/i },
  rp:  { nspDir: 'Ame Ribeirão Preto',     humPat: /ribeir|\.rp\b|ame.?rp/i, matPat: /ribeir|\.rp\b/i },
  scl: { nspDir: 'Ame São Carlos',         humPat: /s[aã]o[\s._-]?carlos/i,  matPat: /s[aã]o[\s._-]?carlos/i },
};
// Avastin aplicável somente a CP, RP e AVJ (Avaré)
const AVASTIN_NA = ['frc', 'cb', 'scl'];

// Conta linhas com dados na primeira sheet de um xlsx (heurística col-A)
// Conta linhas de dados na sheet mais adequada do arquivo
// Prefers sheet matching /1.?tri/i (1T data), falls back to first sheet
function countDataRows(file, sheetPat) {
  try {
    const wb = XLSX.readFile(file);
    const pat = sheetPat || /1.?tri/i;
    const sheetName = wb.SheetNames.find(s => pat.test(s)) || wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    let count = 0, headerSeen = false;
    for (const row of data) {
      const v = String(row[0] || '').trim();
      if (!v) continue;
      // pula linhas de cabeçalho/título (≤4 colunas preenchidas na linha toda)
      if (!headerSeen) {
        const ncols = row.filter(c => c != null && String(c).trim() !== '').length;
        if (ncols <= 2) continue; // títulos gerais — pular
        headerSeen = true; continue; // linha de cabeçalho real — pular, contar próximas
      }
      count++;
    }
    return count;
  } catch(e) { return -1; }
}

function detectNspStatus(k) {
  const nspBase = path.join(BASE, 'Nucleo de Segurança do Paciente', AME_PATHS[k].nspDir);
  let xlsxFile = null;
  try {
    const files = fs.readdirSync(nspBase);
    xlsxFile = files.find(f => f.toLowerCase().endsWith('.xlsx') && /planilha|monitoramento|nsp/i.test(f))
            || files.find(f => f.toLowerCase().endsWith('.xlsx'));
  } catch(e) {
    return { status: 'pendente', valor: null, observacao: 'Pasta NSP não encontrada' };
  }
  if (!xlsxFile) return { status: 'pendente', valor: null, observacao: 'Planilha NSP não encontrada' };
  const rows = countDataRows(path.join(nspBase, xlsxFile));
  if (rows < 0) return { status: 'parcial', valor: null, observacao: `Erro ao ler NSP (${xlsxFile})` };
  if (rows > 0) return { status: 'sim', valor: rows, observacao: `NSP registrado — ${rows} lançamentos` };
  return { status: 'parcial', valor: 0, observacao: 'Planilha NSP enviada (sem registros)' };
}

function detectMatriciamentoStatus(k) {
  const matBase = path.join(BASE, 'Matriciamento');
  const pat = AME_PATHS[k].matPat;
  let found = null;
  try {
    const files = fs.readdirSync(matBase);
    const match = files.find(f => f.toLowerCase().endsWith('.xlsx') && pat.test(f));
    if (match) found = path.join(matBase, match);
  } catch(e) {
    return { status: 'pendente', valor: null, observacao: 'Pasta Matriciamento não encontrada' };
  }
  if (!found) return { status: 'pendente', valor: null, observacao: 'Planilha Matriciamento não localizada' };
  const rows = countDataRows(found);
  if (rows < 0) return { status: 'parcial', valor: null, observacao: 'Erro ao ler planilha Matriciamento' };
  if (rows > 0) return { status: 'sim', valor: rows, observacao: `Matriciamento registrado — ${rows} sessões` };
  return { status: 'parcial', valor: 0, observacao: 'Planilha Matriciamento enviada (sem dados)' };
}

function detectHumanizacaoStatus(k) {
  const humBase = path.join(BASE, 'Humanização');
  const pat = AME_PATHS[k].humPat;
  function findInDir(dir) {
    try {
      return fs.readdirSync(dir).find(f => pat.test(f) || /pih/i.test(f));
    } catch(e) { return null; }
  }
  // Verifica pasta principal
  if (findInDir(humBase)) return { status: 'sim', valor: null, observacao: 'PIH enviado' };
  // Verifica subpastas
  try {
    const subs = fs.readdirSync(humBase)
      .filter(f => { try { return fs.statSync(path.join(humBase, f)).isDirectory(); } catch(e) { return false; } });
    for (const sub of subs) {
      if (findInDir(path.join(humBase, sub))) return { status: 'sim', valor: null, observacao: 'PIH enviado' };
    }
  } catch(e) {}
  return { status: 'pendente', valor: null, observacao: 'PIH não localizado' };
}

function detectCdrStatus() {
  const cdrFile = path.join(BASE, 'CDR - Anual.docx');
  if (fs.existsSync(cdrFile)) return { status: 'sim', valor: null, observacao: 'CDR Anual enviado' };
  // Busca por qualquer arquivo CDR
  try {
    const f = fs.readdirSync(BASE).find(f => /cdr/i.test(f));
    if (f) return { status: 'sim', valor: null, observacao: `CDR enviado (${f})` };
  } catch(e) {}
  return { status: 'pendente', valor: null, observacao: 'CDR não encontrado' };
}

let _dashCache = null;
function getDash() {
  if (!_dashCache) _dashCache = JSON.parse(fs.readFileSync(path.join(__dirname, 'dados-dashboard.json'), 'utf8'));
  return _dashCache;
}

// Meses realizados: 4 (Jan-Abr). Q1=3 meses (Jan-Mar), Q2=1 mês feito (Abr).
// Meta semestral = cont_4m × 6/4. Meta trimestral = meta_sem / 2. Meta mensal = meta_sem / 6.

function calcOfertaConsulta(k) {
  try {
    const s271 = getDash().ames[k]?.qtde?.s271;
    if (!s271 || !s271.cont) return { status: 'pendente', valor: null, observacao: '' };
    const metaSem  = Math.round(s271.cont * 6 / 4);   // meta semestral real
    const metaQ1   = Math.round(metaSem / 2);           // meta Q1 = sem ÷ 2
    const real1T   = Math.round(s271.real * 3 / 4);    // realizado Q1 = 3/4 dos 4m
    const p = pct(real1T, metaQ1);
    return { status: status(p, 90), valor: p,
      observacao: `${real1T.toLocaleString('pt-BR')} de ${metaQ1.toLocaleString('pt-BR')} consultas — Q1 (mín SES 90%)` };
  } catch(e) { return { status: 'pendente', valor: null, observacao: '' }; }
}

function calcSadtLinha(k) {
  try {
    const sadt = getDash().ames[k]?.qtde?.sadtExt;
    if (!sadt || !sadt.cont) return { status: 'pendente', valor: null, observacao: '' };
    const metaSem  = Math.round(sadt.cont * 6 / 4);
    const metaQ1   = Math.round(metaSem / 2);
    const real1T   = Math.round(sadt.real * 3 / 4);
    const p = pct(real1T, metaQ1);
    return { status: status(p, 90), valor: p,
      observacao: `${real1T.toLocaleString('pt-BR')} de ${metaQ1.toLocaleString('pt-BR')} exames SADT — Q1 (mín SES 90%)` };
  } catch(e) { return { status: 'pendente', valor: null, observacao: '' }; }
}

// Lê valores mensais de Abril do CONFIGURACAO.env para uso no 2T parcial
function lerEnvAbril(ameEnvKey, metricKey) {
  try {
    const cfgPath = path.join(BASE, '..', 'CONFIGURACAO.env');
    const lines = fs.readFileSync(cfgPath, 'utf8').split('\n');
    const get = k => { const l = lines.find(l => l.startsWith(k+'=')); return l ? l.slice(k.length+1).trim() : ''; };
    const v = get(`${ameEnvKey}_${metricKey}_ABR`);
    if (!v) return null;
    const parts = v.split('|');
    const real = parseFloat(parts[0]) || 0;
    const meta = parseFloat(parts[1]) || 0;
    return { real, meta };
  } catch(e) { return null; }
}

const ENV_AME_KEYS = { cp:'CAMPINAS', cb:'CASA_BRANCA', frc:'FRANCA', rp:'RIBEIRAO', scl:'SAO_CARLOS', avj:'JURUMIRIM' };

// Q2: Apenas Abril realizado (1 de 3 meses).
// meta_Q2 = meta_sem / 2. Projeta o Q2 completo = real_abr × 3.
// SES mín Consultas/SADT = 90% da meta Q2.
function calcOfertaConsulta2T(k) {
  try {
    const s271   = getDash().ames[k]?.qtde?.s271;
    const envKey = ENV_AME_KEYS[k];
    const abr    = lerEnvAbril(envKey, 'CONS');
    if (!abr || !abr.meta) return { status: 'pendente', valor: null, observacao: 'Aguardando dados Mai-Jun/2026' };
    const metaSem = s271 ? Math.round(s271.cont * 6 / 4) : abr.meta * 6;
    const metaQ2  = Math.round(metaSem / 2);              // meta Q2 = sem ÷ 2
    const metaMes = Math.round(metaSem / 6);               // meta mensal = sem ÷ 6
    const projQ2  = abr.real * 3;                          // projeção Q2 ao ritmo de Abr × 3
    const pMes    = pct(abr.real, metaMes);                // % vs meta mensal de Abr
    const pProjQ2 = pct(projQ2, metaQ2);                   // % projeção Q2 vs meta Q2
    // status: avaliar se projeção Q2 atinge o mínimo SES 90%
    const stProj = pProjQ2 !== null ? (pProjQ2 >= 100 ? 'sim' : pProjQ2 >= 90 ? 'parcial' : 'nao') : 'pendente';
    return {
      status: 'parcial', // Q2 incompleto = sempre parcial na exibição
      valor: pMes,
      observacao: `Abr: ${abr.real.toLocaleString('pt-BR')} (${pMes}% da meta mensal ${metaMes.toLocaleString('pt-BR')}) — proj Q2: ${projQ2.toLocaleString('pt-BR')} de ${metaQ2.toLocaleString('pt-BR')} (${pProjQ2}%) | mín SES 90% — 1 de 3 meses`
    };
  } catch(e) { return { status: 'pendente', valor: null, observacao: 'Aguardando dados Mai-Jun/2026' }; }
}

function calcSadtLinha2T(k) {
  try {
    const sadt   = getDash().ames[k]?.qtde?.sadtExt;
    const envKey = ENV_AME_KEYS[k];
    const abr    = lerEnvAbril(envKey, 'SADT');
    if (!abr || !abr.meta) return { status: 'pendente', valor: null, observacao: 'Aguardando dados Mai-Jun/2026' };
    const metaSem = sadt ? Math.round(sadt.cont * 6 / 4) : abr.meta * 6;
    const metaQ2  = Math.round(metaSem / 2);
    const metaMes = Math.round(metaSem / 6);
    const projQ2  = abr.real * 3;
    const pMes    = pct(abr.real, metaMes);
    const pProjQ2 = pct(projQ2, metaQ2);
    return {
      status: 'parcial',
      valor: pMes,
      observacao: `Abr: ${abr.real.toLocaleString('pt-BR')} (${pMes}% da meta mensal ${metaMes.toLocaleString('pt-BR')}) — proj Q2: ${projQ2.toLocaleString('pt-BR')} de ${metaQ2.toLocaleString('pt-BR')} (${pProjQ2}%) | mín SES 90% — 1 de 3 meses`
    };
  } catch(e) { return { status: 'pendente', valor: null, observacao: 'Aguardando dados Mai-Jun/2026' }; }
}

// ─── 1. Lê Quadro de Monitoramento (procedimentos CMA/cma) ───────────────────
const QUAD_FILES = {
  cp:  '1º Trimestre - Quadro de Monitoramento/Quadro Monitoramento - Campinas  .xlsx',
  cb:  '1º Trimestre - Quadro de Monitoramento/Quadro Monitoramento - Casa Branca.xlsx',
  frc: '1º Trimestre - Quadro de Monitoramento/Quadro Monitoramento - Franca.xlsx',
  rp:  '1º Trimestre - Quadro de Monitoramento/Quadro Monitoramento - Ribeirão Preto.xlsx',
  scl: '1º Trimestre - Quadro de Monitoramento/Quadro Monitoramento - São Carlos.xlsx',
  avj: '1º Trimestre - Quadro de Monitoramento/Quadro Monitoramento - Vale do Jurumirim.xlsx',
};

// Detecta arquivos do 2T automaticamente pelo nome da AME na pasta
function findQuadro2T(key) {
  const dir2T = path.join(BASE, '2° trimestre - Quadro de Monitoramento');
  if (!fs.existsSync(dir2T)) return null;
  try {
    const files = fs.readdirSync(dir2T);
    const pat = AME_PATHS[key].matPat; // reutiliza padrão de nome
    const found = files.find(f => f.endsWith('.xlsx') && pat.test(f));
    return found ? path.join(dir2T, found) : null;
  } catch(e) { return null; }
}

// Cols confirmadas empiricamente:
// 2-13 = Jan-Dez (mensais)
// 14 = meta 1T  | 15 = real 1T  | 16 = % (delta, NÃO usar)
// 17 = meta mensal
// 18 = meta 2T  | 19 = real 2T
// 21 = meta 3T  | 22 = real 3T
// 24 = meta 4T  | 25 = real 4T
// 27 = meta Ano | 28 = real Ano (acumulado)
function numTri(v) {
  // Valores "-" ou string vazia = 0; só aceita números reais
  if (typeof v === 'number') return v;
  const s = String(v||'').trim();
  if (s === '-' || s === '') return 0;
  return parseFloat(s.replace(',','.')) || 0;
}
function statusTri(real, meta) {
  if (meta <= 0) return 'pendente';
  if (real <= 0) return 'pendente'; // trimestre ainda não encerrado
  return status(Math.round(real / meta * 100));
}

function parseQuadro(key, filePath) {
  const file = filePath || path.join(BASE, QUAD_FILES[key]);
  const wb = XLSX.readFile(file);
  const rows = [];
  const seen = new Set();

  wb.SheetNames.forEach(sn => {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });

    // Localiza linha de cabeçalho (contém "Procedimentos selecionados" ou "selecionad")
    let hdrIdx = -1;
    data.forEach((row, i) => {
      const v = String(row[1]||'').toLowerCase();
      if (v.includes('selec') || v.includes('procedimento')) hdrIdx = i;
    });
    if (hdrIdx < 0) return;

    for (let i = hdrIdx + 1; i < data.length; i++) {
      const r = data[i];
      const nome = String(r[1]||'').trim();
      if (!nome || nome.startsWith('Quadro') || nome.startsWith('AME')) continue;

      // Mensais (Jan=col2 … Dez=col13)
      const mensal = [2,3,4,5,6,7,8,9,10,11,12,13].map(c => numTri(r[c]));

      // Trimestres — usando colunas fixas confirmadas
      const meta1T = numTri(r[14]), real1T = numTri(r[15]);
      const meta2T = numTri(r[18]), real2T = numTri(r[19]);
      const meta3T = numTri(r[21]), real3T = numTri(r[22]);
      const meta4T = numTri(r[24]), real4T = numTri(r[25]);
      const metaAno = numTri(r[27]), realAno = numTri(r[28]);
      const metaMes = numTri(r[17]);

      const pct1T = meta1T > 0 ? Math.round(real1T / meta1T * 100) : null;
      const pct2T = meta2T > 0 ? Math.round(real2T / meta2T * 100) : null;
      const pct3T = meta3T > 0 ? Math.round(real3T / meta3T * 100) : null;
      const pct4T = meta4T > 0 ? Math.round(real4T / meta4T * 100) : null;
      const pctAno = metaAno > 0 ? Math.round(realAno / metaAno * 100) : null;

      const dedupeKey = nome.toLowerCase().replace(/\s+/g,'');
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      rows.push({
        nome, cod: String(r[0]||''), aba: sn,
        mensal, metaMes,
        meta1T, real1T, pct1T, status1T: statusTri(real1T, meta1T),
        meta2T, real2T, pct2T, status2T: statusTri(real2T, meta2T),
        meta3T, real3T, pct3T, status3T: statusTri(real3T, meta3T),
        meta4T, real4T, pct4T, status4T: statusTri(real4T, meta4T),
        metaAno, realAno, pctAno, statusAno: statusTri(realAno, metaAno),
      });
    }
  });
  return rows;
}

// ─── 2. Lê Consultas Pactuadas (especialidades por AME) ────────────────────────
function parseConsultasPactuadas() {
  const file = path.join(BASE, 'Acompanhamento das EspecialidadesXDRS/Consultas pactuadas X DRS.xlsx');
  const wb = XLSX.readFile(file);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });

  const result = {};
  let currentAme = null;

  const AME_MAP = {
    'AME Franca': 'frc',
    'AME Casa Branca': 'cb',
    'AME Campinas': 'cp',
    'AME Vale do Jurumirim': 'avj',
    'AME São Carlos': 'scl',
    'AME Ribeirão Preto': 'rp',
  };

  data.forEach(row => {
    const cel0 = String(row[0]||'').trim();
    if (AME_MAP[cel0]) { currentAme = AME_MAP[cel0]; result[currentAme] = []; return; }
    if (!currentAme) return;
    if (cel0 === 'Especialidades Médicas' || !cel0) return;

    const esp = cel0;
    const metaMes = num(row[1]), metaTri = num(row[2]);
    const real1T   = num(row[3]);
    const p = pct(real1T, metaTri);
    if (esp && metaTri > 0) {
      result[currentAme].push({ esp, metaMes, metaTri, real1T, pct1T: p, status1T: status(p) });
    }
  });
  return result;
}

// ─── 3. Calcula status consolidado do Quadro de Monitoramento ─────────────────
function calcMonitoramentoStatus(procs, triKey) {
  // triKey: '1T' (default), '2T', etc.
  const mk = triKey === '2T' ? 'meta2T' : 'meta1T';
  const rk = triKey === '2T' ? 'real2T' : 'real1T';
  const pk = triKey === '2T' ? 'pct2T'  : 'pct1T';
  if (!procs || procs.length === 0) return { status: 'pendente', pct: null, obs: '' };
  const hasData = procs.some(p => (p[rk]||0) > 0);
  if (!hasData) return { status: 'pendente', pct: null, obs: 'Sem dados para este trimestre' };
  const totalMeta = procs.reduce((s, p) => s + (p[mk]||0), 0);
  const totalReal = procs.reduce((s, p) => s + (p[rk]||0), 0);
  const p = pct(totalReal, totalMeta);
  // Monitoramento = procedimentos CMA/cma → SES mín 95%
  const abaixo = procs.filter(pr => pr[pk] !== null && pr[pk] < 100 && pr[pk] > 0);
  const obs = abaixo.length > 0
    ? `Abaixo de 100%: ${abaixo.map(x => x.nome.substring(0,28)+'…').join('; ')}`
    : 'Todos os procedimentos ≥ 100% da meta';
  return { status: status(p, 95), pct: p, obs };
}

// ─── 4. Calcula status esp_drs ─────────────────────────────────────────────────
function calcEspDrsStatus(esps) {
  if (!esps || esps.length === 0) return { status: 'pendente', pct: null, obs: '' };
  const totalMeta = esps.reduce((s, e) => s + (e.metaTri||0), 0);
  const totalReal = esps.reduce((s, e) => s + (e.real1T||0), 0);
  const p = pct(totalReal, totalMeta);
  const abaixo = esps.filter(e => e.pct1T !== null && e.pct1T < 100);
  const obs = abaixo.length > 0
    ? `Abaixo: ${abaixo.map(e => e.esp + ' ' + e.pct1T + '%').join('; ')}`
    : 'Todas as especialidades ≥ 100% da meta';
  return { status: status(p, 90), pct: p, obs }; // DRS = sem limiar específico SES, usa 90%
}

// ─── Retina: controlado à parte pela SES-SP ───────────────────────────────────
const RETINA_NA = ['frc', 'cb', 'scl'];
const RETINA_DIR = '1° Trimestre - Monitoramento Retina';
const RETINA_FIXED = {
  cp:  'Quadro Monitoramento - Retina Campinas.xlsx',
  avj: 'Quadro Monitoramento - Retina  Vale do Jurumirim_2026.xlsx',
};

// procs = linhas já parseadas do Quadro de Monitoramento desta AME
function calcRetinaStatus(k, procs) {
  if (RETINA_NA.includes(k)) return { status: 'na', valor: null, observacao: 'Não aplicável' };

  // Filtra linhas de Retina dentro dos procedimentos já lidos (aba "Serviço de Retina")
  const retinaRows = (procs || []).filter(p => /retina/i.test(p.nome));

  if (retinaRows.length > 0) {
    const totalMeta = retinaRows.reduce((s, p) => s + (p.meta1T||0), 0);
    const totalReal = retinaRows.reduce((s, p) => s + (p.real1T||0), 0);
    if (totalMeta === 0) return { status: 'pendente', valor: null, observacao: 'Meta Retina não definida' };
    const p = Math.round(totalReal / totalMeta * 100);
    const abaixo = retinaRows.filter(pr => pr.pct1T !== null && pr.pct1T < 100 && pr.pct1T > 0);
    const obs = abaixo.length > 0
      ? `Abaixo: ${abaixo.map(x => x.nome.substring(0,30)+'…').join('; ')}`
      : `Retina ${p}% — ${retinaRows.length} procedimento(s) ≥ meta`;
    return { status: status(p), valor: p, observacao: obs };
  }

  // Fallback: busca arquivo separado na pasta de Monitoramento Retina
  const retinaDir = path.join(BASE, RETINA_DIR);
  let filePath = null;
  if (RETINA_FIXED[k]) {
    const fp = path.join(retinaDir, RETINA_FIXED[k]);
    if (fs.existsSync(fp)) filePath = fp;
  }
  if (!filePath && fs.existsSync(retinaDir)) {
    try {
      const f = fs.readdirSync(retinaDir)
        .find(f => f.endsWith('.xlsx') && AME_PATHS[k].matPat.test(f));
      if (f) filePath = path.join(retinaDir, f);
    } catch(e) {}
  }
  if (!filePath) return { status: 'pendente', valor: null, observacao: 'Dados de Retina não encontrados no Quadro de Monitoramento' };

  try {
    const fileProcs = parseQuadro(k, filePath);
    if (!fileProcs || fileProcs.length === 0) return { status: 'parcial', valor: null, observacao: 'Arquivo Retina sem dados' };
    const totalMeta = fileProcs.reduce((s, p) => s + (p.meta1T||0), 0);
    const totalReal = fileProcs.reduce((s, p) => s + (p.real1T||0), 0);
    if (totalMeta === 0) return { status: 'pendente', valor: null, observacao: 'Meta Retina não definida' };
    const p = Math.round(totalReal / totalMeta * 100);
    return { status: status(p), valor: p, observacao: `Retina ${p}% (arquivo separado)` };
  } catch(e) {
    return { status: 'parcial', valor: null, observacao: `Erro: ${e.message}` };
  }
}

// ─── 5. Lê JSON atual e mescla ─────────────────────────────────────────────────
const trimJSON = JSON.parse(fs.readFileSync(path.join(__dirname, 'metas-trimestrais.json'), 'utf8'));
const KEYS = ['cp','frc','cb','avj','rp','scl'];

// Garante que o JSON tem a chave de trimestres
trimJSON.trimestres = ['1T/2026', '2T/2026'];

// Monta metas padrão pendentes para um trimestre
function metasPendentes(trimKey) {
  const avastin_na = AVASTIN_NA;
  const base = {};
  ['oferta_consulta','monitoramento','esp_drs','sadt_linha','avastin','qualidade_info','humanizacao','cdr'].forEach(id => {
    base[id] = { status: 'pendente', valor: null, observacao: '' };
  });
  return base;
}

const procedimentos = { '1T': {}, '2T': {} };
const consultasPactuadas = parseConsultasPactuadas();

KEYS.forEach(k => {
  console.log(`\n═══ ${k.toUpperCase()} ═══`);
  const ame = trimJSON.ames[k];
  if (!ame) return;

  // ── Métricas comuns (baseadas em documentos — iguais nos dois trimestres) ──
  const nsp    = detectNspStatus(k);
  const mat    = detectMatriciamentoStatus(k);
  const hum    = detectHumanizacaoStatus(k);
  const cdr    = detectCdrStatus();
  const qiStatus = (nsp.status==='sim' && mat.status==='sim') ? 'sim'
                 : (nsp.status!=='pendente' || mat.status!=='pendente') ? 'parcial'
                 : 'pendente';
  console.log(`  [${k}] NSP: ${nsp.observacao} (${nsp.status}) | Mat: ${mat.observacao} (${mat.status}) | Hum: ${hum.status} | CDR: ${cdr.status}`);

  // ── Processa 1T ──
  let procs1T = [];
  try { procs1T = parseQuadro(k); }
  catch(e) { console.log(`  1T monitoramento: AVISO ${e.message}`); }
  procedimentos['1T'][k] = procs1T;
  const mon1T    = calcMonitoramentoStatus(procs1T, '1T');
  const esps1T   = consultasPactuadas[k] || [];
  const esp1T    = calcEspDrsStatus(esps1T);
  const oferta1T = calcOfertaConsulta(k);
  const sadt1T   = calcSadtLinha(k);
  console.log(`  1T: Monit=${mon1T.status}(${mon1T.pct}%) | DRS=${esp1T.status}(${esp1T.pct}%) | CM=${oferta1T.status} | SADT=${sadt1T.status}`);

  // ── Processa 2T ──
  const quadro2TPath = findQuadro2T(k);
  let procs2T = [];
  if (quadro2TPath) {
    try { procs2T = parseQuadro(k, quadro2TPath); }
    catch(e) { console.log(`  2T monitoramento: AVISO ${e.message}`); }
  }
  procedimentos['2T'][k] = procs2T;
  const mon2T = calcMonitoramentoStatus(procs2T, '1T'); // 2T usa a coluna 1T do arquivo Q2
  // esp_drs 2T: pendente até novos dados de Consultas pactuadas 2T
  const esp2T = procs2T.length > 0 ? calcEspDrsStatus(esps1T) : { status: 'pendente', pct: null, obs: 'Aguardando dados 2T' };
  console.log(`  2T: Monit=${mon2T.status} ${quadro2TPath?'('+procs2T.length+' procs)':'(sem arquivo)'} | DRS=${esp2T.status}`);

  // ── Monta metas por trimestre ──
  function buildMetas(monStatus, monPct, monObs, espStatus, espPct, espObs, oferta, sadtMeta) {
    const m = {};
    m.monitoramento   = { status: monStatus, valor: monPct, observacao: monObs };
    m.esp_drs         = { status: espStatus, valor: espPct, observacao: espObs };
    m.qualidade_info  = { status: qiStatus, valor: null, observacao: `NSP: ${nsp.observacao} · Mat: ${mat.observacao}` };
    m.humanizacao     = { status: hum.status, valor: hum.valor, observacao: hum.observacao };
    m.cdr             = { status: cdr.status, valor: cdr.valor, observacao: cdr.observacao };
    m.oferta_consulta = { status: oferta.status, valor: oferta.valor, observacao: oferta.observacao };
    m.sadt_linha      = { status: sadtMeta.status, valor: sadtMeta.valor, observacao: sadtMeta.observacao };
    m.avastin         = calcRetinaStatus(k, procs1T);
    return m;
  }

  const metas1T = buildMetas(mon1T.status, mon1T.pct, mon1T.obs, esp1T.status, esp1T.pct, esp1T.obs, oferta1T, sadt1T);
  // Para 2T: usar dados reais de Abril do CONFIGURACAO.env para oferta e SADT
  // Monitoramento 2T: tentar usar real2T do mesmo arquivo 1T (col 19); se vazio, pendente
  const mon2TReal = calcMonitoramentoStatus(procs1T, '2T');
  const mon2TFinal = (mon2TReal.pct !== null && mon2TReal.pct > 0)
    ? { ...mon2TReal, obs: mon2TReal.obs + ' (Abr/2026 — 1 de 3 meses)' }
    : { status: 'pendente', pct: null, obs: 'Quadro de Monitoramento 2T sem dados de Abr ainda' };

  const oferta2T = calcOfertaConsulta2T(k);
  const sadt2T   = calcSadtLinha2T(k);

  const metas2T = buildMetas(
    mon2TFinal.status, mon2TFinal.pct, mon2TFinal.obs,
    esp2T.status, esp2T.pct, esp2T.obs,
    oferta2T,
    sadt2T
  );

  // Salva nos sub-objetos 1T e 2T
  ame['1T'] = { trimestre: '1T/2026', metas: metas1T };
  ame['2T'] = { trimestre: '2T/2026', metas: metas2T };

  // Mantém backward compat: ame.metas e ame.trimestre apontam para 1T
  ame.trimestre = '1T/2026';
  ame.metas = metas1T;
});

// ─── 6. Salva arquivos ─────────────────────────────────────────────────────────
fs.writeFileSync(
  path.join(__dirname, 'metas-trimestrais.json'),
  JSON.stringify(trimJSON, null, 2),
  'utf8'
);
console.log('\n✅ metas-trimestrais.json atualizado');

// Salva procedimentos detalhados (inclui 1T e 2T)
const procData = { geradoEm: new Date().toISOString(), ames: procedimentos['1T'], ames2T: procedimentos['2T'], consultasPactuadas };
fs.writeFileSync(
  path.join(__dirname, 'procedimentos-trim.json'),
  JSON.stringify(procData, null, 2),
  'utf8'
);
console.log('✅ procedimentos-trim.json gerado');

// Gera versão JS para deploy (sem fetch)
const jsContent = `/* AUTO-GERADO por gerar-dados-trim.js em ${new Date().toLocaleDateString('pt-BR')} */
window.PROCEDIMENTOS_TRIM = ${JSON.stringify(procData)};
`;
fs.writeFileSync(path.join(__dirname, 'procedimentos-trim.js'), jsContent, 'utf8');

// Atualiza metas-trimestrais.js do deploy
const mtJs = `/* AUTO-GERADO por gerar-dados-trim.js em ${new Date().toLocaleDateString('pt-BR')} */
window.METAS_TRIM = ${JSON.stringify(trimJSON)};
`;
fs.writeFileSync(path.join(__dirname, 'metas-trimestrais.js'), mtJs, 'utf8');
console.log('✅ metas-trimestrais.js atualizado (deploy)');
console.log('✅ procedimentos-trim.js gerado (deploy)');

// Resumo
const IC = { sim:'✅', parcial:'⚠️', nao:'❌', na:'–', pendente:'●' };
const NOMES_AME = { cp:'Campinas', frc:'Franca', cb:'Casa Branca', avj:'Vale Jurumirim', rp:'Ribeirão Preto', scl:'São Carlos' };

['1T','2T'].forEach(tr => {
  const label = tr === '1T' ? '1T/2026 (Jan-Mar)' : '2T/2026 (Abr-Jun)';
  console.log(`\n══════════════════════════════════════════════════════════════════`);
  console.log(`RESUMO – ${label}`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  KEYS.forEach(k => {
    const m = trimJSON.ames[k]?.[tr]?.metas || {};
    const g = id => IC[m[id]?.status] || '?';
    console.log(`${NOMES_AME[k].padEnd(18)} │ CM:${g('oferta_consulta')} Mon:${g('monitoramento')}(${m.monitoramento?.valor||'–'}%) DRS:${g('esp_drs')}(${m.esp_drs?.valor||'–'}%) SADT:${g('sadt_linha')} QI:${g('qualidade_info')} Hum:${g('humanizacao')} CDR:${g('cdr')}`);
  });
  const totalSim = KEYS.reduce((acc, k) => {
    const m = trimJSON.ames[k]?.[tr]?.metas || {};
    return acc + Object.values(m).filter(v => v.status === 'sim').length;
  }, 0);
  console.log(`TOTAL ${tr}: ${totalSim}/${KEYS.length*8} métricas ✅`);
});
