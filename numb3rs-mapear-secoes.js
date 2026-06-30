// Navega para cada seção chave do Numb3rs e extrai dados + screenshot
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const user  = 'thiago.silva@santacasadefranca.com.br';
const senha = 'gscf1826';
const BASE  = 'https://wapp.numb3rs.com.br';

const SECOES_ALVO = [
  { id: 'ocupacao',     label: '2.01 Taxa de Ocupação',     nav: 'Taxa de Ocupação' },
  { id: 'permanencia',  label: '2.02 Média de Permanência',  nav: 'Média de Permanência' },
  { id: 'fat_total',    label: '3.01 Faturamento Total',     nav: 'Total' },
  { id: 'fat_projecao', label: '3.02 Projeção',              nav: 'Projeção' },
  { id: 'mortalidade',  label: '4.02 Mortalidade Hospitalar',nav: 'Mortalidade Hospitalar' },
  { id: 'utilizacao',   label: '4.01 Utilização Hospitalar', nav: 'Utilização Hospitalar' },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });

  console.log('Login no Numb3rs...');
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });

  const senhaEl = await page.$('input[type="password"]');
  if (senhaEl) {
    const emailSels = ['input[type="email"]','input[name="email"]','input[placeholder*="mail" i]'];
    for (const s of emailSels) {
      const el = await page.$(s);
      if (el) { await el.type(user, { delay: 30 }); break; }
    }
    await senhaEl.type(senha, { delay: 30 });
    const submit = await page.$('button[type="submit"],input[type="submit"]');
    if (submit) await submit.click(); else await senhaEl.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
  }
  await new Promise(r => setTimeout(r, 3000));
  console.log('Logado. URL:', page.url());

  const resultados = {};

  for (const sec of SECOES_ALVO) {
    console.log(`\nNavegando: ${sec.label}...`);
    try {
      // Clica no link do menu que contém o texto da seção
      const clicked = await page.evaluate((txt) => {
        const els = Array.from(document.querySelectorAll('a, li, span, div'));
        const el = els.find(e => e.textContent?.trim() === txt || e.textContent?.includes(txt));
        if (el) { el.click(); return true; }
        return false;
      }, sec.nav);

      if (!clicked) {
        console.log(`  ⚠️ Link "${sec.nav}" não encontrado no menu`);
        continue;
      }

      await new Promise(r => setTimeout(r, 4000));

      const texto = await page.evaluate(() => document.body.innerText);
      const ss = await page.screenshot({ type: 'png', fullPage: false });
      fs.writeFileSync(path.join(__dirname, `numb3rs-${sec.id}.png`), ss);

      resultados[sec.id] = {
        label: sec.label,
        url: page.url(),
        texto: texto.slice(0, 3000),
      };

      console.log(`  ✅ Screenshot: numb3rs-${sec.id}.png`);
      console.log(`  Texto (500 chars): ${texto.slice(0, 500).replace(/\n/g, ' | ')}`);

    } catch(e) {
      console.log(`  ❌ Erro: ${e.message}`);
    }
  }

  fs.writeFileSync(
    path.join(__dirname, 'numb3rs-secoes.json'),
    JSON.stringify(resultados, null, 2), 'utf8'
  );
  console.log('\n✅ Mapeamento completo salvo: numb3rs-secoes.json');
  await browser.close();
})();
