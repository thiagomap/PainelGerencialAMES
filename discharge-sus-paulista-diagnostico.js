// Diagnóstico: explora CMA hospital-discharge + Numb3rs tabela-sus-paulista
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

const CMA_USER  = lerEnvRaw('CMA_USER');
const CMA_SENHA = lerEnvRaw('CMA_SENHA');
const N3_USER   = lerEnvRaw('NUMB3RS_USER');
const N3_SENHA  = lerEnvRaw('NUMB3RS_SENHA');

async function extrairEstrutura(page) {
  return page.evaluate(() => {
    const result = { cards: [], tabelas: [], titulos: [] };
    document.querySelectorAll('[class*="card"],[class*="metric"],[class*="kpi"],[class*="stat"],[class*="value"],[class*="count"]').forEach(el => {
      const txt = el.innerText?.trim();
      if (txt && txt.length < 200 && /\d/.test(txt)) {
        result.cards.push({ tag: el.tagName, class: el.className?.toString().substring(0,60), txt });
      }
    });
    document.querySelectorAll('table').forEach((t, i) => {
      const rows = Array.from(t.querySelectorAll('tr')).map(r =>
        Array.from(r.querySelectorAll('td,th')).map(c => c.innerText?.trim())
      ).filter(r => r.some(c => c));
      if (rows.length > 0 && rows.length < 200) result.tabelas.push({ idx: i, rows });
    });
    document.querySelectorAll('h1,h2,h3,h4,[class*="title"],[class*="heading"],[class*="label"]').forEach(el => {
      const txt = el.innerText?.trim();
      if (txt && txt.length > 1 && txt.length < 100) result.titulos.push(txt);
    });
    return result;
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--ignore-certificate-errors']
  });

  const resultado = {};

  // ── 1. CMA hospital-discharge ─────────────────────────────
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const CMA_URL = 'https://cma.gruposcf.com.br/dashboards/hospital-discharge';
    console.log('Navegando para CMA hospital-discharge...');
    await page.goto(CMA_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const senhaEl = await page.$('input[type="password"]');
    if (senhaEl) {
      console.log('Login CMA...');
      const loginEl = await page.$('input[type="email"],input[name="email"],input[name="login"],input[name="user[email]"],input[type="text"]');
      if (loginEl) await loginEl.type(CMA_USER, { delay: 30 });
      await senhaEl.type(CMA_SENHA, { delay: 30 });
      const submitEl = await page.$('button[type="submit"],input[type="submit"],button');
      if (submitEl) await submitEl.click(); else await senhaEl.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
      if (!page.url().includes('hospital-discharge')) {
        await page.goto(CMA_URL, { waitUntil: 'networkidle2', timeout: 20000 });
      }
    }
    await new Promise(r => setTimeout(r, 4000));
    console.log('URL atual CMA:', page.url());

    const texto = await page.evaluate(() => document.body.innerText);
    const estrutura = await extrairEstrutura(page);
    const ss = await page.screenshot({ type: 'png', fullPage: true });
    fs.writeFileSync(path.join(__dirname, 'cma-hospital-discharge.png'), ss);

    resultado.cma_discharge = { url: page.url(), texto: texto.slice(0, 8000), estrutura };
    console.log('=== TEXTO CMA (8000 chars) ===');
    console.log(texto.slice(0, 8000));
    console.log('Tabelas encontradas:', estrutura.tabelas.length);
    estrutura.tabelas.forEach(t => {
      console.log(`  Tabela ${t.idx} (${t.rows.length} linhas):`);
      t.rows.slice(0, 8).forEach(r => console.log('    ', r.join(' | ')));
    });
    await page.close();
  } catch (e) {
    console.log('ERRO CMA:', e.message);
    resultado.cma_discharge = { erro: e.message };
  }

  // ── 2. Numb3rs tabela-sus-paulista ────────────────────────
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    await page.goto('https://wapp.numb3rs.com.br/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });

    const senhaEl = await page.$('input[type="password"]');
    if (senhaEl) {
      console.log('Login Numb3rs...');
      const emailSels = ['input[type="email"]','input[name="email"]','input[placeholder*="mail" i]'];
      for (const s of emailSels) { const el = await page.$(s); if (el) { await el.type(N3_USER, { delay: 30 }); break; } }
      await senhaEl.type(N3_SENHA, { delay: 30 });
      const submitEl = await page.$('button[type="submit"],input[type="submit"]');
      if (submitEl) await submitEl.click(); else await senhaEl.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 1500));

    const N3_URL = 'https://wapp.numb3rs.com.br/tableau/08-extras/trusted/tabela-sus-paulista';
    console.log('Navegando para Numb3rs tabela-sus-paulista...');
    await page.goto(N3_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    console.log('URL atual Numb3rs:', page.url());

    // Disclaimer "Entendi e quero ver os detalhes"
    const btns = await page.$$('button, [role="button"], div');
    for (const b of btns) {
      const txt = (await page.evaluate(el => el.innerText, b))?.trim();
      if (txt && txt.includes('Entendi e quero ver os detalhes')) {
        console.log('Clicando em "Entendi e quero ver os detalhes"...');
        await b.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 6000));

    const texto = await page.evaluate(() => document.body.innerText);
    const estrutura = await extrairEstrutura(page);
    const ss = await page.screenshot({ type: 'png', fullPage: true });
    fs.writeFileSync(path.join(__dirname, 'numb3rs-tabela-sus-paulista.png'), ss);

    resultado.numb3rs_sus_paulista = { url: page.url(), texto: texto.slice(0, 8000), estrutura };
    console.log('=== TEXTO NUMB3RS (8000 chars) ===');
    console.log(texto.slice(0, 8000));
    console.log('Tabelas encontradas:', estrutura.tabelas.length);
    estrutura.tabelas.forEach(t => {
      console.log(`  Tabela ${t.idx} (${t.rows.length} linhas):`);
      t.rows.slice(0, 15).forEach(r => console.log('    ', r.join(' | ')));
    });
    await page.close();
  } catch (e) {
    console.log('ERRO NUMB3RS:', e.message);
    resultado.numb3rs_sus_paulista = { erro: e.message };
  }

  fs.writeFileSync(path.join(__dirname, 'discharge-sus-paulista-diagnostico.json'), JSON.stringify(resultado, null, 2), 'utf8');
  console.log('\n✅ Diagnóstico salvo em discharge-sus-paulista-diagnostico.json');

  await browser.close();
})();
