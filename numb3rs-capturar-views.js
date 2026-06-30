// Captura as URLs dos iframes Tableau e navega em cada uma
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const user  = 'thiago.silva@santacasadefranca.com.br';
const senha = 'gscf1826';
const BASE  = 'https://wapp.numb3rs.com.br';

const SECOES = [
  { id: 'ocupacao',    nav: '2.01. Taxa de Ocupação' },
  { id: 'permanencia', nav: '2.02. Média de Permanência' },
  { id: 'fat_total',   nav: '3.01. Total' },
  { id: 'fat_projecao',nav: '3.02. Projeção' },
  { id: 'utilizacao',  nav: '4.01. Utilização Hospitalar' },
  { id: 'mortalidade', nav: '4.02. Mortalidade Hospitalar' },
];

async function login(page) {
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });
  const senhaEl = await page.$('input[type="password"]');
  if (!senhaEl) return;
  const emailSels = ['input[type="email"]','input[name="email"]','input[placeholder*="mail" i]'];
  for (const s of emailSels) {
    const el = await page.$(s);
    if (el) { await el.type(user, { delay: 30 }); break; }
  }
  await senhaEl.type(senha, { delay: 30 });
  const submit = await page.$('button[type="submit"],input[type="submit"]');
  if (submit) await submit.click(); else await senhaEl.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });

  console.log('Fazendo login...');
  await login(page);
  console.log('Logado. URL:', page.url());

  // 1. Inspeciona a estrutura de links e iframes na página principal
  const estrutura = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href],nav a,li a,.nav-item'))
      .map(el => ({ txt: el.textContent?.trim().substring(0,60), href: el.href || el.getAttribute('href') }))
      .filter(l => l.txt && l.txt.length > 2);

    const iframes = Array.from(document.querySelectorAll('iframe'))
      .map(f => ({ src: f.src, name: f.name, id: f.id }));

    const roteador = window.location.href;
    return { links, iframes, roteador };
  });

  console.log('\n=== LINKS NO MENU ===');
  estrutura.links.slice(0, 40).forEach(l => console.log(`  [${l.txt}] → ${l.href}`));

  console.log('\n=== IFRAMES NA PÁGINA ===');
  estrutura.iframes.forEach(f => console.log(`  ${f.id || f.name || '?'} → ${f.src?.substring(0, 120)}`));

  // 2. Clica em cada seção e captura o iframe resultante
  const viewUrls = {};

  for (const sec of SECOES) {
    console.log(`\nNavegando para: ${sec.nav}`);

    // Tenta clicar no link do menu usando texto exato
    const clicked = await page.evaluate((txt) => {
      const els = Array.from(document.querySelectorAll('a,button,li,span'));
      // Busca match exato ou próximo
      const el = els.find(e => {
        const t = e.textContent?.trim();
        return t === txt || t?.includes(txt);
      });
      if (el) { el.click(); return el.textContent?.trim(); }
      return null;
    }, sec.nav);

    if (clicked) {
      console.log(`  Clicou em: "${clicked}"`);
    } else {
      console.log(`  ⚠️ Não encontrou: "${sec.nav}"`);
    }

    await new Promise(r => setTimeout(r, 3000));

    // Captura URL do iframe atual
    const iframeSrc = await page.evaluate(() => {
      const frames = document.querySelectorAll('iframe');
      for (const f of frames) {
        if (f.src && (f.src.includes('viz.numb3rs') || f.src.includes('tableau'))) {
          return f.src;
        }
      }
      // Também tenta contentWindow.location
      return null;
    });

    // Screenshot da página inteira (captura iframe renderizado)
    const ss = await page.screenshot({ type: 'png', fullPage: false });
    fs.writeFileSync(path.join(__dirname, `numb3rs-${sec.id}.png`), ss);
    console.log(`  Screenshot salvo: numb3rs-${sec.id}.png`);

    if (iframeSrc) {
      viewUrls[sec.id] = iframeSrc;
      console.log(`  Iframe URL: ${iframeSrc.substring(0, 120)}`);
    }

    // URL atual
    const urlAtual = page.url();
    if (urlAtual !== BASE + '/dashboard') {
      viewUrls[sec.id] = urlAtual;
      console.log(`  URL mudou para: ${urlAtual}`);
    }
  }

  // 3. Tenta a API Tableau REST para autenticação
  console.log('\n=== TESTANDO TABLEAU REST API ===');
  const apiPage = await browser.newPage();
  try {
    await apiPage.goto('https://viz.numb3rs.com.br/api/2.3/auth/signin', {
      waitUntil: 'networkidle2', timeout: 10000
    });
    const apiStatus = await apiPage.evaluate(() => ({
      url: window.location.href,
      body: document.body.innerText?.slice(0, 500)
    }));
    console.log('Tableau API status:', apiStatus.url);
    console.log('Body:', apiStatus.body?.slice(0, 200));
  } catch(e) {
    console.log('API não acessível via browser:', e.message.slice(0, 100));
  }

  fs.writeFileSync(
    path.join(__dirname, 'numb3rs-view-urls.json'),
    JSON.stringify({ estrutura, viewUrls, ts: new Date().toISOString() }, null, 2)
  );
  console.log('\n✅ URLs e estrutura salvas: numb3rs-view-urls.json');

  await browser.close();
})();
