'use strict';
const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { exec } = require('child_process');

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
          console.log(`${new Date().toLocaleTimeString('pt-BR')} âœ… ${label} salvo`);
          res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', ...cors});
          res.end(JSON.stringify({ok: true}));
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
    res.writeHead(404, {'Content-Type': 'application/json; charset=utf-8', ...cors});
    res.end(JSON.stringify({ok: false, erro: 'Endpoint nÃ£o encontrado'}));
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
  if (req.method === 'GET' && req.url.startsWith('/api/status-atualizacao')) {
    res.writeHead(200, {'Content-Type':'application/json;charset=utf-8',...cors});
    return res.end(JSON.stringify({
      status: _regeandoStatus,
      ultimaAtualizacao: _ultimaAtualizacao ? _ultimaAtualizacao.toLocaleString('pt-BR') : null,
    }));
  }

  // â”€â”€ GET estÃ¡tico â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let url = req.url.split('?')[0];
  if (url === '/') url = '/portal-unificado.html';  // portal Ãºnico integrado

  const filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Proibido'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/html; charset=utf-8', ...cors});
      res.end(`<h2>404 â€“ NÃ£o encontrado: ${url}</h2>`);
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type': mime, 'Cache-Control': 'no-cache', ...cors});
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

function lerConfiguracaoEnv() {
  const result = { periodo: {}, ames: {}, hospital: {} };
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
  MESES_CFG.forEach(m => { result.hospital[m] = get(`HOSPITAL_${m}`); });
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

