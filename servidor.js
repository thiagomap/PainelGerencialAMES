'use strict';
const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { exec } = require('child_process');
const XLSX   = require('xlsx');

// Pasta de rede Regulação & Planejamento
const REDE_BASE = '\\\\172.16.10.2\\regulacao_e_planejamento\\ROSANA_PASTA REDE';

// â”€â”€ LÃª .env simples (key=value, ignora #) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function loadEnv(file) {
  try {
    fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    });
  } catch {}
}
loadEnv(path.join(__dirname, '.env'));
loadEnv(path.join(__dirname, 'CONFIGURACAO.env'));

const PORT = parseInt(process.env.PORTA_SERVIDOR || '3000');
const ROOT = __dirname;

// ── Versão do Cronoata (detecta mudanças para sync entre usuários) ──
let _cronVersion = Date.now();

// ── Watcher: detecta mudança no CONFIGURACAO.env e regera tudo ──
let _regeandoStatus = 'idle'; // 'idle' | 'running'
let _regeandoTimer  = null;
let _ultimaAtualizacao = null;

function regerarDados(motivo) {
  if (_regeandoTimer) clearTimeout(_regeandoTimer);
  _regeandoTimer = setTimeout(() => {
    if (_regeandoStatus === 'running') return;
    _regeandoStatus = 'running';
    console.log(`\n[${new Date().toLocaleTimeString('pt-BR')}] 🔄 CONFIGURACAO.env alterado — regerando dados (${motivo})…`);
    exec('node gerar-dados.js', { cwd: ROOT, timeout: 60000 }, (err1, out1) => {
      if (err1) console.error('  ❌ gerar-dados.js:', err1.message);
      else console.log('  ✅ gerar-dados.js concluído');
      exec('node gerar-dados-trim.js', { cwd: ROOT, timeout: 60000 }, (err2, out2) => {
        if (err2) console.error('  ❌ gerar-dados-trim.js:', err2.message);
        else console.log('  ✅ gerar-dados-trim.js concluído');
        _regeandoStatus = 'idle';
        _ultimaAtualizacao = new Date();
        console.log(`[${_ultimaAtualizacao.toLocaleTimeString('pt-BR')}] ✅ Dashboard atualizado!\n`);
      });
    });
  }, 2000); // espera 2s após última edição (debounce)
}

// Observa CONFIGURACAO.env
const configFile = path.join(ROOT, 'CONFIGURACAO.env');
if (fs.existsSync(configFile)) {
  fs.watch(configFile, { persistent: false }, (evt) => {
    if (evt === 'change') regerarDados('CONFIGURACAO.env editado');
  });
  console.log('👁  Monitorando CONFIGURACAO.env — edite e salve para atualizar o dashboard!');
}

// Detecta IPs de rede automaticamente (exclui loopback e link-local)
function getNetworkIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254')) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf':  'application/pdf',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// â”€â”€ Handler genÃ©rico de POST para salvar JSON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function handleSaveJSON(req, res, filename, label) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      JSON.parse(body);
      const filePath = path.join(ROOT, filename);
      fs.writeFile(filePath, body, err => {
        if (err) {
          res.writeHead(500, {'Content-Type': 'application/json; charset=utf-8', ...cors});
          res.end(JSON.stringify({ok: false, erro: err.message}));
        } else {
          console.log(`${new Date().toLocaleTimeString('pt-BR')} ✅ ${label} salvo`);
          if (filename === 'cronoata-data.json') _cronVersion = Date.now();
          res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', ...cors});
          res.end(JSON.stringify({ok: true, version: _cronVersion}));
        }
      });
    } catch(e) {
      res.writeHead(400, {'Content-Type': 'application/json; charset=utf-8', ...cors});
      res.end(JSON.stringify({ok: false, erro: 'JSON invÃ¡lido'}));
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors); res.end(); return;
  }

  // â”€â”€ POST endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (req.method === 'POST') {
    if (req.url === '/api/salvar-metas-trim') {
      return handleSaveJSON(req, res, 'metas-trimestrais.json', 'Metas trimestrais');
    }
    if (req.url === '/api/salvar-cronoata') {
      return handleSaveJSON(req, res, 'cronoata-data.json', 'Cronoata');
    }
    if (req.url === '/api/analisar-plano') {
      return handleAnalisarPlano(req, res);
    }
    if (req.url === '/api/salvar-plano-resultado') {
      return handleSalvarPlanoResultado(req, res);
    }
    if (req.url === '/api/configuracao') {
      return handleSalvarConfiguracao(req, res);
    }
    if (req.url === '/api/cnes-buscar') {
      return handleBuscarCNES(req, res);
    }
    if (req.url === '/api/kpih-buscar') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        let params = {};
        try { params = JSON.parse(body); } catch {}
        const competencia = params.competencia || '3/2026';
        console.log(`${new Date().toLocaleTimeString('pt-BR')} 📡 Buscando dados KPIH — competência ${competencia}…`);
        const resultado = await kpihBuscarRelatorios(competencia);
        res.writeHead(resultado.erro ? 400 : 200, {'Content-Type':'application/json;charset=utf-8',...cors});
        res.end(JSON.stringify(resultado));
      });
      return;
    }
    if (req.url === '/api/kpih-auto-fill') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        let dados = {};
        try { dados = JSON.parse(body); } catch {}
        // Se não enviou dados no body, lê do cache
        if (!dados.relatorios) {
          try { dados = JSON.parse(fs.readFileSync(path.join(ROOT, 'kpih-dados.json'), 'utf8')); } catch {}
        }
        const r = await kpihAutoFill(dados);
        res.writeHead(r.ok ? 200 : 400, {'Content-Type':'application/json;charset=utf-8',...cors});
        res.end(JSON.stringify(r));
      });
      return;
    }
    if (req.url === '/api/gestao-login') {
      return handleGestaoLogin(req, res);
    }
    if (req.url === '/api/gestao-scrape') {
      return handleGestaoScrape(req, res);
    }
    if (req.url === '/api/siresp-amb-buscar') {
      return handleSirespAmbBuscar(req, res);
    }
    res.writeHead(404, {'Content-Type': 'application/json; charset=utf-8', ...cors});
    res.end(JSON.stringify({ok: false, erro: 'Endpoint não encontrado'}));
    return;
  }

  // â”€â”€ GET endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (req.method === 'GET' && req.url.startsWith('/api/planos-resultado')) {
    return handleCarregarPlanosResultado(req, res);
  }
  if (req.method === 'GET' && req.url.split('?')[0] === '/relatorios') {
    return servirRelatorios(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/api/configuracao')) {
    return handleLerConfiguracao(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/api/cronoata-version')) {
    res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
    return res.end(JSON.stringify({ version: _cronVersion }));
  }
  if (req.method === 'GET' && req.url.startsWith('/api/status-atualizacao')) {
    res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
    return res.end(JSON.stringify({
      status: _regeandoStatus,
      ultimaAtualizacao: _ultimaAtualizacao ? _ultimaAtualizacao.toLocaleString('pt-BR') : null,
    }));
  }
  if (req.method === 'GET' && req.url.startsWith('/api/cnes-dados')) {
    const cnesFile = path.join(ROOT, 'cnes-dados.json');
    try {
      const data = JSON.parse(fs.readFileSync(cnesFile, 'utf8'));
      res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
      return res.end(JSON.stringify(data));
    } catch {
      res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
      return res.end(JSON.stringify({ ok: false, msg: 'Nenhum dado CNES disponível — clique em Consultar CNES' }));
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/api/gestao-captcha')) {
    return handleGestaoCaptcha(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/api/siresp-test-units')) {
    return handleSirespTestUnits(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/api/siresp-amb-unidades')) {
    return handleSirespAmbUnidades(req, res);
  }
  // ── Pasta de Rede: Regulação & Planejamento ─────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/rede/')) {
    return handleRedeApi(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/api/cma-screenshot')) {
    return handleCmaScreenshot(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/api/cma-dados')) {
    return handleCmaDados(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/api/numb3rs')) {
    return handleNumb3rs(req, res);
  }
  if (req.method === 'GET' && req.url.startsWith('/api/dados-hosp-dre')) {
    const f = path.join(ROOT, 'dados-hosp-dre.json');
    res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
    try { return res.end(fs.readFileSync(f, 'utf8')); }
    catch { return res.end(JSON.stringify({ ok: false, msg: 'Execute: node extrair-dados-hosp.js' })); }
  }
  if (req.method === 'GET' && req.url.startsWith('/api/siresp-amb-dados')) {
    const f = path.join(ROOT, 'siresp-amb-dados.json');
    res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
    try {
      return res.end(fs.readFileSync(f, 'utf8'));
    } catch {
      return res.end(JSON.stringify({ ok: false, msg: 'Sem dados SIRESP AME — clique em Buscar' }));
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/api/gestao-dados')) {
    const f = path.join(ROOT, 'gestao-dados.json');
    try {
      res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
      return res.end(fs.readFileSync(f, 'utf8'));
    } catch {
      res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
      return res.end(JSON.stringify({ ok: false, msg: 'Sem dados salvos — faça login e busque os dados' }));
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/api/kpih-dados')) {
    const kpihFile = path.join(ROOT, 'kpih-dados.json');
    try {
      const data = JSON.parse(fs.readFileSync(kpihFile, 'utf8'));
      res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
      return res.end(JSON.stringify(data));
    } catch {
      res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
      return res.end(JSON.stringify({ ok: false, msg: 'Sem dados KPIH em cache — clique em Buscar KPIH' }));
    }
  }
  // â”€â”€ GET estÃ¡tico â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let url = req.url.split('?')[0];
  if (url === '/') url = '/portal-unificado.html';  // portal Ãºnico integrado

  const filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Proibido'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (res.headersSent) return; // guarda contra double-send (API async + static race)
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/html; charset=utf-8', ...cors});
      res.end(`<h2>404 - Nao encontrado: ${url}</h2>`);
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const cc = (ext === '.html' || ext === '.js') ? 'no-store, no-cache, must-revalidate' : 'no-cache';
    res.writeHead(200, {'Content-Type': mime, 'Cache-Control': cc, ...cors});
    res.end(data);
  });

  console.log(`${new Date().toLocaleTimeString('pt-BR')} ${req.method} ${req.url}`);
});

// â”€â”€ Chama Anthropic API (Claude) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€ Ollama streaming (envia chunks em tempo real) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function callOllamaStream(prompt, onChunk, onDone) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  const body = JSON.stringify({ model, messages: [{ role:'user', content: prompt }], stream: true });
  const opts = {
    hostname: 'localhost', port: 11434,
    path: '/api/chat', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };
  let full = '', finished = false;
  const finish = (err) => { if (!finished) { finished = true; onDone(err, full); } };

  const req = http.request(opts, r => {
    r.on('data', chunk => {
      const lines = chunk.toString('utf8').split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const piece = obj.message?.content || '';
          if (piece) { full += piece; onChunk(piece); }
          if (obj.done) finish(null);
        } catch(e) {}
      }
    });
    r.on('end', () => finish(null));
    r.on('error', e => finish(e));
  });
  req.on('error', e => finish(new Error('Ollama nÃ£o estÃ¡ rodando â€” ' + e.message)));
  req.write(body); req.end();
}

// â”€â”€ Ollama sem streaming (fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function callOllama(prompt, cb) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  const body = JSON.stringify({ model, messages: [{ role:'user', content: prompt }], stream: false });
  const opts = {
    hostname: 'localhost', port: 11434,
    path: '/api/chat', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };
  const req = http.request(opts, r => {
    const chunks = [];
    r.on('data', c => chunks.push(c));
    r.on('end', () => {
      try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8')).message?.content || ''); }
      catch(e) { cb(new Error('Ollama: resposta invÃ¡lida')); }
    });
  });
  req.on('error', e => cb(new Error('Ollama nÃ£o estÃ¡ rodando â€” ' + e.message)));
  req.write(body); req.end();
}

// â”€â”€ Escolhe IA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function callAI(prompt, cb) {
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(`${new Date().toLocaleTimeString('pt-BR')} ðŸ¤– Claude (Anthropic)`);
    callClaude(prompt, cb);
  } else {
    const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
    console.log(`${new Date().toLocaleTimeString('pt-BR')} ðŸ¤– Ollama (${model}) local`);
    callOllama(prompt, cb);
  }
}

function callClaude(prompt, cb) {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) return cb(new Error('ANTHROPIC_API_KEY nÃ£o configurada no .env'));

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const opts = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
  };

  const req = https.request(opts, r => {
    let data = '';
    r.on('data', c => data += c);
    r.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) return cb(new Error(parsed.error.message));
        cb(null, parsed.content?.[0]?.text || '');
      } catch(e) { cb(e); }
    });
  });
  req.on('error', cb);
  req.write(body);
  req.end();
}

// â”€â”€ Extrai texto de PDF (base64) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function extractPdfText(base64) {
  try {
    const pdfParse = require('pdf-parse');
    const buf = Buffer.from(base64, 'base64');
    const result = await pdfParse(buf);
    return result.text.substring(0, 12000);
  } catch(e) { return null; }
}

// â”€â”€ Extrai texto de DOCX (base64) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function extractDocxText(base64) {
  try {
    const mammoth = require('mammoth');
    const buf = Buffer.from(base64, 'base64');
    const result = await mammoth.extractRawText({ buffer: buf });
    return (result.value || '').substring(0, 12000);
  } catch(e) { return null; }
}

// â”€â”€ Extrai texto de DOC antigo (base64) â€” extraÃ§Ã£o simples â”€â”€â”€â”€
function extractDocText(base64) {
  try {
    const buf = Buffer.from(base64, 'base64');
    let text = '';
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      if (b >= 32 && b < 127) text += String.fromCharCode(b);
      else if (b === 10 || b === 13) text += '\n';
    }
    return text.replace(/[^ -~\n]{2,}/g, ' ').replace(/\s{4,}/g, '\n').trim().substring(0, 12000) || null;
  } catch(e) { return null; }
}

// â”€â”€ Detecta tipo e extrai texto â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function extractFileText(base64, fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  if (ext === 'pdf')  return await extractPdfText(base64);
  if (ext === 'docx') return await extractDocxText(base64);
  if (ext === 'doc')  return extractDocText(base64);
  return null;
}

// â”€â”€ Planos de AÃ§Ã£o: salva resultado no servidor (compartilhado) â”€
const PLANOS_FILE = path.join(ROOT, 'planos-acao-resultados.json');

function lerPlanos() {
  try { return JSON.parse(fs.readFileSync(PLANOS_FILE, 'utf8')); }
  catch(e) { return {}; }
}

function handleSalvarPlanoResultado(req, res) {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    try {
      const { ame, nomeAme, resultado, fileName, metas } = JSON.parse(body);
      if (!ame || !resultado) throw new Error('Dados incompletos');
      const planos = lerPlanos();
      planos[ame] = { nomeAme, resultado, fileName: fileName||null, metas: metas||[], ts: new Date().toISOString() };
      fs.writeFileSync(PLANOS_FILE, JSON.stringify(planos, null, 2), 'utf8');
      console.log(`${new Date().toLocaleTimeString('pt-BR')} ðŸ’¾ Plano salvo no servidor â€” ${nomeAme}`);
      res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
      res.end(JSON.stringify({ok: true}));
    } catch(e) {
      res.writeHead(400, {'Content-Type':'application/json;charset=utf-8',...cors});
      res.end(JSON.stringify({ok: false, erro: e.message}));
    }
  });
}

function handleCarregarPlanosResultado(req, res) {
  const planos = lerPlanos();
  res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
  res.end(JSON.stringify(planos));
}

// â”€â”€ PÃ¡gina de RelatÃ³rios â€” acessÃ­vel na rede interna â”€â”€â”€â”€â”€â”€â”€â”€â”€
function servirRelatorios(req, res) {
  const planos = lerPlanos();
  const TODOS_AMES = [
    {k:'cp',  nome:'AME Campinas'},
    {k:'frc', nome:'AME Franca'},
    {k:'cb',  nome:'AME Casa Branca'},
    {k:'avj', nome:'AME Vale do Jurumirim'},
    {k:'rp',  nome:'AME RibeirÃ£o Preto'},
    {k:'scl', nome:'AME SÃ£o Carlos'},
  ];
  const RISCO_COR = { ALTO:'#c0392b', MEDIO:'#e65100', BAIXO:'#00875a' };

  const cards = TODOS_AMES.map(({k, nome}) => {
    if (!planos[k]) {
      // AME sem relatÃ³rio â€” mostra card de "aguardando"
      return `<div class="card" id="ame-${k}">
        <div class="card-hdr" style="background:#f9f9f9;border-left:5px solid #ccc">
          <div>
            <div class="ame-nome">${nome}</div>
            <div class="veredicto" style="color:#aaa">â— Aguardando anÃ¡lise</div>
          </div>
          <div style="text-align:right;font-size:11px;color:#aaa">
            Nenhum plano de aÃ§Ã£o analisado ainda
          </div>
        </div>
        <div class="card-body">
          <div style="text-align:center;padding:20px;color:#bbb">
            <div style="font-size:32px;margin-bottom:8px">ðŸ“‹</div>
            <p style="font-size:12px">Acesse o <a href="/" style="color:#1565c0">Portal Integrado</a> â†’ Planos de AÃ§Ã£o â†’ ${nome} â†’ ðŸ¤– Analisar com IA</p>
          </div>
        </div>
      </div>`;
    }
    const dadosAme = planos[k];
      const res = dadosAme.resultado || {};
      const ok = res.aprovado;
      const cor = ok === true ? '#00875a' : ok === false ? '#c0392b' : '#888';
      const bg  = ok === true ? '#e8f5e9' : ok === false ? '#fff0f0' : '#f5f5f5';
      const icn = ok === true ? 'âœ…' : ok === false ? 'âŒ' : 'ðŸ“‹';
      const veredicto = ok === true ? 'APROVADO' : ok === false ? 'INSUFICIENTE' : 'SEM VEREDICTO';
      const dt  = dadosAme.ts ? new Date(dadosAme.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'â€“';

      const metasRows = (res.metas_detalhadas || []).map(m => {
        const mc = m.cumpre ? '#00875a' : '#c0392b';
        const rc = RISCO_COR[m.risco] || '#888';
        return `<tr>
          <td style="padding:6px 10px;font-weight:600;color:${mc}">${m.cumpre?'âœ…':'âŒ'} ${m.meta||''}</td>
          <td style="padding:6px 10px;text-align:center">
            <span style="background:${rc}20;color:${rc};padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700">${m.risco||''}</span>
          </td>
          <td style="padding:6px 10px;font-size:11px;color:#444;line-height:1.5">${m.analise_detalhada||''}</td>
        </tr>`;
      }).join('');

      const lacunas = (res.lacunas_criticas || []).map(l =>
        `<li style="margin-bottom:5px"><strong style="color:${l.urgencia==='ALTA'?'#c0392b':'#e65100'}">[${l.urgencia||''}]</strong> ${l.lacuna||''} ${l.meta_afetada?`<em style="color:#888">â†’ ${l.meta_afetada}</em>`:''}</li>`
      ).join('');

      const prioridades = (res.plano_de_acao_sugerido || []).map(p =>
        `<li style="margin-bottom:6px"><strong style="color:#3949ab">${p.prioridade}.</strong> ${p.acao||''}
          ${p.prazo?`<span style="color:#1565c0;font-size:11px"> Â· ${p.prazo}</span>`:''}
          ${p.impacto_estimado?`<br><span style="font-size:11px;color:#666;padding-left:16px">${p.impacto_estimado}</span>`:''}</li>`
      ).join('');

      return `<div class="card" id="ame-${k}">
        <div class="card-hdr" style="background:${cor}10;border-left:5px solid ${cor}">
          <div>
            <div class="ame-nome">${dadosAme.nomeAme || k}</div>
            <div class="veredicto" style="color:${cor}">${icn} ${veredicto}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;color:#888">ðŸ• ${dt}</div>
            ${dadosAme.fileName?`<div style="font-size:10px;color:#aaa;margin-top:2px">ðŸ“Ž ${dadosAme.fileName}</div>`:''}
            <button onclick="window.print()" style="margin-top:8px;font-size:11px;padding:5px 14px;border-radius:7px;border:1.5px solid #1565c0;background:#fff;color:#1565c0;cursor:pointer;font-weight:700">ðŸ–¨ï¸ Imprimir</button>
          </div>
        </div>
        <div class="card-body">
          ${res.resumo_executivo||res.resumo ? `<div class="resumo">${res.resumo_executivo||res.resumo}</div>` : ''}
          ${metasRows ? `<h3>ðŸ” AnÃ¡lise por Meta</h3>
            <table><thead><tr><th>Meta</th><th style="width:90px">Risco</th><th>AnÃ¡lise detalhada</th></tr></thead>
            <tbody>${metasRows}</tbody></table>` : ''}
          ${lacunas ? `<h3 style="color:#c0392b">ðŸš¨ Lacunas CrÃ­ticas</h3><ul style="padding-left:18px">${lacunas}</ul>` : ''}
          ${prioridades ? `<h3 style="color:#3949ab">ðŸ“Œ Plano de AÃ§Ã£o Sugerido</h3><ul style="padding-left:18px">${prioridades}</ul>` : ''}
          ${res.conclusao ? `<div class="conclusao"><strong>ðŸ’¡ ConclusÃ£o:</strong> ${res.conclusao}</div>` : ''}
          ${(res.pontos_fortes||[]).length ? `<div class="pontos"><strong>ðŸ’ª Pontos fortes:</strong> ${res.pontos_fortes.join(' Â· ')}</div>` : ''}
        </div>
      </div>`;
    }).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RelatÃ³rios de AnÃ¡lise IA â€” Grupo Santa Casa de Franca</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;background:#eef1f6;color:#222;font-size:13px}
.top{background:linear-gradient(135deg,#002855,#004fa3);color:#fff;padding:16px 28px;display:flex;justify-content:space-between;align-items:center}
.top h1{font-size:18px;font-weight:800}
.top p{font-size:11px;opacity:.75;margin-top:3px}
.top-right{text-align:right;font-size:11px;opacity:.75}
.container{max-width:1100px;margin:24px auto;padding:0 20px}
.summary{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}
.sum-card{background:#fff;border-radius:10px;padding:14px 20px;flex:1;min-width:150px;box-shadow:0 1px 6px rgba(0,0,0,.08);border-left:4px solid #ccc;text-align:center}
.sum-val{font-size:26px;font-weight:900;color:#002855}
.sum-lbl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.4px;margin-top:2px}
.card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);margin-bottom:24px;overflow:hidden;page-break-inside:avoid}
.card-hdr{padding:16px 20px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.ame-nome{font-size:17px;font-weight:800;color:#002855;margin-bottom:4px}
.veredicto{font-size:14px;font-weight:700}
.card-body{padding:16px 20px 20px}
.resumo{background:#f0f4ff;border-radius:8px;padding:12px 14px;font-size:12px;line-height:1.7;color:#333;margin-bottom:14px}
h3{font-size:12px;color:#002855;margin:14px 0 8px;border-bottom:1px solid #e0e6f0;padding-bottom:4px;text-transform:uppercase;letter-spacing:.4px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px}
th{background:#002855;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
td{padding:6px 10px;border-bottom:1px solid #f0f0f0;vertical-align:top}
tr:nth-child(even) td{background:#fafafa}
ul{font-size:12px;line-height:1.7;color:#333;margin-bottom:10px}
.conclusao{background:#e8f0fe;border-left:4px solid #1565c0;border-radius:6px;padding:10px 14px;font-size:12px;line-height:1.6;margin-top:10px}
.pontos{font-size:11px;color:#2e7d32;background:#e8f5e9;border-radius:6px;padding:8px 12px;margin-top:8px}
.nav{background:#fff;border-radius:10px;padding:10px 16px;margin-bottom:20px;box-shadow:0 1px 6px rgba(0,0,0,.06);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.nav span{font-size:11px;color:#888}
.nav a{font-size:11px;padding:4px 12px;border-radius:12px;border:1.5px solid #ccc;text-decoration:none;color:#555;font-weight:600}
.nav a:hover{background:#002855;color:#fff;border-color:#002855}
.atualizar{font-size:11px;padding:5px 14px;border-radius:8px;border:1.5px solid #00875a;background:#fff;color:#00875a;cursor:pointer;font-weight:700;margin-left:auto}
footer{text-align:center;font-size:10px;color:#aaa;padding:20px;border-top:1px solid #dde3ef;margin-top:12px}
@media print{body{background:#fff}.top{-webkit-print-color-adjust:exact;print-color-adjust:exact}.card{box-shadow:none;border:1px solid #ddd;margin-bottom:16px}}
</style>
</head>
<body>
<div class="top">
  <div><h1>ðŸ“‹ RelatÃ³rios de AnÃ¡lise â€” Planos de AÃ§Ã£o</h1>
    <p>Grupo Santa Casa de Franca Â· Contrato SES/SP 2026 Â· AnÃ¡lise por IA</p></div>
  <div class="top-right">
    <div>Atualizado: ${new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
    <div style="margin-top:4px"><a href="/" style="color:#69f0ae;font-weight:700;text-decoration:none">â† Voltar ao Portal</a></div>
  </div>
</div>
<div class="container">
  <div class="summary">
    <div class="sum-card" style="border-left-color:#002855"><div class="sum-val">${Object.keys(planos).length}</div><div class="sum-lbl">Analisados</div></div>
    <div class="sum-card" style="border-left-color:#888"><div class="sum-val">${6 - Object.keys(planos).length}</div><div class="sum-lbl">Aguardando</div></div>
    <div class="sum-card" style="border-left-color:#00875a"><div class="sum-val">${Object.keys(planos).filter(k=>planos[k].resultado?.aprovado===true).length}</div><div class="sum-lbl">Aprovados</div></div>
    <div class="sum-card" style="border-left-color:#c0392b"><div class="sum-val">${Object.keys(planos).filter(k=>planos[k].resultado?.aprovado===false).length}</div><div class="sum-lbl">Insuficientes</div></div>
    <div class="sum-card" style="border-left-color:#e65100"><div class="sum-val">${Object.keys(planos).reduce((s,k)=>(planos[k].resultado?.lacunas_criticas||[]).filter(l=>l.urgencia==='ALTA').length+s,0)}</div><div class="sum-lbl">Lacunas Urgentes</div></div>
  </div>
  <div class="nav">
    <span>Ir para:</span>
    ${TODOS_AMES.map(({k,nome})=>`<a href="#ame-${k}" style="${planos[k]?'':'color:#aaa;border-color:#ddd'}">${nome.replace('AME ','')}</a>`).join('')}
    <button class="atualizar" onclick="location.reload()">ðŸ”„ Atualizar</button>
  </div>
  ${cards}
</div>
<footer>Sistema Gerencial Â· Grupo Santa Casa de Franca Â· <a href="/">Portal Integrado</a></footer>
</body></html>`;

  res.writeHead(200, {'Content-Type':'text/html;charset=utf-8', ...cors});
  res.end(html);
}

// ── Configuracao: le e salva CONFIGURACAO.env via web ─────────
const CONFIG_FILE = path.join(ROOT, 'CONFIGURACAO.env');
const MESES_CFG = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const AMES_CONFIG = ['CAMPINAS','CASA_BRANCA','FRANCA','JURUMIRIM','RIBEIRAO','SAO_CARLOS'];

function _parseFin(val) {
  // "receita|despesa" ou "receita|despesa|resultado"
  if (!val) return { rec: 0, desp: 0, res: 0 };
  const p = val.split('|');
  const rec  = parseFloat(p[0]) || 0;
  const desp = parseFloat(p[1]) || 0;
  const res  = p[2] !== undefined ? (parseFloat(p[2]) || 0) : (rec - desp);
  return { rec, desp, res };
}

function lerConfiguracaoEnv() {
  const result = { periodo: {}, ames: {}, hospital: {}, cancer: {}, coracao: {}, cnes: {}, leitos: {}, kpih: {} };
  let lines = [];
  try { lines = fs.readFileSync(CONFIG_FILE, 'utf8').split('\n'); } catch(e) { return result; }
  const get = key => { const l = lines.find(l => l.startsWith(key+'=')); return l ? l.slice(key.length+1).trim() : ''; };
  result.periodo = { PERIODO_ATUAL: get('PERIODO_ATUAL'), MESES_REALIZADOS: get('MESES_REALIZADOS'), ANO: get('ANO'), MODELO_IA: get('MODELO_IA')||'llama3.2:3b', ANTHROPIC_API_KEY: get('ANTHROPIC_API_KEY') };
  const MESES_SEM = ['JAN','FEV','MAR','ABR','MAI','JUN'];
  AMES_CONFIG.forEach(ame => {
    const mutiraoAtivo = get(`${ame}_MUTIRAO`) === '1';
    const mutiraoVol = {};
    if (mutiraoAtivo) {
      MESES_SEM.forEach(m => { mutiraoVol[m] = get(`${ame}_MUTIRAO_${m}`); });
    }
    result.ames[ame] = { financeiro: {}, producao: { CONS:{}, NMED:{}, CMA:{}, CMA_MENOR:{}, SADT:{} }, mutirao: mutiraoAtivo, mutiraoVol };
    MESES_CFG.forEach(m => { result.ames[ame].financeiro[m] = get(`${ame}_${m}`); });
    ['CONS','NMED','CMA','CMA_MENOR','SADT'].forEach(met => {
      MESES_CFG.forEach(m => { result.ames[ame].producao[met][m] = get(`${ame}_${met}_${m}`); });
    });
  });
  // Hospital Santa Casa: mantém formato raw string (compatibilidade com form de config)
  // Cancer / Coração: retorna objeto {rec, desp, res} como números
  MESES_CFG.forEach(m => {
    result.hospital[m] = get(`HOSPITAL_${m}`); // raw string "rec|desp|res"
    result.cancer[m]   = _parseFin(get(`CANCER_${m}`));
    result.coracao[m]  = _parseFin(get(`CORACAO_${m}`));
  });
  // CNES
  result.cnes = {
    santaCasa: get('CNES_SANTA_CASA'),
    cancer:    get('CNES_CANCER'),
    coracao:   get('CNES_CORACAO'),
  };
  // Credenciais KPIH (retornadas apenas internamente — não expostas ao frontend)
  result.kpihLogin = get('KPIH_LOGIN');
  result.kpihSenha = get('KPIH_SENHA');
  // Credenciais Gestão SES / SIRESP (interno)
  result.gestaoLogin  = get('GESTAO_LOGIN')  || 'vilmar';
  result.gestaoSenha  = get('GESTAO_SENHA')  || '';
  result.gestaoLogin2 = get('SIRESP_LOGIN')  || 'ddgsilva';
  result.gestaoSenha2 = get('SIRESP_SENHA')  || '260718';
  // Credenciais SIRESP Ambulatorial (projeto siresp-login)
  result.sirespAmbUser       = get('SIRESP_AMB_USER')        || 'antalves';
  result.sirespAmbSenha      = get('SIRESP_AMB_SENHA')       || '1cff35078ebef77951a8abdeabe9c188';
  result.sirespAmbUser2      = get('SIRESP_AMB_USER2')       || '';
  result.sirespAmbSenha2     = get('SIRESP_AMB_SENHA2')      || '';
  result.sirespAmbCode       = get('SIRESP_AMB_CODE')        || '9042';
  result.sirespAmbLabel      = get('SIRESP_AMB_LABEL')       || 'AME FRANCA';
  result.sirespAmbExtraUnits = get('SIRESP_AMB_EXTRA_UNITS') || '';
  // Leitos
  const leitos = (get('HOSPITAL_LEITOS') || '200|62|75').split('|');
  result.leitos = { sc: parseInt(leitos[0])||200, cancer: parseInt(leitos[1])||62, coracao: parseInt(leitos[2])||75 };
  // KPIH (Resultado por Unidade)
  const KPIH_UNITS = ['SC','CO','CA','SADT','HEMO','REAB'];
  KPIH_UNITS.forEach(u => {
    result.kpih[u] = {};
    MESES_CFG.forEach(m => {
      const v = get(`KPIH_${u}_${m}`);
      if (v && v.includes('|')) {
        const p = v.split('|');
        const rec  = parseFloat(p[0]) || 0;
        const custo = parseFloat(p[1]) || 0;
        result.kpih[u][m] = { rec, custo, res: rec - custo };
      } else {
        result.kpih[u][m] = null;
      }
    });
  });
  return result;
}

function handleLerConfiguracao(req, res) {
  res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
  res.end(JSON.stringify(lerConfiguracaoEnv()));
}

function handleSalvarConfiguracao(req, res) {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    try {
      const cfg = JSON.parse(body);
      let lines = [];
      try { lines = fs.readFileSync(CONFIG_FILE, 'utf8').split('\n'); } catch(e) {}
      const setVal = (key, val) => {
        const idx = lines.findIndex(l => l.startsWith(key+'='));
        const nova = `${key}=${val||''}`;
        if (idx >= 0) lines[idx] = nova; else lines.push(nova);
      };
      const p = cfg.periodo||{};
      ['PERIODO_ATUAL','MESES_REALIZADOS','ANO','MODELO_IA','ANTHROPIC_API_KEY'].forEach(k => { if(p[k]!==undefined) setVal(k, p[k]); });
      AMES_CONFIG.forEach(ame => {
        const a = cfg.ames?.[ame]; if(!a) return;
        MESES_CFG.forEach(m => setVal(`${ame}_${m}`, a.financeiro?.[m]||''));
        ['CONS','NMED','CMA','CMA_MENOR','SADT'].forEach(met => {
          MESES_CFG.forEach(m => setVal(`${ame}_${met}_${m}`, a.producao?.[met]?.[m]||''));
        });
        if(a.mutirao !== undefined) setVal(`${ame}_MUTIRAO`, a.mutirao ? '1' : '0');
        if(a.mutiraoVol) {
          ['JAN','FEV','MAR','ABR','MAI','JUN'].forEach(m => {
            setVal(`${ame}_MUTIRAO_${m}`, a.mutiraoVol[m] || '|0');
          });
        }
      });
      if(cfg.hospital) MESES_CFG.forEach(m => setVal(`HOSPITAL_${m}`, cfg.hospital[m]||''));
      if(cfg.cancer)  MESES_CFG.forEach(m => {
        const v = cfg.cancer[m];
        if (typeof v === 'object' && v) setVal(`CANCER_${m}`, `${v.rec||''}|${v.desp||''}`);
        else if (typeof v === 'string') setVal(`CANCER_${m}`, v||'|');
      });
      if(cfg.coracao) MESES_CFG.forEach(m => {
        const v = cfg.coracao[m];
        if (typeof v === 'object' && v) setVal(`CORACAO_${m}`, `${v.rec||''}|${v.desp||''}`);
        else if (typeof v === 'string') setVal(`CORACAO_${m}`, v||'|');
      });
      if(cfg.cnes) {
        if(cfg.cnes.santaCasa !== undefined) setVal('CNES_SANTA_CASA', cfg.cnes.santaCasa||'');
        if(cfg.cnes.cancer    !== undefined) setVal('CNES_CANCER',     cfg.cnes.cancer||'');
        if(cfg.cnes.coracao   !== undefined) setVal('CNES_CORACAO',    cfg.cnes.coracao||'');
      }
      if(cfg.leitos) setVal('HOSPITAL_LEITOS', `${cfg.leitos.sc||200}|${cfg.leitos.cancer||62}|${cfg.leitos.coracao||75}`);
      if(cfg.kpih) {
        const KPIH_UNITS = ['SC','CO','CA','SADT','HEMO','REAB'];
        KPIH_UNITS.forEach(u => {
          if(cfg.kpih[u]) MESES_CFG.forEach(m => {
            const v = cfg.kpih[u][m];
            setVal(`KPIH_${u}_${m}`, v ? `${v.rec||''}|${v.custo||''}` : '|');
          });
        });
      }
      // Credenciais sistemas externos (aceita também do frontend)
      if(cfg.gestaoLogin  !== undefined) setVal('GESTAO_LOGIN',  cfg.gestaoLogin);
      if(cfg.gestaoSenha  !== undefined) setVal('GESTAO_SENHA',  cfg.gestaoSenha);
      if(cfg.sirespLogin  !== undefined) setVal('SIRESP_LOGIN',  cfg.sirespLogin);
      if(cfg.sirespSenha  !== undefined) setVal('SIRESP_SENHA',  cfg.sirespSenha);
      if(cfg.kpihLoginCfg !== undefined) setVal('KPIH_LOGIN',    cfg.kpihLoginCfg);
      if(cfg.kpihSenhaCfg !== undefined) setVal('KPIH_SENHA',    cfg.kpihSenhaCfg);
      fs.writeFileSync(CONFIG_FILE, lines.join('\n'), 'utf8');
      console.log(`${new Date().toLocaleTimeString('pt-BR')} Configuracao salva via web`);
      res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
      res.end(JSON.stringify({ok:true, msg:'Configuracao salva! Dashboard regerando...'}));
    } catch(e) {
      res.writeHead(400, {'Content-Type':'application/json;charset=utf-8',...cors});
      res.end(JSON.stringify({ok:false, erro:e.message}));
    }
  });
}

// ── Endpoint: POST /api/analisar-plano ────────────────────────
function handleAnalisarPlano(req, res) {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    let payload;
    try { payload = JSON.parse(body); }
    catch {
      res.writeHead(400, {'Content-Type':'application/json;charset=utf-8',...cors});
      return res.end(JSON.stringify({ok:false,erro:'JSON invÃ¡lido'}));
    }

    const { ame, nomeAme, planText, planBase64, fileName, metas, mesesRealizados } = payload;

    // Extrai texto do arquivo (PDF, DOCX, DOC) se necessÃ¡rio
    let textoPlano = planText || '';
    if (!textoPlano && planBase64) {
      const extracted = await extractFileText(planBase64, fileName);
      if (extracted) textoPlano = extracted;
      else { textoPlano = `[NÃ£o foi possÃ­vel extrair texto do arquivo "${fileName || ''}" â€” cole o texto manualmente]`; }
    }

    if (!textoPlano.trim()) {
      res.writeHead(400, {'Content-Type':'application/json;charset=utf-8',...cors});
      return res.end(JSON.stringify({ok:false,erro:'Plano de aÃ§Ã£o vazio.'}));
    }

    // Monta contexto detalhado das 5 metas (com metas semestrais reais e terminologia META/REAL)
    const mesesReal = mesesRealizados || 4;
    const mesesRest = 6 - mesesReal;
    const metasCtx = (metas||[]).map((m,i) => {
      const pct4m   = m.cont > 0 ? (m.real/m.cont*100).toFixed(1) : '-';
      const metaSem = m.metaSem || Math.round(m.cont * 6 / mesesReal);
      const metaMin = Math.round(metaSem * m.min / 100);
      const falta   = Math.max(0, metaMin - m.real);
      const porMes  = mesesRest > 0 ? Math.ceil(falta / mesesRest) : 0;
      const proj    = Math.round(m.real * 6 / mesesReal);
      const pctProj = metaSem > 0 ? (proj/metaSem*100).toFixed(1) : '-';
      const lineFalta = falta === 0
        ? 'OK - projecao acima do minimo SES'
        : 'ATENCAO - faltam ' + falta.toLocaleString('pt-BR') + ' unidades em ' + mesesRest + ' meses (+' + porMes.toLocaleString('pt-BR') + '/mes)';
      return '  Meta ' + (i+1) + ' - ' + m.nome + '\n' +
        '    * REAL (Realizado ' + mesesReal + ' meses): ' + m.real.toLocaleString('pt-BR') + ' | Contratado ' + mesesReal + 'm: ' + m.cont.toLocaleString('pt-BR') + ' (' + pct4m + '%)\n' +
        '    * META Contratada Semestral (6 meses): ' + metaSem.toLocaleString('pt-BR') + ' | Minimo SES/SP (' + m.min + '%): ' + metaMin.toLocaleString('pt-BR') + '\n' +
        '    * Projecao ao ritmo atual: ' + proj.toLocaleString('pt-BR') + ' (' + pctProj + '%)\n' +
        '    * ' + lineFalta;
    }).join('\n\n');

    const prompt = `VocÃª Ã© um especialista sÃªnior em gestÃ£o de AMEs (AmbulatÃ³rios MÃ©dicos de Especialidades) do contrato SES/SP.

FaÃ§a uma anÃ¡lise DETALHADA e CRITERIOSA do Plano de AÃ§Ã£o submetido para o ${nomeAme}, avaliando se as aÃ§Ãµes propostas sÃ£o suficientes para cumprir cada uma das 5 metas contratuais semestrais atÃ© Junho/2026.

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
SITUAÃ‡ÃƒO ATUAL â€” Jan a Abr/2026 (4 de 6 meses realizados)
Faltam: MAIO e JUNHO/2026
GLOSSARIO - Terminologia usada nos planos de acao SES/SP:
* "META" no documento = META CONTRATADA SES/SP (valor pactuado). Ex: "META 90% -> 33.512" significa meta de 33.512 unidades.
* "REAL" ou "REALIZADO" = quantidade efetivamente executada (REAL = REALIZADO = o que foi feito).
* Se o plano nao informa o periodo explicitamente, identifique pelo tamanho do numero:
  - Proximo do valor mensal (~1/6 do semestral) -> periodo mensal
  - ~metade do semestral -> trimestral
  - ~igual ao semestral -> semestral
* Compare sempre com a META CONTRATADA SEMESTRAL abaixo para avaliar suficiencia ate Junho/2026.

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
${metasCtx}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
PLANO DE AÃ‡ÃƒO SUBMETIDO${fileName ? ` (${fileName})` : ''}
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
${textoPlano}

RESPONDA USANDO EXATAMENTE ESTES MARCADORES (uma linha cada):

[VEREDICTO] APROVADO ou INSUFICIENTE

[RESUMO] Escreva 3 a 4 frases avaliando o plano de forma geral.

[META] Consultas MÃ©dicas | CUMPRE ou NAO_CUMPRE | ALTO/MEDIO/BAIXO | Descreva detalhadamente o que o plano prevÃª para esta meta e se Ã© suficiente. | AÃ§Ãµes que ainda faltam ou "Nenhuma"

[META] NÃ£o-MÃ©dica + Proc. | CUMPRE ou NAO_CUMPRE | ALTO/MEDIO/BAIXO | AnÃ¡lise detalhada. | AÃ§Ãµes faltantes

[META] CMA Maior (Cirurgia Maior Ambulatorial) | CUMPRE ou NAO_CUMPRE | ALTO/MEDIO/BAIXO | AnÃ¡lise detalhada. | AÃ§Ãµes faltantes

[META] cma menor (Cirurgia Menor Ambulatorial) | CUMPRE ou NAO_CUMPRE | ALTO/MEDIO/BAIXO | AnÃ¡lise detalhada. | AÃ§Ãµes faltantes

[META] SADT Externo | CUMPRE ou NAO_CUMPRE | ALTO/MEDIO/BAIXO | AnÃ¡lise detalhada. | AÃ§Ãµes faltantes

[PONTOS] Liste os pontos fortes do plano separados por ponto-e-vÃ­rgula.

[LACUNA] [ALTA ou MEDIA] Descreva a lacuna em detalhe â†’ meta afetada
(repita [LACUNA] para cada lacuna encontrada)

[PRIORIDADE] 1. AÃ§Ã£o concreta a tomar | meta impactada | prazo sugerido | impacto esperado
(repita [PRIORIDADE] numerando cada uma)

[CONCLUSAO] Escreva um parÃ¡grafo final detalhado com veredicto, riscos e prÃ³ximos passos imediatos que o gestor deve tomar.

Seja DETALHISTA. Escreva anÃ¡lises completas em cada [META]. NÃ£o use JSON, nÃ£o use markdown.`;

    console.log(`${new Date().toLocaleTimeString('pt-BR')} ðŸ¤– Analisando â€” ${nomeAme}`);

    // CabeÃ§alhos SSE para streaming em tempo real
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    function enviar(obj) { res.write('data: ' + JSON.stringify(obj) + '\n\n'); }

    // Usa Ollama com streaming real ou Claude sem streaming
    // Parser de texto estruturado com marcadores [TAG]
    function parsearTexto(texto) {
      const get = (tag, all) => {
        const re = new RegExp(`\\[${tag}\\]([^\\[]+)`, 'gi');
        const matches = [...texto.matchAll(re)].map(m => m[1].trim());
        return all ? matches : (matches[0] || '');
      };

      const veredicto = get('VEREDICTO').toUpperCase();
      const aprovado  = veredicto.includes('APROVADO') && !veredicto.includes('INSUFICIENTE');

      const metas_detalhadas = get('META', true).map(linha => {
        const [nome, status, risco, analise, faltam] = linha.split('|').map(s => s.trim());
        return {
          meta: nome || '',
          cumpre: (status||'').toUpperCase().includes('CUMPRE') && !(status||'').toUpperCase().includes('NAO'),
          risco: (risco||'MEDIO').toUpperCase().replace('MÃ‰DIO','MEDIO'),
          analise_detalhada: analise || '',
          acoes_faltantes: (faltam && !faltam.toLowerCase().includes('nenhum')) ? [faltam] : [],
          acoes_do_plano: [],
          situacao: '',
        };
      });

      const lacunas_criticas = get('LACUNA', true).map(l => {
        const urgMatch = l.match(/\[(ALTA|MEDIA|MÃ‰DIA)\]/i);
        const urgencia = urgMatch ? urgMatch[1].toUpperCase().replace('MÃ‰DIA','MEDIA') : 'MEDIA';
        const metaMatch = l.match(/â†’\s*(.+)$/);
        return {
          lacuna: l.replace(/\[.+?\]/,'').replace(/â†’.+$/,'').trim(),
          meta_afetada: metaMatch ? metaMatch[1].trim() : '',
          urgencia,
        };
      });

      const plano_de_acao_sugerido = get('PRIORIDADE', true).map((l, i) => {
        const partes = l.split('|').map(s => s.trim());
        const acao = (partes[0]||'').replace(/^\d+\.\s*/,'');
        return { prioridade: i+1, acao, meta: partes[1]||'', prazo: partes[2]||'', impacto_estimado: partes[3]||'' };
      });

      return {
        aprovado,
        resumo_executivo: get('RESUMO'),
        metas_detalhadas,
        pontos_fortes: get('PONTOS').split(';').map(s=>s.trim()).filter(Boolean),
        lacunas_criticas,
        plano_de_acao_sugerido,
        conclusao: get('CONCLUSAO'),
        _textoOriginal: texto,
      };
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      callOllamaStream(prompt,
        chunk => enviar({ t: 'chunk', v: chunk }),
        (err, full) => {
          if (err) { enviar({ t: 'erro', v: err.message }); res.end(); return; }
          enviar({ t: 'fim', r: parsearTexto(full) });
          res.end();
        }
      );
    } else {
      let tick = 0;
      const timer = setInterval(() => { tick++; enviar({ t: 'tick', v: tick }); }, 800);
      callClaude(prompt, (err, text) => {
        clearInterval(timer);
        if (err) { enviar({ t: 'erro', v: err.message }); res.end(); return; }
        enviar({ t: 'fim', r: parsearTexto(text) });
        res.end();
      });
    }
  });
}

// ── CNES: consulta DATASUS e retorna dados do estabelecimento ──
async function buscarCNES(code) {
  if (!code || code.length < 5) return null;
  return new Promise(resolve => {
    const options = {
      hostname: 'cnes.datasus.gov.br',
      path: `/services/estabelecimentos/${code}`,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'PortalGerencialSantaCasa/1.0' },
      timeout: 8000,
    };
    const req = https.request(options, resHttp => {
      let data = '';
      resHttp.on('data', d => data += d);
      resHttp.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ _raw: data.substring(0, 200), erro: 'Resposta não é JSON válido' }); }
      });
    });
    req.on('error', e => resolve({ erro: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ erro: 'Timeout ao consultar DATASUS' }); });
    req.end();
  });
}

async function handleBuscarCNES(req, res) {
  const cfg = lerConfiguracaoEnv();
  const codes = {
    santaCasa: cfg.cnes.santaCasa,
    cancer:    cfg.cnes.cancer,
    coracao:   cfg.cnes.coracao,
  };
  const resultado = { ts: new Date().toISOString(), hospitais: {} };
  for (const [key, code] of Object.entries(codes)) {
    if (code && code.length >= 5) {
      console.log(`${new Date().toLocaleTimeString('pt-BR')} 🏥 Consultando CNES ${code} (${key})…`);
      resultado.hospitais[key] = await buscarCNES(code);
    } else {
      resultado.hospitais[key] = { erro: 'Código CNES não configurado — preencha em Configurações → CNES' };
    }
  }
  const cnesFile = path.join(ROOT, 'cnes-dados.json');
  fs.writeFileSync(cnesFile, JSON.stringify(resultado, null, 2), 'utf8');
  res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
  res.end(JSON.stringify(resultado));
}

// ══════════════════════════════════════════════════════════════════
// INTEGRAÇÃO KPIH — www.kpih.com.br
// Credenciais lidas de KPIH_LOGIN e KPIH_SENHA no CONFIGURACAO.env
// ══════════════════════════════════════════════════════════════════
let _kpihSession = { cookie: null, expira: 0 };

// IDs de competência KPIH (mês/ano → id numérico)
const KPIH_COMP = {
  '1/2025':29370,'2/2025':29763,'3/2025':30163,'4/2025':30513,'5/2025':30853,
  '6/2025':31207,'7/2025':31588,'8/2025':31985,'9/2025':32400,'10/2025':32777,
  '11/2025':33134,'12/2025':33614,
  '1/2026':33958,'2/2026':34281,'3/2026':34760,'4/2026':35068,'5/2026':35635
};

function _kpihReq(method, path, postData, extraHeaders) {
  return new Promise((resolve) => {
    const hdrs = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
      'Accept': 'text/html,application/xhtml+xml,*/*',
      'Accept-Encoding': 'identity',
      ...(extraHeaders || {}),
    };
    if (_kpihSession.cookie) hdrs['Cookie'] = _kpihSession.cookie;
    if (postData) {
      hdrs['Content-Type'] = 'application/x-www-form-urlencoded';
      hdrs['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = https.request({ hostname: 'www.kpih.com.br', port: 443, method, path, headers: hdrs, timeout: 20000 }, (res) => {
      const sc = res.headers['set-cookie'];
      if (sc) {
        const js = Array.isArray(sc) ? sc.find(c => c.includes('JSESSIONID')) : (sc.includes('JSESSIONID') ? sc : null);
        if (js) { _kpihSession.cookie = js.split(';')[0]; _kpihSession.expira = Date.now() + 25 * 60 * 1000; }
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        // KPIH envia CSV em Windows-1252 (ISO-8859-1) — decode como latin1 para preservar acentos
        const ct = (res.headers['content-type'] || '').toLowerCase();
        const encoding = ct.includes('csv') || path.includes('/CSV') ? 'latin1' : 'utf8';
        resolve({ status: res.statusCode, headers: res.headers, body: buf.toString(encoding) });
      });
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    if (postData) req.write(postData);
    req.end();
  });
}

async function kpihLogin() {
  const cfg = lerConfiguracaoEnv();
  const login = cfg.kpihLogin || process.env.KPIH_LOGIN || '';
  const senha = cfg.kpihSenha || process.env.KPIH_SENHA || '';
  if (!login || !senha) return false;
  _kpihSession.cookie = null;
  const loginData = `username=${encodeURIComponent(login)}&password=${encodeURIComponent(senha)}&idioma=PORTUGUES`;
  const r1 = await _kpihReq('POST', '/acesso', loginData);
  if (r1.status !== 302 || !(r1.headers.location || '').includes('selecionarUnidade')) {
    console.log(`${new Date().toLocaleTimeString('pt-BR')} ❌ KPIH login falhou`);
    return false;
  }
  const unidadeData = `unidade=118&funcionalidade=acesso/paginaInicial`;
  await _kpihReq('POST', '/selecionarUnidade', unidadeData);
  console.log(`${new Date().toLocaleTimeString('pt-BR')} ✅ KPIH login OK (Santa Casa #118)`);
  return true;
}

async function kpihEnsureAuth() {
  if (_kpihSession.cookie && Date.now() < _kpihSession.expira) return true;
  return kpihLogin();
}

function _parseCSV(csv) {
  // Remove BOM UTF-8 se presente
  const clean = csv.replace(/^﻿/, '');
  return clean.split('\n')
    .map(row => row.split(';').map(c => c.replace(/[\r"]/g, '').trim()))
    .filter(r => r.some(c => c.length > 0));
}

async function kpihBuscarRelatorios(competencia) {
  if (!await kpihEnsureAuth()) return { erro: 'Falha no login KPIH — verifique KPIH_LOGIN e KPIH_SENHA' };
  const compId = KPIH_COMP[competencia];
  if (!compId) return { erro: `Competência ${competencia} não encontrada` };

  // Mudar competência da sessão
  await _kpihReq('GET', `/competenciaDaSessao/definir/${compId}`);

  const formPeriodo = `competenciaInicial=${compId}&competenciaFinal=${compId}&orientacao=RETRATO`;
  const formSingular = `competencia=${compId}&orientacao=RETRATO`;
  const hdrsRef = (page) => ({ Referer: `https://www.kpih.com.br/${page}` });

  const resultado = { competencia, geradoEm: new Date().toISOString(), relatorios: {}, status: {} };

  // 1. Ranking SES (custos por centro de custo)
  const r1 = await _kpihReq('POST', '/relatoriosSES/rankingSES/CSV', formPeriodo, hdrsRef('relatoriosSES/rankingSES'));
  resultado.status.rankingSES = r1.status;
  if (r1.status === 200 && r1.body && r1.body.length > 10) {
    resultado.relatorios.rankingSES = _parseCSV(r1.body);
  }

  // 2. Eficiência produtiva SES — usa campo "competencia" (singular)
  const r2 = await _kpihReq('POST', '/relatoriosSES/eficienciaProdutiva/CSV', formSingular, hdrsRef('relatoriosSES/eficienciaProdutiva'));
  resultado.status.eficienciaProdutiva = r2.status;
  if (r2.status === 200 && r2.body && r2.body.length > 10) {
    resultado.relatorios.eficienciaProdutiva = _parseCSV(r2.body);
  }

  // 3. Custo por especialidade SES
  const r3 = await _kpihReq('POST', '/relatoriosSES/custoPorEspecialidade/CSV', formPeriodo, hdrsRef('relatoriosSES/custoPorEspecialidade'));
  resultado.status.custoPorEspecialidade = r3.status;
  if (r3.status === 200 && r3.body && r3.body.length > 10) {
    resultado.relatorios.custoPorEspecialidade = _parseCSV(r3.body);
  }

  // 4. DRE Gerencial — Demonstrativo de Resultados
  const formDRE = `competenciaInicial=${compId}&competenciaFinal=${compId}&orientacao=PAISAGEM&tipoRelatorioDre=DRE_GERAL`;
  const r4 = await _kpihReq('POST', '/relatoriosGerenciais/demonstrativoDeResultados/CSV', formDRE, hdrsRef('relatoriosGerenciais/demonstrativoDeResultados'));
  resultado.status.dre = r4.status;
  if (r4.status === 200 && r4.body && r4.body.length > 10) {
    resultado.relatorios.dre = _parseCSV(r4.body);
  }

  const nRel = Object.keys(resultado.relatorios).length;
  console.log(`${new Date().toLocaleTimeString('pt-BR')} 📊 KPIH: ${nRel}/4 relatórios baixados para ${competencia} | Status: ${JSON.stringify(resultado.status)}`);
  const kpihFile = path.join(ROOT, 'kpih-dados.json');
  fs.writeFileSync(kpihFile, JSON.stringify(resultado, null, 2), 'utf8');
  return resultado;
}

// ── Auto-fill KPIH: extrai totais do rankingSES/DRE e preenche CONFIGURACAO.env ──
async function kpihAutoFill(dados) {
  const MESES = ['','JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  let mesAbrev = 'MAR';
  if (dados.competencia) {
    const m = parseInt(dados.competencia.split('/')[0]);
    if (m >= 1 && m <= 12) mesAbrev = MESES[m];
  }

  const campos = {};

  // Função auxiliar: parse de valor monetário brasileiro → número
  function parseBR(v) {
    if (!v) return 0;
    const s = v.replace(/[^\d,.]/g, '').replace(/\./g,'').replace(',','.');
    return parseFloat(s) || 0;
  }

  // ── Tenta parsear DRE por unidade de negócio (melhor fonte) ──
  const dreRows = (dados.relatorios && dados.relatorios.dre) || [];
  if (dreRows.length > 3) {
    // Mapas de nome de unidade no DRE → chave env
    const UNIT_MAP = [
      { keys: ['SANTA CASA','S.CASA','S CASA'], code: 'SC' },
      { keys: ['CORA'], code: 'CO' },
      { keys: ['CANCER','CÂNCER','ONCO'], code: 'CA' },
      { keys: ['SADT','AUXILIAR','APOIO'], code: 'SADT' },
      { keys: ['HEMODI'], code: 'HEMO' },
      { keys: ['REAB'], code: 'REAB' },
    ];
    // Estrutura DRE: linhas com "Receita", "Custo" por coluna de unidade
    // Tenta extrair colunas de unidade a partir do cabeçalho
    const hdRow = dreRows.find(r => UNIT_MAP.some(u => u.keys.some(k => (r[0]||'').toUpperCase().includes(k))));
    if (!hdRow) {
      // Fallback: busca linhas "Receita Bruta" e "Custo Total" com valores por unidade
      // (formato depende do relatório — registramos para diagnóstico)
      console.log(`${new Date().toLocaleTimeString('pt-BR')} ⚠️ KPIH auto-fill: DRE disponível mas estrutura não reconhecida (${dreRows.length} linhas)`);
    }
  }

  // ── Fallback: rankingSES — agrega custo por hospital via nome do centro ──
  const rankRows = (dados.relatorios && dados.relatorios.rankingSES) || [];
  if (rankRows.length > 3) {
    const CENTRO_MAP = [
      { keys: ['SANTA CASA','MATERNIDADE','OBST','UTIN','UTI ADULTO','PRONTO ATEND','LACTARIO','BERÇARIO','BERCAR','ALOJAMENTO CONJUNTO','BANCO DE LEITE'], code: 'SC' },
      { keys: ['CORAC','HEMODIN'], code: 'CO' },
      { keys: ['QUIMIO','RADIOT','ONCOLO','CANCER','CÂNCER'], code: 'CA' },
      { keys: ['LABORAT','IMAGEM','RX','TOMOG','RESSONA','ULTRAS','ECG','ECO','SADT'], code: 'SADT' },
      { keys: ['HEMODI'], code: 'HEMO' },
      { keys: ['REAB','FISIO'], code: 'REAB' },
    ];

    const acumCusto = {};
    CENTRO_MAP.forEach(m => { acumCusto[m.code] = 0; });

    let totalGeral = 0;
    for (const row of rankRows) {
      if (row.length < 2) continue;
      const nome = (row[0] || '').toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
      const valStr = row[1] || '';
      const val = parseBR(valStr);
      if (!nome || val === 0) continue;
      if (nome.includes('TOTAL') || nome.includes('SUB-TOTAL') || nome.includes('OUTROS CENTROS')) {
        if (nome === 'TOTAL') totalGeral = val;
        continue;
      }
      let matched = false;
      for (const m of CENTRO_MAP) {
        if (m.keys.some(k => nome.includes(k))) {
          acumCusto[m.code] += val;
          matched = true;
          break;
        }
      }
    }

    // Grava custo por unidade (sem receita — usa pipe como separador)
    for (const [code, custo] of Object.entries(acumCusto)) {
      if (custo > 0) {
        const envKey = `KPIH_${code}_${mesAbrev}`;
        // Preserva receita existente: lê env, mantém valor antes do pipe
        let lines2 = [];
        try { lines2 = fs.readFileSync(CONFIG_FILE, 'utf8').split('\n'); } catch {}
        const existing = lines2.find(l => l.startsWith(`${envKey}=`));
        const existingRec = existing ? (existing.split('=')[1]||'').split('|')[0] : '';
        campos[envKey] = `${existingRec}|${Math.round(custo)}`;
      }
    }
    if (totalGeral > 0) campos[`KPIH_TOTAL_${mesAbrev}`] = String(Math.round(totalGeral));
  }

  if (!Object.keys(campos).length) return { ok: false, erro: 'Nenhum dado extraível dos relatórios KPIH disponíveis. Execute "Buscar KPIH Online" primeiro.' };

  // Atualizar CONFIGURACAO.env
  let lines = [];
  try { lines = fs.readFileSync(CONFIG_FILE, 'utf8').split('\n'); } catch(e) { return { ok: false, erro: e.message }; }
  for (const [key, val] of Object.entries(campos)) {
    const idx = lines.findIndex(l => l.startsWith(`${key}=`));
    if (idx >= 0) {
      lines[idx] = `${key}=${val}`;
    } else {
      lines.push(`${key}=${val}`);
    }
  }
  fs.writeFileSync(CONFIG_FILE, lines.join('\n'), 'utf8');
  console.log(`${new Date().toLocaleTimeString('pt-BR')} ⚡ KPIH auto-fill: ${Object.keys(campos).length} campos atualizados`);
  return { ok: true, campos, competencia: dados.competencia };
}

// ── Proxy Gestão SES / SIRESP ────────────────────────────────────────────────
let _gestaoSession = { cookie: null, expira: 0, sessionCookie: null };

function _gestaoReq(method, urlPath, postData, extraHeaders) {
  return new Promise((resolve) => {
    const hdrs = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124',
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
      'Accept-Encoding': 'identity',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      ...(extraHeaders || {}),
    };
    if (_gestaoSession.cookie) hdrs['Cookie'] = _gestaoSession.cookie;
    if (postData) {
      hdrs['Content-Type'] = 'application/x-www-form-urlencoded';
      hdrs['Content-Length'] = Buffer.byteLength(postData);
    }
    const opts = {
      hostname: 'gestao.saude.sp.gov.br', port: 443,
      method, path: urlPath, headers: hdrs, timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      const sc = res.headers['set-cookie'];
      if (sc) {
        const all = Array.isArray(sc) ? sc : [sc];
        const cookieParts = all.map(c => c.split(';')[0]);
        _gestaoSession.cookie = cookieParts.join('; ');
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: Buffer.from('') }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: Buffer.from('timeout') }); });
    if (postData) req.write(postData);
    req.end();
  });
}

async function handleGestaoCaptcha(req, res) {
  // Passo 1: GET index.php para criar a sessão PHP (igual ao browser)
  // O browser faz isso automaticamente antes de mostrar o captcha
  _gestaoSession.cookie = null; // reinicia sessão para garantir cookie novo
  const r0 = await _gestaoReq('GET', '/index.php');
  console.log(`${new Date().toLocaleTimeString('pt-BR')} 🍪 Gestão SES sessão index.php: HTTP ${r0.status} | Cookie: ${(_gestaoSession.cookie||'').substring(0,40)}`);

  // Passo 2: GET captcha.php COM A MESMA SESSÃO → PHP armazena captcha na sessão correta
  const r = await _gestaoReq('GET', '/captcha.php');
  if (r.status !== 200) {
    res.writeHead(502, {'Content-Type':'application/json;charset=utf-8',...cors});
    return res.end(JSON.stringify({ ok: false, erro: `captcha.php retornou HTTP ${r.status}` }));
  }
  const b64 = r.body.toString('base64');
  console.log(`${new Date().toLocaleTimeString('pt-BR')} 🖼️ Gestão SES captcha carregado | Cookie: ${(_gestaoSession.cookie||'').substring(0,40)}`);
  res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
  res.end(JSON.stringify({ ok: true, imagem: `data:image/jpeg;base64,${b64}`, cookie: _gestaoSession.cookie }));
}

async function handleGestaoLogin(req, res) {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', async () => {
    let params = {};
    try { params = JSON.parse(body); } catch {}
    const userNum = params.user === 2 ? 2 : 1;
    const cfg = lerConfiguracaoEnv();
    const login = userNum === 2 ? (cfg.gestaoLogin2 || 'ddgsilva') : (cfg.gestaoLogin || 'vmedeiros');
    const senha = userNum === 2 ? (cfg.gestaoSenha2 || '260718')  : (cfg.gestaoSenha || '1118901');
    const captcha = params.captcha || ''; // mantém case original — CAPTCHA é case-sensitive
    // Restaura o cookie da sessão que foi estabelecida no captcha (não pode ter mudado!)
    if (params.cookie) _gestaoSession.cookie = params.cookie;
    // Remove o field entra=Entrar que o browser envia mas pode não ser necessário
    // NÃO enviamos g-recaptcha-response — o onClick do reCAPTCHA v3 do site tem callback VAZIO

    console.log(`${new Date().toLocaleTimeString('pt-BR')} 🔑 Gestão SES tentativa: ${login} | captcha="${captcha}" | cookie=${(_gestaoSession.cookie||'').substring(0,30)}…`);

    // Inclui "entra=Entrar" (valor do botão submit que o browser envia)
    const postData = `LOGIN=${encodeURIComponent(login)}&SENHA=${encodeURIComponent(senha)}&captcha=${encodeURIComponent(captcha)}&entra=Entrar`;
    const r = await _gestaoReq('POST', '/index.php', postData, {
      Referer: 'https://gestao.saude.sp.gov.br/',
      Origin:  'https://gestao.saude.sp.gov.br',
    });

    const location = r.headers.location || '';
    const html = r.body.toString('latin1');

    console.log(`${new Date().toLocaleTimeString('pt-BR')} 📡 Gestão SES resposta: HTTP ${r.status} | Location: ${location || '(nenhum)'} | HTML length: ${html.length}`);

    // Sucesso: 302 redirect para qualquer página que não seja o login/index
    const redirectOk = r.status === 302 && location && !location.includes('index.php') && !location.includes('logout');
    // Sucesso alternativo: 200 com conteúdo logado (tem "sair" ou "logout" mas não tem form de login)
    const htmlLower = html.toLowerCase();
    const temFormLogin = htmlLower.includes('name="captcha"') || htmlLower.includes('name="login"') || htmlLower.includes('id="captcha"');
    const temAreaLogada = htmlLower.includes('sair') || htmlLower.includes('logout') || htmlLower.includes('principal') || htmlLower.includes('bem-vindo');
    const loginOk200 = r.status === 200 && temAreaLogada && !temFormLogin;

    if (redirectOk || loginOk200) {
      _gestaoSession.expira = Date.now() + 30 * 60 * 1000;
      console.log(`${new Date().toLocaleTimeString('pt-BR')} ✅ Gestão SES login OK (${login}) via ${redirectOk ? 'redirect' : 'HTTP 200'}`);
      res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
      return res.end(JSON.stringify({ ok: true, usuario: login }));
    }

    // Extrai mensagem de erro — o site usa alert('...') para mostrar erros
    const alertMatch = html.match(/alert\s*\(\s*['"]([^'"]{5,120})['"]\s*\)/i);
    let msg;
    if (alertMatch) {
      msg = alertMatch[1].trim(); // ex: "Nome de usuário ou senha inválido."
    } else {
      const errMatch = html.match(/(?:class="[^"]*(?:erro|error|alert)[^"]*"[^>]*>)\s*([^<]{5,80})/i);
      if (errMatch) {
        msg = errMatch[1].trim();
      } else if (temFormLogin) {
        msg = 'CAPTCHA incorreto ou expirado — carregue um novo CAPTCHA';
      } else {
        msg = `Resposta inesperada HTTP ${r.status}`;
      }
    }
    // Classifica o tipo de erro para o frontend agir corretamente
    const ehErroSenha = /senha|usu[aá]rio|inv[aá]lid/i.test(msg);
    const ehErroCaptcha = /captcha|c[oó]digo|seguran/i.test(msg);

    console.log(`${new Date().toLocaleTimeString('pt-BR')} ❌ Gestão SES login falhou: ${msg} (erroSenha=${ehErroSenha})`);
    console.log(`${new Date().toLocaleTimeString('pt-BR')} 🔍 HTML snippet: ${html.substring(0, 300).replace(/\s+/g,' ')}`);
    res.writeHead(401, {'Content-Type':'application/json;charset=utf-8',...cors});
    res.end(JSON.stringify({ ok: false, erro: msg, tipoErro: ehErroSenha ? 'senha' : ehErroCaptcha ? 'captcha' : 'outro' }));
  });
}

// ── Parser HTML: extrai tabelas como arrays de linhas/células ────────────────
function _extrairTabelas(html) {
  const tabelas = [];
  // Remove scripts, styles e comentários
  const limpo = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(limpo)) !== null) {
    const rows = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tm[1])) !== null) {
      const cells = [];
      const cellRe = /<t[dh][^>]*(?:colspan="(\d+)")?[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cm;
      while ((cm = cellRe.exec(rm[1])) !== null) {
        const span  = parseInt(cm[1] || '1') || 1;
        const txt   = cm[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g,  ' ')
          .replace(/&amp;/g,   '&')
          .replace(/&lt;/g,    '<')
          .replace(/&gt;/g,    '>')
          .replace(/&quot;/g,  '"')
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(txt);
        // Repete célula para colspan (mantém alinhamento)
        for (let i = 1; i < span; i++) cells.push('');
      }
      if (cells.some(c => c.length > 0)) rows.push(cells);
    }
    // Filtra tabelas triviais (menos de 2 linhas ou menos de 2 colunas em média)
    if (rows.length >= 2) {
      const avgCols = rows.reduce((s, r) => s + r.length, 0) / rows.length;
      if (avgCols >= 2) tabelas.push(rows);
    }
  }
  return tabelas;
}

function _extrairTitulos(html) {
  const titulos = [];
  const limpo = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const hRe = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  let m;
  while ((m = hRe.exec(limpo)) !== null) {
    const txt = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (txt.length > 3 && txt.length < 200) titulos.push(txt);
  }
  return [...new Set(titulos)];
}

function _limparHtml(html) {
  // Converte latin1/UTF-8 → caracteres PT-BR corretos
  return html
    .replace(/Ã§/g, 'ç').replace(/Ã£/g, 'ã').replace(/Ã©/g, 'é')
    .replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú').replace(/Ã­/g, 'í')
    .replace(/Ã¡/g, 'á').replace(/Ã¢/g, 'â').replace(/Ã /, 'à')
    .replace(/Ã‡/g, 'Ç').replace(/Ã•/g, 'Õ').replace(/Ãµ/g, 'õ')
    .replace(/Ã‰/g, 'É').replace(/Ãˆ/g, 'È').replace(/Ã"/g, 'Ó');
}

// ── Navega pelo portal Gestão SES e extrai dados ──────────────────────────────
async function handleGestaoScrape(req, res) {
  if (!_gestaoSession.cookie) {
    res.writeHead(401, {'Content-Type':'application/json;charset=utf-8',...cors});
    return res.end(JSON.stringify({ ok: false, erro: 'Sessão expirada — faça login novamente', sessaoExpirada: true }));
  }

  console.log(`${new Date().toLocaleTimeString('pt-BR')} 🔍 Gestão SES: iniciando navegação...`);
  const resultado = { ok: true, paginas: {}, timestamp: new Date().toISOString() };

  // Páginas para visitar em sequência
  const paginas = [
    { key: 'principal',   path: '/principal.php',                   titulo: '🏠 Início' },
    { key: 'indicadores', path: '/paginaIndicadoresGerenciados.php', titulo: '📊 Indicadores' },
    { key: 'relatorio',   path: '/paginaRelatorioMensalOSS.php',     titulo: '📋 Relatório Mensal' },
    { key: 'plano',       path: '/paginaPlanoOperativo.php',         titulo: '📅 Plano Operativo' },
    { key: 'avaliacao',   path: '/paginaAvaliacao.php',              titulo: '⭐ Avaliação' },
  ];

  for (const p of paginas) {
    try {
      const r = await _gestaoReq('GET', p.path);
      const rawHtml = r.body.toString('latin1');
      const html    = _limparHtml(rawHtml);

      // Verifica se sessão expirou durante navegação
      const loc = (r.headers.location || '').toLowerCase();
      if ((r.status === 302 && loc.includes('index.php')) ||
          (r.status === 200 && html.includes('name="captcha"'))) {
        _gestaoSession.cookie = null;
        resultado.ok    = false;
        resultado.erro  = 'Sessão expirada durante navegação — faça login novamente';
        resultado.sessaoExpirada = true;
        break;
      }

      const tabelas  = _extrairTabelas(html);
      const titulos  = _extrairTitulos(html);

      resultado.paginas[p.key] = { titulo: p.titulo, status: r.status, tabelas, titulos };
      console.log(`${new Date().toLocaleTimeString('pt-BR')} ✅ ${p.titulo}: HTTP ${r.status} | ${tabelas.length} tabelas | ${titulos.length} títulos`);
    } catch(e) {
      resultado.paginas[p.key] = { titulo: p.titulo, erro: e.message, tabelas: [], titulos: [] };
      console.log(`${new Date().toLocaleTimeString('pt-BR')} ❌ ${p.titulo}: ${e.message}`);
    }
  }

  // Salva em disco para consulta posterior
  try {
    fs.writeFileSync(path.join(ROOT, 'gestao-dados.json'), JSON.stringify(resultado, null, 2), 'utf8');
    console.log(`${new Date().toLocaleTimeString('pt-BR')} 💾 gestao-dados.json salvo`);
  } catch(e) { console.error('Erro ao salvar gestao-dados.json:', e.message); }

  res.writeHead(resultado.ok ? 200 : 401, {'Content-Type':'application/json;charset=utf-8',...cors});
  res.end(JSON.stringify(resultado));
}

// ══════════════════════════════════════════════════════════════════════════════
// SIRESP AMBULATORIAL — porta do projeto siresp-login (NestJS → Node.js puro)
// Baseado em: siresp-login/src/siresp/services/
// ══════════════════════════════════════════════════════════════════════════════

let _sirespAmb = {
  mainCookies: '',   // www.siresp.saude.sp.gov.br
  ambCookies:  '',   // ambulatorial.siresp.saude.sp.gov.br
  authenticated: false,
  lastLogin: 0,
  SESSION_DURATION: 45 * 60 * 1000,
  currentUnit: null, // código da unidade selecionada na última autenticação
  currentUser: null, // usuário que autenticou (para controle de sessão)
  unitList: null,    // lista de AMEs capturada no último login
};

// Mescla Set-Cookie no cookie jar existente (por chave=valor)
function _mergeCookies(existing, setCookieHeader) {
  if (!setCookieHeader) return existing;
  const all = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const map = {};
  if (existing) existing.split('; ').forEach(c => {
    const eq = c.indexOf('='); if (eq > 0) map[c.slice(0, eq).trim()] = c.slice(eq + 1);
  });
  all.forEach(c => {
    const part = c.split(';')[0]; const eq = part.indexOf('=');
    if (eq > 0) map[part.slice(0, eq).trim()] = part.slice(eq + 1);
  });
  return Object.entries(map).map(([k,v]) => `${k}=${v}`).join('; ');
}

function _sirespMainReq(method, urlPath, postData, extraHeaders) {
  return new Promise(resolve => {
    const hdrs = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124',
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
      'Accept-Encoding': 'identity', 'Accept-Language': 'pt-BR,pt;q=0.9',
      ...(extraHeaders || {}),
    };
    if (_sirespAmb.mainCookies) hdrs['Cookie'] = _sirespAmb.mainCookies;
    if (postData) { hdrs['Content-Type'] = 'application/x-www-form-urlencoded'; hdrs['Content-Length'] = Buffer.byteLength(postData); }
    const opts = { hostname: 'www.siresp.saude.sp.gov.br', port: 443, method, path: urlPath, headers: hdrs, timeout: 30000 };
    const req = https.request(opts, res => {
      _sirespAmb.mainCookies = _mergeCookies(_sirespAmb.mainCookies, res.headers['set-cookie']);
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', () => resolve({ status: 0, headers: {}, body: Buffer.from('') }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: Buffer.from('timeout') }); });
    if (postData) req.write(postData); req.end();
  });
}

function _sirespAmbReq(method, urlPath, postData, extraHeaders) {
  return new Promise(resolve => {
    const hdrs = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124',
      'Accept': 'text/html,application/xhtml+xml,application/json,*/*;q=0.9',
      'Accept-Encoding': 'identity', 'Accept-Language': 'pt-BR,pt;q=0.9',
      ...(extraHeaders || {}),
    };
    if (_sirespAmb.ambCookies) hdrs['Cookie'] = _sirespAmb.ambCookies;
    if (postData) { hdrs['Content-Type'] = 'application/x-www-form-urlencoded'; hdrs['Content-Length'] = Buffer.byteLength(postData); }
    const opts = { hostname: 'ambulatorial.siresp.saude.sp.gov.br', port: 443, method, path: urlPath, headers: hdrs, timeout: 30000 };
    const req = https.request(opts, res => {
      _sirespAmb.ambCookies = _mergeCookies(_sirespAmb.ambCookies, res.headers['set-cookie']);
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', () => resolve({ status: 0, headers: {}, body: Buffer.from('') }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: Buffer.from('timeout') }); });
    if (postData) req.write(postData); req.end();
  });
}

// ── Autenticação SIRESP em 5 passos (porta de auth.ts) ────────────────────────
// code/label opcionais: se diferentes da sessão atual, força re-autenticação
// _userOverride / _passOverride: usados internamente para retry com usuário secundário
async function sirespAmbEnsureAuth(code, label, _userOverride, _passOverride) {
  const cfg = lerConfiguracaoEnv();
  if (!code)  code  = cfg.sirespAmbCode  || '9042';
  if (!label) label = cfg.sirespAmbLabel || 'AME FRANCA';

  const user = _userOverride || cfg.sirespAmbUser  || 'antalves';
  const pass = _passOverride || cfg.sirespAmbSenha || '1cff35078ebef77951a8abdeabe9c188';

  // Reutiliza sessão apenas se a unidade e o usuário forem os mesmos
  if (_sirespAmb.authenticated && _sirespAmb.currentUnit === code && _sirespAmb.currentUser === user &&
      Date.now() - _sirespAmb.lastLogin < _sirespAmb.SESSION_DURATION) {
    return true;
  }

  _sirespAmb.mainCookies = '';
  _sirespAmb.ambCookies  = '';
  _sirespAmb.authenticated = false;

  console.log(`${new Date().toLocaleTimeString('pt-BR')} 🔑 SIRESP AMB: iniciando login (${user})...`);

  // Passo 1: GET / → extrai token CSRF #cg_1
  const r1 = await _sirespMainReq('GET', '/');
  const h1 = r1.body.toString('latin1');
  const cg1 = (h1.match(/id=["']cg_1["'][^>]*value=["']([^"']+)["']/i) ||
               h1.match(/value=["']([^"']+)["'][^>]*id=["']cg_1["']/i) || [])[1] || '';
  console.log(`${new Date().toLocaleTimeString('pt-BR')} SIRESP: GET / → HTTP ${r1.status} | cg_1="${cg1.slice(0,30)}"`);

  // Passo 2: POST login principal
  const p2 = `usuario=${encodeURIComponent(user)}&senha=${encodeURIComponent(pass)}&sistema=1&cg_1=${encodeURIComponent(cg1)}&captcha=${encodeURIComponent(cg1)}&form_esqueci=0`;
  const r2 = await _sirespMainReq('POST', '/index.php', p2, { Referer: 'https://www.siresp.saude.sp.gov.br/' });
  const h2 = r2.body.toString('latin1');
  console.log(`${new Date().toLocaleTimeString('pt-BR')} SIRESP: POST /index.php → HTTP ${r2.status}`);
  if (/senha incorreta|usu.rio inv.lido/i.test(h2)) throw new Error('Credenciais inválidas no SIRESP principal');

  // Passo 3: POST login ambulatorial
  const p3 = `LOGIN=${encodeURIComponent(user)}&SENHA=${encodeURIComponent(pass)}&entra=1&security=2111f426c828a070f29eaee5cc885a6e`;
  const r3 = await _sirespAmbReq('POST', '/index.php?&sistema=4', p3, { Referer: 'https://ambulatorial.siresp.saude.sp.gov.br/' });
  console.log(`${new Date().toLocaleTimeString('pt-BR')} SIRESP: POST amb/index.php → HTTP ${r3.status}`);

  // Passo 4a: GET escolher_unidade.php para descobrir unidades disponíveis (cacheia antes de selecionar)
  try {
    const rU = await _sirespAmbReq('GET', '/escolher_unidade.php');
    const hU = rU.body.toString('latin1');
    console.log(`${new Date().toLocaleTimeString('pt-BR')} 🏥 SIRESP escolher_unidade: HTTP ${rU.status} | ${hU.length} chars`);

    const unidades = [];
    // Regex principal: <option value="...">texto</option>
    const optRx = /<option[^>]+value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi;
    let mU;
    while ((mU = optRx.exec(hU)) !== null) {
      const val = mU[1].trim();
      const txt = mU[2].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
      if (val && val !== '0' && val !== '') {
        const parts = val.split('_');
        const uCode  = parts[0];
        const uLabel = parts.slice(1).join('_') || txt;
        unidades.push({ value: val, code: uCode, label: uLabel, display: txt || uLabel });
      }
    }
    // Fallback: regex para values no formato "DDDD_TEXTO"
    if (unidades.length === 0) {
      const rx2 = /value=["'](\d+_[^"']+)["']/gi;
      while ((mU = rx2.exec(hU)) !== null) {
        const val = mU[1].trim();
        const parts = val.split('_');
        unidades.push({ value: val, code: parts[0], label: parts.slice(1).join('_'), display: parts.slice(1).join(' ') });
      }
    }
    console.log(`${new Date().toLocaleTimeString('pt-BR')} 🏥 SIRESP unidades brutas (${unidades.length}): ${unidades.map(u=>u.value).slice(0,10).join(' | ')}`);

    // Filtra apenas AMEs
    let filtradas = unidades.filter(u => u.display.toUpperCase().includes('AME'));
    // Se filtro não pegou nada, aceita todas (pode ser que a conta só tenha AMEs)
    if (filtradas.length === 0 && unidades.length > 0) filtradas = unidades;

    // Adiciona extras do env
    const cfgExtra = lerConfiguracaoEnv().sirespAmbExtraUnits || '';
    if (cfgExtra.trim()) {
      cfgExtra.split(',').forEach(entry => {
        const pipe = entry.trim().indexOf('|');
        if (pipe < 0) return;
        const eCode  = entry.trim().slice(0, pipe).trim();
        const eLabel = entry.trim().slice(pipe + 1).trim();
        if (!eCode || !eLabel) return;
        if (!filtradas.some(u => u.code === eCode))
          filtradas.push({ value: `${eCode}_${eLabel}`, code: eCode, label: eLabel, display: eLabel });
      });
    }
    filtradas.sort((a,b) => a.display.localeCompare(b.display,'pt-BR'));
    if (filtradas.length > 0) _sirespAmb.unitList = filtradas;
    console.log(`${new Date().toLocaleTimeString('pt-BR')} 🏥 SIRESP unidades finais: ${filtradas.map(u=>u.display).join(', ')}`);
  } catch(e) {
    console.log(`${new Date().toLocaleTimeString('pt-BR')} ⚠️ SIRESP: não listou unidades — ${e.message}`);
  }

  // Passo 4b: Selecionar unidade
  const unidade = `${code}_${label.toUpperCase()}`;
  const p4 = `unidade=${encodeURIComponent(unidade)}&escolher=Ok`;
  const r4 = await _sirespAmbReq('POST', '/escolher_unidade.php', p4, { Referer: 'https://ambulatorial.siresp.saude.sp.gov.br/index.php' });
  console.log(`${new Date().toLocaleTimeString('pt-BR')} SIRESP: POST escolher_unidade → HTTP ${r4.status} | "${unidade}"`);

  // Passo 5: GET principal.php → detectar tipo_doc → POST
  const r5 = await _sirespAmbReq('GET', '/principal.php');
  const h5 = r5.body.toString('latin1');
  const tipoDoc = ((h5.match(/id=["']tipo_doc["'][^>]*value=["']([^"']+)["']/i) ||
                    h5.match(/name=["']tipo_doc["'][^>]*value=["']([^"']+)["']/i) ||
                    h5.match(/value=["']([^"']+)["'][^>]*(?:id|name)=["']tipo_doc["']/i)) || [])[1] || '';
  const codeMap = { CF: '602', RF: '575', RI: '646', CI: '097' };
  const digitoDoc = codeMap[tipoDoc.toUpperCase()] || null;
  console.log(`${new Date().toLocaleTimeString('pt-BR')} SIRESP: GET principal.php → HTTP ${r5.status} | tipo_doc="${tipoDoc}" → digito="${digitoDoc}"`);

  // Se tipo_doc está vazio, a unidade não é acessível nesta tentativa
  if (!tipoDoc) {
    _sirespAmb.authenticated = false;
    _sirespAmb.currentUnit   = null;
    _sirespAmb.currentUser   = null;
    // Reset total de cookies para evitar session pollution no próximo login
    _sirespAmb.mainCookies = '';
    _sirespAmb.ambCookies  = '';
    console.log(`${new Date().toLocaleTimeString('pt-BR')} ❌ SIRESP: unidade ${code} (${label}) sem tipo_doc para usuário "${user}"`);

    const user2  = cfg.sirespAmbUser2;
    const pass2  = cfg.sirespAmbSenha2;

    // 1ª tentativa: se não usamos override e USER2 está configurado → tenta USER2
    if (!_userOverride && user2 && user2.trim()) {
      console.log(`${new Date().toLocaleTimeString('pt-BR')} ⏳ SIRESP: aguardando 2s antes de tentar "${user2}"...`);
      await new Promise(r => setTimeout(r, 2000)); // delay evita session pollution
      console.log(`${new Date().toLocaleTimeString('pt-BR')} 🔄 SIRESP: tentando "${user2}" para ${label}...`);
      return sirespAmbEnsureAuth(code, label, user2.trim(), pass2 ? pass2.trim() : '');
    }

    // 2ª tentativa: se JÁ estamos com override (USER2) e falhou — retry automático (até 2x)
    const retryCount = _sirespAmb._retryCount || 0;
    if (_userOverride && retryCount < 2) {
      _sirespAmb._retryCount = retryCount + 1;
      const delaySec = (retryCount + 1) * 3; // 3s, depois 6s
      console.log(`${new Date().toLocaleTimeString('pt-BR')} ♻️  SIRESP: retry ${retryCount+1}/2 para "${user}" em ${delaySec}s...`);
      await new Promise(r => setTimeout(r, delaySec * 1000));
      return sirespAmbEnsureAuth(code, label, _userOverride, _passOverride);
    }
    _sirespAmb._retryCount = 0; // reset contagem para próxima chamada

    throw new Error(`AME "${label}" não disponível — nenhum usuário configurado tem acesso (tentativas esgotadas). Verifique SIRESP_AMB_USER2 no CONFIGURACAO.env.`);
  }
  _sirespAmb._retryCount = 0; // reset se tipo_doc foi encontrado com sucesso

  if (digitoDoc) {
    const p5 = `digito_doc=${digitoDoc}&type_doc=${encodeURIComponent(tipoDoc.toUpperCase())}`;
    const r5b = await _sirespAmbReq('POST',
      '/principal.php?msg_login=&security=2111f426c828a070f29eaee5cc885a6e&frmRetorno=4&entra=1',
      p5, { Referer: 'https://ambulatorial.siresp.saude.sp.gov.br/principal.php' });
    console.log(`${new Date().toLocaleTimeString('pt-BR')} SIRESP: POST principal.php → HTTP ${r5b.status}`);
  }

  _sirespAmb.authenticated = true;
  _sirespAmb.lastLogin = Date.now();
  _sirespAmb.currentUnit = code;
  _sirespAmb.currentUser = user;
  console.log(`${new Date().toLocaleTimeString('pt-BR')} ✅ SIRESP AMB: login concluído! Usuário: ${user} | Unidade: ${code}_${label}`);
  return true;
}

// ── Busca unidades disponíveis na conta SIRESP ────────────────────────────────
async function _sirespBuscarUnidades() {
  const cfg  = lerConfiguracaoEnv();
  const user = cfg.sirespAmbUser  || 'antalves';
  const pass = cfg.sirespAmbSenha || '1cff35078ebef77951a8abdeabe9c188';

  // Reset sessão para forçar autenticação limpa (sem unidade escolhida)
  _sirespAmb.mainCookies = '';
  _sirespAmb.ambCookies  = '';
  _sirespAmb.authenticated = false;
  _sirespAmb.currentUnit = null;
  _sirespAmb.currentUser = null;

  // Passos 1-3 (sem escolher unidade)
  const r1 = await _sirespMainReq('GET', '/');
  const h1 = r1.body.toString('latin1');
  const cg1 = (h1.match(/id=["']cg_1["'][^>]*value=["']([^"']+)["']/i) ||
               h1.match(/value=["']([^"']+)["'][^>]*id=["']cg_1["']/i) || [])[1] || '';

  const p2 = `usuario=${encodeURIComponent(user)}&senha=${encodeURIComponent(pass)}&sistema=1&cg_1=${encodeURIComponent(cg1)}&captcha=${encodeURIComponent(cg1)}&form_esqueci=0`;
  const r2 = await _sirespMainReq('POST', '/index.php', p2, { Referer: 'https://www.siresp.saude.sp.gov.br/' });
  const h2 = r2.body.toString('latin1');
  if (/senha incorreta|usu.rio inv.lido/i.test(h2)) throw new Error('Credenciais inválidas');

  const p3 = `LOGIN=${encodeURIComponent(user)}&SENHA=${encodeURIComponent(pass)}&entra=1&security=2111f426c828a070f29eaee5cc885a6e`;
  await _sirespAmbReq('POST', '/index.php?&sistema=4', p3, { Referer: 'https://ambulatorial.siresp.saude.sp.gov.br/' });

  // GET escolher_unidade.php → parseia opções do <select name="unidade">
  const rU = await _sirespAmbReq('GET', '/escolher_unidade.php');
  const hU = rU.body.toString('latin1');

  const unidades = [];
  const optRx = /<option[^>]*value=["']([^"']+)["'][^>]*>([^<]*)<\/option>/gi;
  let m;
  while ((m = optRx.exec(hU)) !== null) {
    const val = m[1].trim();
    const txt = m[2].replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim();
    if (val && val !== '' && val !== '0') {
      // valor geralmente: "9042_AME FRANCA"
      const parts = val.split('_');
      const code  = parts[0];
      const label = parts.slice(1).join('_') || txt;
      unidades.push({ value: val, code, label, display: txt || label });
    }
  }

  // Fallback: regex alternativo para tags option sem fechamento limpo
  if (unidades.length === 0) {
    const rx2 = /value=["'](\d+_[^"']+)["']/gi;
    while ((m = rx2.exec(hU)) !== null) {
      const val = m[1].trim();
      const parts = val.split('_');
      unidades.push({ value: val, code: parts[0], label: parts.slice(1).join('_'), display: parts.slice(1).join(' ') });
    }
  }

  // Log todas as unidades brutas para debug
  console.log(`${new Date().toLocaleTimeString('pt-BR')} 🏥 SIRESP unidades brutas: ${unidades.map(u=>u.value).join(' | ')}`);

  // Filtra apenas AMEs (exclui Santa Casa e outras unidades hospitalares)
  let filtradas = unidades.filter(u => u.display.toUpperCase().includes('AME'));

  // Adiciona unidades extras definidas no CONFIGURACAO.env
  const cfgExtra = lerConfiguracaoEnv().sirespAmbExtraUnits || '';
  if (cfgExtra.trim()) {
    cfgExtra.split(',').forEach(entry => {
      const pipe = entry.trim().indexOf('|');
      if (pipe < 0) return;
      const code  = entry.trim().slice(0, pipe).trim();
      const label = entry.trim().slice(pipe + 1).trim();
      if (!code || !label) return;
      // Não duplica se já existe
      if (filtradas.some(u => u.code === code)) return;
      filtradas.push({ value: `${code}_${label}`, code, label, display: label });
    });
  }

  // Ordena: primeiro as que têm código real (> 4 dígitos indica código SIRESP real)
  filtradas.sort((a, b) => {
    const aReal = parseInt(a.code) > 1000;
    const bReal = parseInt(b.code) > 1000;
    if (aReal === bReal) return a.display.localeCompare(b.display, 'pt-BR');
    return bReal ? 1 : -1;
  });

  console.log(`${new Date().toLocaleTimeString('pt-BR')} 🏥 SIRESP: ${filtradas.length} unidades (${filtradas.map(u=>u.display).join(', ')})`);
  return filtradas;
}

// ── Handler: GET /api/siresp-test-units (diagnóstico — testa login em todas as unidades) ──
async function handleSirespTestUnits(req, res) {
  const cfg = lerConfiguracaoEnv();

  // Monta lista completa: padrão + extras do env
  const todos = [];
  todos.push({ code: cfg.sirespAmbCode || '9042', label: cfg.sirespAmbLabel || 'AME FRANCA' });
  (cfg.sirespAmbExtraUnits || '').split(',').forEach(e => {
    const pipe = e.trim().indexOf('|');
    if (pipe < 0) return;
    const c = e.trim().slice(0, pipe).trim();
    const l = e.trim().slice(pipe + 1).trim();
    if (c && l && !todos.some(x => x.code === c)) todos.push({ code: c, label: l });
  });

  const resultados = [];
  for (const u of todos) {
    // Força nova autenticação para cada unidade
    _sirespAmb.authenticated = false;
    _sirespAmb.currentUnit   = null;
    _sirespAmb.currentUser   = null;
    try {
      await sirespAmbEnsureAuth(u.code, u.label);
      resultados.push({ code: u.code, label: u.label, ok: true,
        user: _sirespAmb.currentUser, msg: '✅ Login OK' });
    } catch(e) {
      resultados.push({ code: u.code, label: u.label, ok: false,
        user: null, msg: `❌ ${e.message}` });
    }
  }

  const okCount   = resultados.filter(r =>  r.ok).length;
  const failCount = resultados.filter(r => !r.ok).length;
  console.log(`${new Date().toLocaleTimeString('pt-BR')} 🧪 SIRESP test-units: ${okCount} OK / ${failCount} FALHA`);
  resultados.forEach(r => console.log(`  ${r.ok ? '✅' : '❌'} ${r.label} (${r.code}) → ${r.user || 'N/A'}`));

  res.writeHead(200, { 'Content-Type': 'application/json;charset=utf-8', ...cors });
  res.end(JSON.stringify({ ok: true, resultados, resumo: `${okCount}/${todos.length} unidades OK` }));
}

// ── Handler: GET /api/siresp-amb-unidades ────────────────────────────────────
// Retorna lista de unidades. Se não tiver cache, faz auth leve para descobrir.
async function handleSirespAmbUnidades(req, res) {
  try {
    const cfg = lerConfiguracaoEnv();

    // Se unitList está vazio, faz auth com unidade padrão para descobrir todas
    if (!_sirespAmb.unitList || _sirespAmb.unitList.length === 0) {
      try {
        const defCode  = cfg.sirespAmbCode  || '9042';
        const defLabel = cfg.sirespAmbLabel || 'AME FRANCA';
        await sirespAmbEnsureAuth(defCode, defLabel);
        // sirespAmbEnsureAuth já popula _sirespAmb.unitList no passo 4a
      } catch(e) {
        console.log(`${new Date().toLocaleTimeString('pt-BR')} ⚠️ SIRESP unidades: auth falhou — ${e.message}`);
      }
    }

    // Copia lista cacheada (sem modificar o original)
    let unidades = (_sirespAmb.unitList || []).map(u => ({...u}));

    // Adiciona extras do env que ainda não estejam na lista
    const cfgExtra = cfg.sirespAmbExtraUnits || '';
    if (cfgExtra.trim()) {
      cfgExtra.split(',').forEach(entry => {
        const pipe = entry.trim().indexOf('|');
        if (pipe < 0) return;
        const eCode  = entry.trim().slice(0, pipe).trim();
        const eLabel = entry.trim().slice(pipe + 1).trim();
        if (!eCode || !eLabel) return;
        if (!unidades.some(u => u.code === eCode))
          unidades.push({ value: `${eCode}_${eLabel}`, code: eCode, label: eLabel, display: eLabel });
      });
    }

    // Garante que a unidade padrão aparece sempre
    const defCode  = cfg.sirespAmbCode  || '9042';
    const defLabel = cfg.sirespAmbLabel || 'AME FRANCA';
    if (!unidades.some(u => u.code === defCode))
      unidades.unshift({ value: `${defCode}_${defLabel}`, code: defCode, label: defLabel, display: defLabel });

    unidades.sort((a,b) => a.display.localeCompare(b.display,'pt-BR'));

    res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
    res.end(JSON.stringify({ ok: true, unidades }));
  } catch(e) {
    console.log(`${new Date().toLocaleTimeString('pt-BR')} ❌ SIRESP unidades: ${e.message}`);
    res.writeHead(500, {'Content-Type':'application/json;charset=utf-8',...cors});
    res.end(JSON.stringify({ ok: false, erro: e.message }));
  }
}

// ── Coleta relatório de Performance (JSON) — porta de performance-report.collector.ts ──
async function _sirespColetarPerformance(code, mesStr, anoStr) {
  const reportUrl = '/report_rel_performance.php?P=report_rel_performance';
  await _sirespAmbReq('GET', reportUrl, null, { Referer: 'https://ambulatorial.siresp.saude.sp.gov.br/principal.php' });

  const payload = [
    `REF_MES_INI=${mesStr}`, `REF_ANO_INI=${anoStr}`,
    `FLT_TIPO=E`, `FLT_CBO_RRAS=`, `FLT_CBO_DRS=`, `FLT_CBO_SMS=`,
    `FLT_COD_UNIDADE_EXECUTANTE=${code}`, `FLT_MES=${mesStr}`, `FLT_ANO=${anoStr}`,
    `CBO_TIPO_CONS=E`, `btn_exportar=`, `hdd_exportar=`,
    `unidade_codes=${code}`, `action=buscar`, `debug=12345`,
  ].join('&');

  const r = await _sirespAmbReq('POST', '/ajax_report_rel_performance.php', payload, {
    Referer: `https://ambulatorial.siresp.saude.sp.gov.br${reportUrl}`,
  });
  console.log(`${new Date().toLocaleTimeString('pt-BR')} SIRESP: performance HTTP ${r.status} | ${r.body.length} bytes`);

  const toN = v => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).replace(/\./g, '').replace(',', '.'); const n = Number(s);
    return isFinite(n) ? n : null;
  };

  try {
    const parsed = JSON.parse(r.body.toString('utf8'));
    const resources = parsed?.response?.resource ?? [];
    const total     = parsed?.response?.total     ?? null;
    return {
      rows: resources.map(item => ({
        especialidade:    item.ESPEC_GC || '',
        oferta:           toN(item.OFERTA),
        perdaPrimariaPct: toN(item.PERDA_PRIMARIA),
        agendCota:        toN(item.AGENDADO_COTA),
        agendCotaPct:     toN(item.AGE_PC),
        agendExtra:       toN(item.AGENDADO_EXTRA),
        agendExtraPct:    toN(item.AGE_EX_PC),
        agendTotal:       toN(item.AGENDADO_TOTAL),
        realizadoCota:    toN(item.REALIZADO_COTA),
        realizadoExtra:   toN(item.REALIZADO_EXTRA),
        realizadoTotal:   toN(item.REALIZADO_TOTAL),
        faltaCotaPct:     toN(item.FALTA_PACIENTE_COTA),
        faltaExtraPct:    toN(item.FALTA_PACIENTE_EXTRA),
        faltaTotalPct:    toN(item.FALTA_PACIENTE_TOTAL),
        desistCota:       toN(item.DESISTENCIA_DISPENSADO_COTA),
        desistExtra:      toN(item.DESISTENCIA_DISPENSADO_EXTRA),
        desistTotal:      toN(item.DESISTENCIA_DISPENSADO_TOTAL),
      })),
      total: total ? {
        oferta:        toN(total.OFERTA),
        agendTotal:    toN(total.AGENDADO_TOTAL),
        realizadoTotal:toN(total.REALIZADO_TOTAL),
        faltaTotalPct: toN(total.FALTA_PACIENTE_TOTAL),
      } : null,
    };
  } catch(e) {
    console.log(`${new Date().toLocaleTimeString('pt-BR')} ❌ SIRESP parse performance: ${e.message} | body="${r.body.toString('utf8').slice(0,200)}"`);
    return null;
  }
}

// ── Coleta relatório de Consultas (HTML) — porta de consultation-report.collector.ts ──
// tipo: 'CM' = consulta médica, 'CN' = consulta não médica
async function _sirespColetarConsultas(mesStr, anoStr, tipo) {
  if (!tipo) tipo = 'CM';
  const consultUrl = '/report_rel_consulta.php?P=report_rel_consulta';
  await _sirespAmbReq('GET', consultUrl, null, { Referer: 'https://ambulatorial.siresp.saude.sp.gov.br/principal.php' });

  // FLT_CBO_TIPO=C + CBO 22214 (MEDICO EM GERAL) retorna todas as especialidades médicas/não médicas
  const payload = [
    `hdd_acao=S`, `FLT_CBO_TIPO=C`,
    `CBO_ID_ARVORE_T%5B1%5D=22214`, `CBO_ID_ARVORE_T%5B2%5D=`,
    `CBO_ID_ARVORE_T%5B3%5D=`, `CBO_ID_ARVORE_T%5B4%5D=`,
    `FLT_TIPO_MARCA=T`, `FLT_TIPO_CONSULTA=${tipo}`, `FLT_TIPO_ATENDIMENTO=T`,
    `FLT_ID_ESPECIALIDADE=`, `FLT_MES=${mesStr}`, `FLT_ANO=${anoStr}`,
    `FLG_MARCA_REC=S`, `FLG_UNID_ATIVA=S`, `FLT_TIPO_REL=A`, `FLT_AGRUPAR=E`,
    `FLG_VLR_EXAME=S`, `FLG_FILHOS=S`, `btn_acao=Buscar`,
    `FLT_MES_INI=${mesStr}`, `FLT_ANO_INI=${anoStr}`,
    `FLT_MES_FIM=${mesStr}`, `FLT_ANO_FIM=${anoStr}`,
  ].join('&');

  const r = await _sirespAmbReq('POST', consultUrl, payload, {
    Referer: `https://ambulatorial.siresp.saude.sp.gov.br${consultUrl}`,
  });
  const html = r.body.toString('latin1');
  console.log(`${new Date().toLocaleTimeString('pt-BR')} SIRESP: consultas [${tipo}] HTTP ${r.status} | ${html.length} chars`);

  // DEBUG: mostrar classes de TR encontradas (primeiras 8)
  { const dbgRe = /<tr[^>]*class="([^"]+)"/gi; const classes = []; let dm;
    while ((dm = dbgRe.exec(html)) !== null && classes.length < 8) classes.push(dm[1]);
    console.log(`${new Date().toLocaleTimeString('pt-BR')} SIRESP debug [${tipo}]: TR classes = ${classes.join(' | ') || '(nenhuma)'}`);
  }

  // Extrai linhas tr.dados.relatorio — cf. consultation-report.collector.ts (NestJS reference)
  const rows = [];
  const trRe = /<tr[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  while ((trM = trRe.exec(html)) !== null) {
    const cls = trM[1];
    if (!cls.includes('dados') || !cls.includes('relatorio')) continue;
    const rowHtml = trM[2];
    const cells = [];
    const tdRe = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
    let tdM;
    while ((tdM = tdRe.exec(rowHtml)) !== null) {
      const attrs = tdM[1];
      const titleM = attrs.match(/title=["']([^"']+)["']/i);
      const txt = tdM[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      cells.push({ text: txt, title: titleM ? titleM[1] : '' });
    }
    if (cells.length < 21) continue;
    const toN = s => { const n = Number((s||'').replace(/\./g,'').replace(',','.')); return isFinite(n) ? n : null; };
    const toP = s => { const n = Number((s||'').replace(/%/g,'').replace(',','.').trim()); return isFinite(n) ? n : null; };
    const det = cells.length >= 31;
    if (det) {
      // Layout detalhado — 31 colunas
      rows.push({
        codigo:             cells[0].title || '',
        especialidade:      cells[0].text,
        oferta:             toN(cells[1]?.text),
        agendTotal:         toN(cells[2]?.text),
        agendTotalPct:      toP(cells[3]?.text),
        agendCota:          toN(cells[4]?.text),
        agendCotaPct:       toP(cells[5]?.text),
        agendOverflow:      toN(cells[6]?.text),
        agendOverflowPct:   toP(cells[7]?.text),
        agendNaoDistrib:    toN(cells[8]?.text),
        agendNaoDistribPct: toP(cells[9]?.text),
        agendExtra:         toN(cells[10]?.text),
        agendExtraPct:      toP(cells[11]?.text),
        despachadoPct:      toP(cells[12]?.text),
        atendTotal:         toN(cells[13]?.text),
        atendTotalPct:      toP(cells[14]?.text),
        atendPresencial:    toN(cells[15]?.text),
        atendPresencialPct: toP(cells[16]?.text),
        teleconsulta:       toN(cells[17]?.text),
        teleconsultaPct:    toP(cells[18]?.text),
        ausente:            toN(cells[19]?.text),
        ausentePct:         toP(cells[20]?.text),
        desistencia:        toN(cells[21]?.text),
        desistenciaPct:     toP(cells[22]?.text),
        dispensado:         toN(cells[23]?.text),
        dispensadoPct:      toP(cells[24]?.text),
        naoInformado:       toN(cells[25]?.text),
        naoInformadoPct:    toP(cells[26]?.text),
        falta:              toN(cells[27]?.text),
        faltaPct:           toP(cells[28]?.text),
        alta:               toN(cells[29]?.text),
        altaPct:            toP(cells[30]?.text),
      });
    } else {
      // Layout resumido — 21 colunas
      rows.push({
        codigo:             cells[0].title || '',
        especialidade:      cells[0].text,
        oferta:             toN(cells[1]?.text),
        agendTotal:         toN(cells[2]?.text),
        agendTotalPct:      null,
        agendCota:          null,
        agendCotaPct:       null,
        agendExtra:         null,
        agendExtraPct:      null,
        despachadoPct:      null,
        atendTotal:         toN(cells[3]?.text),
        atendTotalPct:      toP(cells[4]?.text),
        atendPresencial:    toN(cells[5]?.text),
        atendPresencialPct: toP(cells[6]?.text),
        teleconsulta:       toN(cells[7]?.text),
        teleconsultaPct:    toP(cells[8]?.text),
        ausente:            toN(cells[9]?.text),
        ausentePct:         toP(cells[10]?.text),
        desistencia:        toN(cells[11]?.text),
        desistenciaPct:     toP(cells[12]?.text),
        dispensado:         toN(cells[13]?.text),
        dispensadoPct:      toP(cells[14]?.text),
        naoInformado:       toN(cells[15]?.text),
        naoInformadoPct:    toP(cells[16]?.text),
        falta:              toN(cells[17]?.text),
        faltaPct:           toP(cells[18]?.text),
        alta:               toN(cells[19]?.text),
        altaPct:            toP(cells[20]?.text),
      });
    }
  }

  // Linha TOTAL
  let total = null;
  const totRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let totM;
  while ((totM = totRe.exec(html)) !== null) {
    const cells2 = [];
    const tdR2 = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi; let m2;
    while ((m2 = tdR2.exec(totM[1])) !== null)
      cells2.push(m2[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    if (/^tot/i.test(cells2[0] || '') && cells2.length >= 5) { total = cells2; break; }
  }

  return { rows, total, count: rows.length };
}

// ── Handler: POST /api/siresp-amb-buscar ──────────────────────────────────────
async function handleSirespAmbBuscar(req, res) {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', async () => {
    let params = {};
    try { params = JSON.parse(body); } catch {}
    const agora  = new Date();
    const mes    = String(params.mes  || (agora.getMonth() + 1)).padStart(2, '0');
    const ano    = String(params.ano  || agora.getFullYear());
    const cfg    = lerConfiguracaoEnv();
    const code   = params.code  || cfg.sirespAmbCode  || '9042';
    const label  = params.label || cfg.sirespAmbLabel || 'AME FRANCA';

    try {
      const ok = await sirespAmbEnsureAuth(code, label);
      if (!ok) throw new Error('Falha no login SIRESP Ambulatorial');

      // Performance em paralelo com consulta médica; consulta não-médica em seguida
      const [performance, consultasMedicas] = await Promise.all([
        _sirespColetarPerformance(code, mes, ano),
        _sirespColetarConsultas(mes, ano, 'CM'),
      ]);
      const consultasNaoMedicas = await _sirespColetarConsultas(mes, ano, 'CN');
      const consultas = { medica: consultasMedicas, naoMedica: consultasNaoMedicas };

      const resultado = {
        ok: true, mes, ano, code, label,
        performance, consultas,
        timestamp: new Date().toISOString(),
      };

      try { fs.writeFileSync(path.join(ROOT, 'siresp-amb-dados.json'), JSON.stringify(resultado, null, 2), 'utf8'); } catch {}
      console.log(`${new Date().toLocaleTimeString('pt-BR')} 💾 SIRESP AMB: dados salvos (perf=${performance?.rows?.length||0} rows, c.med=${consultasMedicas?.count||0}, c.nmed=${consultasNaoMedicas?.count||0})`);

      res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
      res.end(JSON.stringify(resultado));
    } catch(e) {
      _sirespAmb.authenticated = false;
      console.log(`${new Date().toLocaleTimeString('pt-BR')} ❌ SIRESP AMB: ${e.message}`);
      res.writeHead(500, {'Content-Type':'application/json;charset=utf-8',...cors});
      res.end(JSON.stringify({ ok: false, erro: e.message }));
    }
  });
}

// ══════════════════════════════════════════════════════════════════
// PASTA DE REDE — Regulação & Planejamento
// Base: \\172.16.10.2\regulacao_e_planejamento\ROSANA_PASTA REDE
// ══════════════════════════════════════════════════════════════════

// Cache simples em memória (5 min TTL)
const _redeCache = new Map();
function _redeCacheGet(k) {
  const e = _redeCache.get(k);
  if (!e) return null;
  if (Date.now() - e.ts > 5 * 60 * 1000) { _redeCache.delete(k); return null; }
  return e.val;
}
function _redeCacheSet(k, v) { _redeCache.set(k, { val: v, ts: Date.now() }); }

function _sanitizePath(p) {
  return (p || '').replace(/\.\./g, '').replace(/[<>"|?*]/g, '').trim();
}

function _excelSerialToDate(n) {
  if (!n || typeof n !== 'number') return null;
  const d = new Date((n - 25569) * 86400 * 1000);
  return `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

// ── CMA Dados Estruturados — /api/cma-dados ──────────────────────
let _cmaDadosCache = null;
let _cmaDadosTs    = 0;

function _parseCmaTexto(texto) {
  const lines = texto.split('\n').map(l => l.trim()).filter(l => l);
  const get = (label) => {
    const i = lines.indexOf(label);
    return i >= 0 ? (lines[i + 1] || '') : '';
  };
  const num = (label) => parseInt(get(label)) || 0;
  const pct = (s) => parseInt((s || '').replace('%', '')) || 0;

  // ── KPIs principais ──────────────────────────────────────────
  const ocupPctStr = get('Porcentagem oc.');
  const metaStr    = lines.find(l => l.startsWith('Meta de ')) || '';
  const atualizado = lines.find(l => l.includes('Atualizado há')) || '';

  const resultado = {
    hospital     : lines.find(l => l === 'Hospital Geral' || l === 'Santa Casa' || (l.length > 3 && l.length < 50 && !l.includes('%') && lines[lines.indexOf(l)+1] === 'Hospital')) || 'Hospital Geral',
    atualizado,
    ocupPct      : pct(ocupPctStr),
    metaPct      : parseInt(metaStr.replace('Meta de ', '').replace('%','')) || 85,
    totalLeitos  : num('Total de leitos'),
    totalOcupados: num('Total ocupação'),
    isolados     : num('Isolados'),
    interditados : num('Interditados'),
    manutencao   : num('Manutenção'),
    reservados   : num('Reservados'),
    disponiveis  : 0,
    unidades     : [],
    pa           : [],
    painelClinico: [],
    ts           : Date.now(),
  };

  // disponíveis = OCUPAÇÃO → Disponíveis
  const ocupIdx = lines.indexOf('OCUPAÇÃO');
  if (ocupIdx >= 0) {
    result_disponiveis: for (let j = ocupIdx; j < Math.min(ocupIdx + 8, lines.length); j++) {
      if (lines[j] === 'Disponíveis') { resultado.disponiveis = parseInt(lines[j+1]) || 0; break result_disponiveis; }
    }
  }

  // ── Tabela de unidades ───────────────────────────────────────
  const HEADERS = ['Setor ↑','Porcentagem','Quantidade SUS','Quantidade Livres','Pacientes','Isolados','Interditados','Manutenção','Reservados','Extras','Total de Pacientes','Ocupados'];
  const tblIdx = lines.indexOf('OCUPAÇÃO POR UNIDADE');
  if (tblIdx >= 0) {
    // nomes dos setores aparecem antes dos dados numéricos
    const hdEnd = lines.indexOf('Ocupados', tblIdx) + 1;
    const paIdx = lines.indexOf('PRONTO ATENDIMENTO', tblIdx);
    const endIdx = paIdx > 0 ? paIdx : tblIdx + 200;

    // Identifica os nomes (linhas com texto U.I / U.T.I / UCI / UTIN etc)
    const nomesSec = [];
    for (let j = hdEnd; j < endIdx; j++) {
      const l = lines[j];
      if (/^U[\.\s]/.test(l) || /^UCI/.test(l)) nomesSec.push({ nome: l, idx: j });
    }
    const N = nomesSec.length;

    // Após os nomes vêm as colunas: pct[], sus[], livres[], pacientes[], isolados[], interditados[], manut[], reservados[], extras[], totalPac[], ocupados[]
    // Cada coluna tem N valores
    const dataStart = N > 0 ? nomesSec[N-1].idx + 1 : hdEnd;
    const cols = [];
    let colStart = dataStart;
    for (let col = 1; col < HEADERS.length; col++) {
      const vals = [];
      for (let n = 0; n < N; n++) {
        const v = lines[colStart + n];
        vals.push(v !== undefined ? v : '0');
      }
      cols.push(vals);
      colStart += N;
    }

    nomesSec.forEach((s, i) => {
      resultado.unidades.push({
        nome        : s.nome,
        pct         : pct(cols[0]?.[i]),
        sus         : parseInt(cols[1]?.[i]) || 0,
        livres      : parseInt(cols[2]?.[i]) || 0,
        pacientes   : parseInt(cols[3]?.[i]) || 0,
        isolados    : parseInt(cols[4]?.[i]) || 0,
        interditados: parseInt(cols[5]?.[i]) || 0,
        manutencao  : parseInt(cols[6]?.[i]) || 0,
        reservados  : parseInt(cols[7]?.[i]) || 0,
        extras      : parseInt(cols[8]?.[i]) || 0,
        totalPac    : parseInt(cols[9]?.[i]) || 0,
        ocupados    : parseInt(cols[10]?.[i]) || 0,
      });
    });
  }

  // ── PA ───────────────────────────────────────────────────────
  const paIdx2 = lines.indexOf('PRONTO ATENDIMENTO');
  if (paIdx2 >= 0) {
    const paEndIdx = lines.indexOf('DISTRIBUIÇÃO GERAL', paIdx2);
    let j = paIdx2 + 3; // pula header
    while (j < (paEndIdx > 0 ? paEndIdx : paIdx2 + 30)) {
      const nome = lines[j];
      if (nome && !['Setor ↑','Pacientes','Solicitações de vaga'].includes(nome) && nome.toUpperCase() === nome) {
        resultado.pa.push({ nome, pacientes: parseInt(lines[j+1]) || 0, solicitacoes: parseInt(lines[j+2]) || 0 });
        j += 3;
      } else { j++; }
    }
  }

  return resultado;
}

async function _cmaPuppeteerLogin(page, user, senha) {
  const senhaEl = await page.$('input[type="password"]');
  if (!senhaEl) return; // já logado
  const loginSel = 'input[type="email"],input[name="email"],input[name="login"],input[name="user[email]"]';
  const loginEl  = await page.$(loginSel);
  if (loginEl) await loginEl.type(user, { delay: 30 });
  await senhaEl.type(senha, { delay: 30 });
  const submitEl = await page.$('button[type="submit"],input[type="submit"]');
  if (submitEl) await submitEl.click(); else await senhaEl.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  if (!page.url().includes('/dashboards/')) {
    await page.goto(_CMA_DASHBOARD, { waitUntil: 'networkidle2', timeout: 20000 });
  }
}

async function handleCmaDados(req, res) {
  const hdrs   = { ...cors, 'Content-Type': 'application/json;charset=utf-8' };
  const forcar = req.url.includes('forcar=1');
  const user   = _lerEnvRaw('CMA_USER')  || process.env.CMA_USER  || '';
  const senha  = _lerEnvRaw('CMA_SENHA') || process.env.CMA_SENHA || '';

  if (!user || !senha) {
    res.writeHead(200, hdrs);
    return res.end(JSON.stringify({ ok: false, erro: 'CMA_USER/CMA_SENHA não configurados no CONFIGURACAO.env' }));
  }

  // Serve cache se válido
  if (!forcar && _cmaDadosCache && (Date.now() - _cmaDadosTs < _CMA_CACHE_TTL)) {
    res.writeHead(200, hdrs);
    return res.end(JSON.stringify({ ok: true, cached: true, ..._cmaDadosCache }));
  }

  let browser;
  try {
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--ignore-certificate-errors'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    await page.goto(_CMA_DASHBOARD, { waitUntil: 'networkidle2', timeout: 30000 });
    await _cmaPuppeteerLogin(page, user, senha);
    await new Promise(r => setTimeout(r, 3000));

    const texto = await page.evaluate(() => document.body.innerText);
    const dados = _parseCmaTexto(texto);

    _cmaDadosCache = dados;
    _cmaDadosTs    = Date.now();

    res.writeHead(200, hdrs);
    res.end(JSON.stringify({ ok: true, cached: false, ...dados }));
  } catch (e) {
    res.writeHead(200, hdrs);
    res.end(JSON.stringify({ ok: false, erro: 'Erro ao extrair CMA: ' + e.message }));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ── CMA Screenshot — Ocupação Hospitalar ─────────────────────────
const _CMA_CACHE_FILE  = path.join(ROOT, 'cma-ocupacao-cache.png');
const _CMA_CACHE_TTL   = 30 * 60 * 1000; // 30 minutos
let   _cmaLastCapture  = 0;
const _CMA_DASHBOARD   = 'https://cma.gruposcf.com.br/dashboards/hospital-occupancy';

function _lerEnvRaw(chave) {
  try {
    const lines = fs.readFileSync(CONFIG_FILE, 'utf8').split('\n');
    const l = lines.find(l => l.startsWith(chave + '='));
    return l ? l.slice(chave.length + 1).trim() : '';
  } catch { return ''; }
}

async function handleCmaScreenshot(req, res) {
  const hdrs  = { ...cors, 'Content-Type': 'application/json;charset=utf-8' };
  const user  = _lerEnvRaw('CMA_USER')  || process.env.CMA_USER  || '';
  const senha = _lerEnvRaw('CMA_SENHA') || process.env.CMA_SENHA || '';
  const forcar = req.url.includes('forcar=1');

  // Serve cache se válido e não forçado
  if (!forcar && Date.now() - _cmaLastCapture < _CMA_CACHE_TTL && fs.existsSync(_CMA_CACHE_FILE)) {
    const img = fs.readFileSync(_CMA_CACHE_FILE).toString('base64');
    res.writeHead(200, hdrs);
    return res.end(JSON.stringify({ ok: true, img, cached: true, ts: _cmaLastCapture }));
  }

  if (!user || !senha) {
    res.writeHead(200, hdrs);
    return res.end(JSON.stringify({ ok: false, erro: 'Credenciais CMA não configuradas. Adicione CMA_USER e CMA_SENHA no CONFIGURACAO.env' }));
  }

  let browser;
  try {
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--ignore-certificate-errors']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });

    // Navega ao dashboard (pode redirecionar para login)
    await page.goto(_CMA_DASHBOARD, { waitUntil: 'networkidle2', timeout: 30000 });

    // Detecta se caiu na página de login (URL mudou ou há campo de senha)
    const currentUrl = page.url();
    if (currentUrl !== _CMA_DASHBOARD || await page.$('input[type="password"]')) {
      // Preenche credenciais
      const loginSel = 'input[type="email"], input[name="email"], input[name="login"], input[name="user[email]"]';
      const senhaSel = 'input[type="password"]';
      await page.waitForSelector(senhaSel, { timeout: 10000 }).catch(() => {});
      const loginEl = await page.$(loginSel);
      if (loginEl) await loginEl.type(user, { delay: 40 });
      const senhaEl = await page.$(senhaSel);
      if (senhaEl) await senhaEl.type(senha, { delay: 40 });
      // Submete (Enter ou botão submit)
      const submitSel = 'button[type="submit"], input[type="submit"]';
      const submitEl  = await page.$(submitSel);
      if (submitEl) await submitEl.click();
      else          await senhaEl.press('Enter');
      // Aguarda navegação após login
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
      // Se ainda não está no dashboard, tenta navegar
      if (!page.url().includes('/dashboards/')) {
        await page.goto(_CMA_DASHBOARD, { waitUntil: 'networkidle2', timeout: 20000 });
      }
    }

    // Aguarda o conteúdo do dashboard
    await new Promise(r => setTimeout(r, 3000));

    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    fs.writeFileSync(_CMA_CACHE_FILE, screenshot);
    _cmaLastCapture = Date.now();

    res.writeHead(200, hdrs);
    res.end(JSON.stringify({ ok: true, img: screenshot.toString('base64'), cached: false, ts: _cmaLastCapture }));
  } catch (e) {
    res.writeHead(200, hdrs);
    res.end(JSON.stringify({ ok: false, erro: 'Erro ao capturar CMA: ' + e.message }));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ── Numb3rs Analytics — screenshots de views Tableau ─────────────
const _NUMB3RS_BASE = 'https://wapp.numb3rs.com.br';
const _NUMB3RS_VIEWS = {
  ocupacao:     '/tableau/02-indicadores-hospitalares-202405271716817679/trusted/201-taxa-de-ocupacao-202503051741177045',
  permanencia:  '/tableau/02-indicadores-hospitalares-202405271716817679/trusted/202-media-de-permanencia',
  cebas:        '/tableau/02-indicadores-hospitalares-202405271716817679/trusted/203-cebas-202407121720814653',
  ciha:         '/tableau/02-indicadores-hospitalares-202405271716817679/trusted/205-ciha-acompanhamento-de-remessa',
  fat_total:    '/tableau/03-faturamento/trusted/301-total-202502171739809713',
  fat_projecao: '/tableau/03-faturamento/trusted/302-projecao-202502171739816439',
  fat_hosp:     '/tableau/03-faturamento/trusted/303-hospitalar-por-internacao-202407111720722217',
  fat_proc:     '/tableau/03-faturamento/trusted/304-hospitalar-por-procedimento',
  fat_amb:      '/tableau/03-faturamento/trusted/305-ambulatorial-por-procedimento',
  aih_sintetico:'/tableau/03-faturamento/trusted/3081-sintetico',
  aih_rejeit:   '/tableau/03-faturamento/trusted/3083-perdidas-202407111720726912',
  fat_valor:    '/tableau/03-faturamento/trusted/310-valor-medio-da-aih',
  fat_historico:'/tableau/03-faturamento/trusted/311-serie-historica',
  fat_cid:      '/tableau/03-faturamento/trusted/317-producao-por-cid',
  utilizacao:   '/tableau/04-epidemiologia/trusted/401-utilizacao-hospitalar-202405211716323422',
  mortalidade:  '/tableau/04-epidemiologia/trusted/402-mortalidade-hospitalar',
  distribuicao: '/tableau/04-epidemiologia/trusted/403-distribuicao-geografica',
  cid:          '/tableau/04-epidemiologia/trusted/406-preenchimento-de-cid',
  consultas:    '/tableau/04-epidemiologia/trusted/408-consultas-medicas',
  causas:       '/tableau/04-epidemiologia/trusted/409-internacao-causas-sensiveis',
};
const _NUMB3RS_CACHE_TTL = 30 * 60 * 1000;
const _numb3rsCache = {}; // { [secao]: { img, ts } }
let   _numb3rsBrowser = null; // sessão reutilizável
let   _numb3rsLogado  = false;

async function _numb3rsEnsureLogin(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(_NUMB3RS_BASE + '/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });
  const senhaEl = await page.$('input[type="password"]');
  if (senhaEl) {
    const user  = _lerEnvRaw('NUMB3RS_USER');
    const senha = _lerEnvRaw('NUMB3RS_SENHA');
    const emailSels = ['input[type="email"]','input[name="email"]','input[placeholder*="mail" i]'];
    for (const s of emailSels) {
      const el = await page.$(s); if (el) { await el.type(user, { delay: 30 }); break; }
    }
    await senhaEl.type(senha, { delay: 30 });
    const submit = await page.$('button[type="submit"],input[type="submit"]');
    if (submit) await submit.click(); else await senhaEl.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
  }
  await new Promise(r => setTimeout(r, 1500));
  await page.close();
}

async function handleNumb3rs(req, res) {
  const hdrs   = { ...cors, 'Content-Type': 'application/json;charset=utf-8' };
  const urlObj = new URL(req.url, 'http://x');
  const secao  = urlObj.searchParams.get('secao') || 'fat_total';
  const forcar = urlObj.searchParams.get('forcar') === '1';

  const user  = _lerEnvRaw('NUMB3RS_USER');
  const senha = _lerEnvRaw('NUMB3RS_SENHA');
  if (!user || !senha) {
    res.writeHead(200, hdrs);
    return res.end(JSON.stringify({ ok: false, erro: 'NUMB3RS_USER/NUMB3RS_SENHA não configurados' }));
  }

  const viewPath = _NUMB3RS_VIEWS[secao];
  if (!viewPath) {
    res.writeHead(200, hdrs);
    return res.end(JSON.stringify({ ok: false, erro: `Seção desconhecida: ${secao}. Disponíveis: ${Object.keys(_NUMB3RS_VIEWS).join(', ')}` }));
  }

  // Serve cache se válido
  const cached = _numb3rsCache[secao];
  if (!forcar && cached && (Date.now() - cached.ts < _NUMB3RS_CACHE_TTL)) {
    res.writeHead(200, hdrs);
    return res.end(JSON.stringify({ ok: true, cached: true, img: cached.img, secao, ts: cached.ts }));
  }

  let browser;
  try {
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--ignore-certificate-errors']
    });

    // Login
    await _numb3rsEnsureLogin(browser);

    // Navega para a view diretamente
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 810 });
    await page.goto(_NUMB3RS_BASE + viewPath, { waitUntil: 'networkidle2', timeout: 35000 });
    await new Promise(r => setTimeout(r, 4000)); // aguarda Tableau renderizar

    const ss = await page.screenshot({ type: 'png', fullPage: false });
    const img = ss.toString('base64');

    _numb3rsCache[secao] = { img, ts: Date.now() };

    res.writeHead(200, hdrs);
    res.end(JSON.stringify({ ok: true, cached: false, img, secao, ts: Date.now() }));
  } catch (e) {
    res.writeHead(200, hdrs);
    res.end(JSON.stringify({ ok: false, erro: 'Erro Numb3rs: ' + e.message }));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function handleRedeApi(req, res) {
  const urlObj = new URL(req.url, 'http://x');
  const endpoint = urlObj.pathname.replace('/api/rede/', '');
  const hdrs = { 'Content-Type': 'application/json;charset=utf-8', ...cors };

  const sendOk  = (data) => { res.writeHead(200, hdrs); res.end(JSON.stringify({ ok: true, ...data })); };
  const sendErr = (msg)  => { res.writeHead(500, hdrs); res.end(JSON.stringify({ ok: false, erro: msg })); };

  // ── GET /api/rede/listar?path=<subpath> ──────────────────────────
  if (endpoint === 'listar') {
    const sub = _sanitizePath(urlObj.searchParams.get('path') || '');
    const dir = path.join(REDE_BASE, sub);
    const cacheKey = 'listar:' + dir;
    const cached = _redeCacheGet(cacheKey);
    if (cached) return sendOk(cached);
    try {
      const raw = fs.readdirSync(dir);
      const items = raw
        .filter(n => !n.startsWith('~$') && !n.startsWith('.'))
        .map(name => {
          try {
            const s = fs.statSync(path.join(dir, name));
            return { name, tipo: s.isDirectory() ? 'dir' : 'file', size: s.size,
                     modified: s.mtime.toLocaleDateString('pt-BR'), ext: path.extname(name).toLowerCase() };
          } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => a.tipo === b.tipo ? a.name.localeCompare(b.name, 'pt-BR') : (a.tipo === 'dir' ? -1 : 1));
      const result = { path: sub, items };
      _redeCacheSet(cacheKey, result);
      sendOk(result);
    } catch(e) { sendErr(e.message); }
    return;
  }

  // ── GET /api/rede/excel?file=<relative_path> ──────────────────────
  if (endpoint === 'excel') {
    const file = _sanitizePath(urlObj.searchParams.get('file') || '');
    const fullPath = path.join(REDE_BASE, file);
    const cacheKey = 'excel:' + fullPath;
    const cached = _redeCacheGet(cacheKey);
    if (cached) return sendOk(cached);
    try {
      const wb = XLSX.readFile(fullPath, { sheetStubs: false });
      const sheets = wb.SheetNames.slice(0, 8).map(nome => {
        const ws = wb.Sheets[nome];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', range: 0 });
        const nonEmpty = rows.filter(r => r.some(c => c !== ''));
        return { nome, linhas: nonEmpty.slice(0, 100) };
      });
      const result = { arquivo: path.basename(fullPath), abas: wb.SheetNames, sheets };
      _redeCacheSet(cacheKey, result);
      sendOk(result);
    } catch(e) { sendErr(e.message); }
    return;
  }

  // ── GET /api/rede/indicadores-pa ─────────────────────────────────
  if (endpoint === 'indicadores-pa') {
    const cached = _redeCacheGet('indicadores-pa');
    if (cached) return sendOk(cached);
    try {
      const basePA = path.join(REDE_BASE, '0000. PAINEL DE INDICADORES');
      const wb = XLSX.readFile(path.join(basePA, "ATENDIMENTOS PA'S POR ANO.xlsx"));
      // Sheet GERAL: row1=ano, row2=headers, row3+=dados
      const anos = [];
      wb.SheetNames.forEach(shName => {
        const ws = wb.Sheets[shName];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
        if (!rows.length) return;
        // Detecta padrão: primeira célula = ano (número > 2000)
        let anoAtual = null;
        let headers = [];
        rows.forEach((r, i) => {
          if (typeof r[0] === 'number' && r[0] > 2000 && r[0] < 2030) {
            anoAtual = r[0]; headers = [];
          } else if (anoAtual && headers.length === 0 && r.some(c => typeof c === 'string' && c.length > 1)) {
            headers = r;
          } else if (anoAtual && headers.length > 0 && typeof r[0] === 'string' && r[0].length === 3) {
            const obj = { ano: anoAtual, mes: r[0] };
            headers.forEach((h, j) => { if (h && j > 0) obj[String(h).trim()] = r[j] || 0; });
            anos.push(obj);
          }
        });
      });
      const result = { dados: anos, total: anos.length };
      _redeCacheSet('indicadores-pa', result);
      sendOk(result);
    } catch(e) { sendErr(e.message); }
    return;
  }

  // ── GET /api/rede/cirurgias ───────────────────────────────────────
  if (endpoint === 'cirurgias') {
    const cached = _redeCacheGet('cirurgias');
    if (cached) return sendOk(cached);
    try {
      const basePA = path.join(REDE_BASE, '0000. PAINEL DE INDICADORES');
      const wb = XLSX.readFile(path.join(basePA, 'RELATORIO CIRURGIAS - ATUALIZADA 16.07.2025.xlsx'));
      // Aba "Planilha1": summary com totais mensais
      const wsSumm = wb.Sheets['Planilha1'];
      const rowsSumm = XLSX.utils.sheet_to_json(wsSumm, { header:1, defval:'' });
      // Row 1: PRODUCAO ELETIVAS, col2+= Excel serial dates
      const meses = rowsSumm[0]?.slice(1).map(d => _excelSerialToDate(d)).filter(Boolean) || [];
      const linhas = [];
      rowsSumm.slice(1).forEach(r => {
        if (!r[0] || r[0] === '') return;
        const label = String(r[0]).trim();
        const vals  = meses.map((_, i) => typeof r[i+1] === 'number' ? r[i+1] : 0);
        linhas.push({ label, meses, vals });
      });
      // Aba "HCOR 2025": convenios por mês
      const wsHcor = wb.Sheets['HCOR 2025'];
      const rowsHcor = wsHcor ? XLSX.utils.sheet_to_json(wsHcor, { header:1, defval:'' }) : [];
      const mesesHcor = rowsHcor[2]?.slice(1).map(d => _excelSerialToDate(d)).filter(Boolean) || [];
      const conveniosHcor = [];
      rowsHcor.slice(3).forEach(r => {
        if (!r[0] || typeof r[0] !== 'string') return;
        const total = r.slice(1).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
        if (total > 0) conveniosHcor.push({ nome: r[0].trim(), total, meses: mesesHcor, vals: mesesHcor.map((_,i)=>r[i+1]||0) });
      });
      const result = { resumo: linhas, hcor2025: conveniosHcor, meses };
      _redeCacheSet('cirurgias', result);
      sendOk(result);
    } catch(e) { sendErr(e.message); }
    return;
  }

  sendErr('Endpoint não encontrado: ' + endpoint);
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = getNetworkIPs();
  const pad = s => s.padEnd(53);

  console.log('\nâ•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—');
  console.log('â•‘   SISTEMA GERENCIAL â€“ GRUPO SANTA CASA DE FRANCA          â•‘');
  console.log('â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£');
  console.log('â•‘                                                            â•‘');
  console.log('â•‘  â–º ACESSO LOCAL (este computador):                        â•‘');
  console.log(`â•‘    http://localhost:${PORT}/                                   â•‘`);
  console.log('â•‘                                                            â•‘');

  if (ips.length > 0) {
    console.log('â•‘  â–º ACESSO NA REDE (outros computadores):                  â•‘');
    ips.forEach(({name, address}) => {
      const label = `â•‘    [${name}] http://${address}:${PORT}/`;
      console.log(label.padEnd(63) + 'â•‘');
    });
    console.log('â•‘                                                            â•‘');
  }

  console.log('â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£');
  console.log('â•‘  MÃ“DULOS DISPONÃVEIS:                                      â•‘');
  console.log('â•‘  /               â†’ Portal Central (pÃ¡gina inicial)         â•‘');
  console.log('â•‘  /portal.html    â†’ Portal Central                          â•‘');
  console.log('â•‘  /painel.html    â†’ Painel AMEs (metas + trimestrais)       â•‘');
  console.log('â•‘  /cronoata.html  â†’ Cronoata (atividades por unidade)       â•‘');
  console.log('â•‘  /indicadores.html â†’ Indicadores consolidados              â•‘');
  console.log('â•‘  /dashboard-grid-powerbi.html â†’ Dashboard gerencial        â•‘');
  console.log('â•‘  /hospital.html  â†’ Hospital DRP                            â•‘');
  console.log('â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£');
  console.log('â•‘  APIs:                                                     â•‘');
  console.log('â•‘  POST /api/salvar-cronoata    â†’ Salva cronoata-data.json   â•‘');
  console.log('â•‘  POST /api/salvar-metas-trim  â†’ Salva metas-trimestrais    â•‘');
  console.log('â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
  console.log('\n  Pressione Ctrl+C para parar.\n');
});

