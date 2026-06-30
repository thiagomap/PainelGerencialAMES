// Script diagnóstico: extrai texto e estrutura da página CMA Ocupação
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

const CMA_URL = 'https://cma.gruposcf.com.br/dashboards/hospital-occupancy';
const user  = lerEnvRaw('CMA_USER');
const senha = lerEnvRaw('CMA_SENHA');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });

  console.log('Navegando para CMA...');
  await page.goto(CMA_URL, { waitUntil: 'networkidle2', timeout: 30000 });

  // Login se necessário
  const senhaEl = await page.$('input[type="password"]');
  if (senhaEl) {
    console.log('Página de login detectada, fazendo login...');
    const loginSel = 'input[type="email"],input[name="email"],input[name="login"],input[name="user[email]"]';
    const loginEl = await page.$(loginSel);
    if (loginEl) await loginEl.type(user, { delay: 30 });
    await senhaEl.type(senha, { delay: 30 });
    const submitEl = await page.$('button[type="submit"],input[type="submit"]');
    if (submitEl) await submitEl.click();
    else await senhaEl.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    if (!page.url().includes('/dashboards/')) {
      await page.goto(CMA_URL, { waitUntil: 'networkidle2', timeout: 20000 });
    }
  }

  await new Promise(r => setTimeout(r, 3000));
  console.log('URL atual:', page.url());

  // Extrai TODO o texto visível da página
  const texto = await page.evaluate(() => document.body.innerText);
  console.log('\n=== TEXTO COMPLETO DA PÁGINA ===');
  console.log(texto.slice(0, 5000));

  // Extrai todos os números e labels em tabelas/cards
  const estrutura = await page.evaluate(() => {
    const result = [];
    // Tabelas
    document.querySelectorAll('table').forEach((t, i) => {
      const rows = Array.from(t.querySelectorAll('tr')).map(r =>
        Array.from(r.querySelectorAll('td,th')).map(c => c.innerText.trim())
      ).filter(r => r.some(c => c));
      if (rows.length) result.push({ tipo: 'tabela_' + i, dados: rows });
    });
    // Cards com números grandes (KPIs)
    const cardSels = ['.card', '.kpi', '[class*="card"]', '[class*="metric"]', '[class*="value"]', '[class*="stat"]', 'h3', 'h4'];
    cardSels.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const txt = el.innerText?.trim();
        if (txt && txt.length < 100 && /\d/.test(txt)) {
          result.push({ tipo: 'card', sel, txt });
        }
      });
    });
    return result;
  });

  console.log('\n=== ESTRUTURA EXTRAÍDA ===');
  console.log(JSON.stringify(estrutura.slice(0, 50), null, 2));

  // Screenshot para referência visual
  const ss = await page.screenshot({ type: 'png', fullPage: true });
  fs.writeFileSync(path.join(__dirname, 'cma-diagnostico.png'), ss);
  console.log('\n✅ Screenshot salvo: cma-diagnostico.png');

  await browser.close();
})();
