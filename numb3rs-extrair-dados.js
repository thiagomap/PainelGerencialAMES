// Diagnóstico Numb3rs — extrai texto, screenshot e intercepta APIs
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'CONFIGURACAO.env');
function lerEnvRaw(chave) {
  try {
    const lines = fs.readFileSync(CONFIG_FILE, 'utf8').split('\n');
    const l = lines.find(l => l.startsWith(chave + '='));
    return l ? l.slice(chave.length + 1).trim() : '';
  } catch { return ''; }
}

const NUMB3RS_URL = 'https://wapp.numb3rs.com.br/dashboard';
const user  = lerEnvRaw('NUMB3RS_USER')  || 'thiago.silva@santacasadefranca.com.br';
const senha = lerEnvRaw('NUMB3RS_SENHA') || 'gscf1826';

(async () => {
  const apiRespostas = [];

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });

  // Intercepta respostas JSON da API
  page.on('response', async (response) => {
    const url = response.url();
    const ct  = response.headers()['content-type'] || '';
    if (ct.includes('json') && (url.includes('/api/') || url.includes('/graphql') || url.includes('/v1/'))) {
      try {
        const body = await response.json();
        apiRespostas.push({ url, status: response.status(), body });
      } catch {}
    }
  });

  console.log('Navegando para Numb3rs...');
  await page.goto(NUMB3RS_URL, { waitUntil: 'networkidle2', timeout: 30000 });

  // Login se necessário
  const senhaEl = await page.$('input[type="password"]');
  if (senhaEl) {
    console.log('Página de login detectada, fazendo login...');
    // Email
    const emailSels = ['input[type="email"]','input[name="email"]','input[name="login"]','input[placeholder*="mail" i]'];
    let emailEl = null;
    for (const s of emailSels) { emailEl = await page.$(s); if (emailEl) break; }
    if (emailEl) await emailEl.type(user, { delay: 40 });
    // Senha
    await senhaEl.type(senha, { delay: 40 });
    // Submit
    const submitEl = await page.$('button[type="submit"],input[type="submit"],button:not([type])');
    if (submitEl) await submitEl.click();
    else await senhaEl.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    // Se ainda não está no dashboard, força navegação
    if (!page.url().includes('/dashboard')) {
      await page.goto(NUMB3RS_URL, { waitUntil: 'networkidle2', timeout: 25000 });
    }
  }

  // Aguarda o SPA carregar
  await new Promise(r => setTimeout(r, 4000));

  console.log('\n=== URL ATUAL ===', page.url());

  // Extrai todo o texto visível
  const texto = await page.evaluate(() => document.body.innerText);
  console.log('\n=== TEXTO COMPLETO DA PÁGINA (primeiros 6000 chars) ===');
  console.log(texto.slice(0, 6000));

  // Tenta extrair dados estruturados do DOM
  const domDados = await page.evaluate(() => {
    const result = { cards: [], tabelas: [], listas: [] };

    // Cards / KPIs (elementos com número grande)
    document.querySelectorAll('[class*="card"],[class*="metric"],[class*="kpi"],[class*="stat"],[class*="value"],[class*="count"]').forEach(el => {
      const txt = el.innerText?.trim();
      if (txt && txt.length < 200 && /\d/.test(txt)) {
        result.cards.push({ tag: el.tagName, class: el.className?.substring(0,60), txt });
      }
    });

    // Tabelas
    document.querySelectorAll('table').forEach((t, i) => {
      const rows = Array.from(t.querySelectorAll('tr')).map(r =>
        Array.from(r.querySelectorAll('td,th')).map(c => c.innerText?.trim())
      ).filter(r => r.some(c => c));
      if (rows.length > 0 && rows.length < 100) result.tabelas.push({ idx: i, rows });
    });

    // Títulos e seções
    document.querySelectorAll('h1,h2,h3,h4,[class*="title"],[class*="heading"],[class*="label"]').forEach(el => {
      const txt = el.innerText?.trim();
      if (txt && txt.length > 1 && txt.length < 100) result.listas.push(txt);
    });

    return result;
  });

  console.log('\n=== ESTRUTURA DOM ===');
  console.log('Cards/KPIs encontrados:', domDados.cards.length);
  if (domDados.cards.length) {
    console.log('Primeiros 20 cards:');
    domDados.cards.slice(0, 20).forEach(c => console.log('  -', c.txt.replace(/\n/g, ' | ')));
  }
  console.log('\nTítulos/Seções:');
  [...new Set(domDados.listas)].slice(0, 30).forEach(t => console.log('  •', t));

  if (domDados.tabelas.length) {
    console.log('\nTabelas encontradas:', domDados.tabelas.length);
    domDados.tabelas.slice(0, 3).forEach(t => {
      console.log(`  Tabela ${t.idx} (${t.rows.length} linhas):`);
      t.rows.slice(0, 5).forEach(r => console.log('    ', r.join(' | ')));
    });
  }

  // Respostas de API interceptadas
  console.log('\n=== APIs INTERCEPTADAS ===');
  if (apiRespostas.length) {
    apiRespostas.forEach(a => {
      console.log(`  [${a.status}] ${a.url}`);
      console.log('  Body (resumo):', JSON.stringify(a.body).slice(0, 300));
    });
  } else {
    console.log('  Nenhuma chamada /api/* interceptada.');
    console.log('  (O app pode usar WebSocket, GraphQL ou outro padrão)');
  }

  // Screenshot
  const ss = await page.screenshot({ type: 'png', fullPage: false });
  fs.writeFileSync(path.join(__dirname, 'numb3rs-diagnostico.png'), ss);
  console.log('\n✅ Screenshot salvo: numb3rs-diagnostico.png');

  // Salva resultado completo para análise
  const resultado = {
    url: page.url(),
    texto: texto.slice(0, 10000),
    domDados,
    apiRespostas: apiRespostas.map(a => ({ url: a.url, status: a.status, body: a.body })),
    ts: new Date().toISOString()
  };
  fs.writeFileSync(path.join(__dirname, 'numb3rs-diagnostico.json'), JSON.stringify(resultado, null, 2), 'utf8');
  console.log('✅ Dados completos salvos: numb3rs-diagnostico.json');

  await browser.close();
})();
