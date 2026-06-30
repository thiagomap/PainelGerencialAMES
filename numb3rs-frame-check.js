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
const N3_USER  = lerEnvRaw('NUMB3RS_USER');
const N3_SENHA = lerEnvRaw('NUMB3RS_SENHA');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto('https://wapp.numb3rs.com.br/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });
  const senhaEl = await page.$('input[type="password"]');
  if (senhaEl) {
    const emailSels = ['input[type="email"]','input[name="email"]','input[placeholder*="mail" i]'];
    for (const s of emailSels) { const el = await page.$(s); if (el) { await el.type(N3_USER, { delay: 30 }); break; } }
    await senhaEl.type(N3_SENHA, { delay: 30 });
    const submitEl = await page.$('button[type="submit"],input[type="submit"]');
    if (submitEl) await submitEl.click(); else await senhaEl.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
  }
  await new Promise(r => setTimeout(r, 1500));

  await page.goto('https://wapp.numb3rs.com.br/tableau/08-extras/trusted/tabela-sus-paulista', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  console.log('Frames:', page.frames().map(f => f.url()));

  // Tenta clicar via coordenadas (botão azul na parte inferior do disclaimer)
  await page.mouse.click(924, 496);
  await new Promise(r => setTimeout(r, 6000));

  console.log('Frames apos click:', page.frames().map(f => f.url()));

  const ss = await page.screenshot({ type: 'png', fullPage: true });
  fs.writeFileSync(path.join(__dirname, 'numb3rs-sus-paulista-2.png'), ss);

  // Tenta extrair texto de cada frame
  for (const f of page.frames()) {
    try {
      const txt = await f.evaluate(() => document.body.innerText);
      console.log('--- FRAME', f.url(), '---');
      console.log(txt.slice(0, 3000));
    } catch (e) { console.log('frame erro', f.url(), e.message); }
  }

  await browser.close();
})();
