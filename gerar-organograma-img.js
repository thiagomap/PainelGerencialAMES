// Captura screenshot do organograma diretamente do portal rodando
const puppeteer = require('puppeteer');
const path = require('path');
const fs   = require('fs');

const OUT_DIR = path.join(__dirname, 'Relatorio Gerencial Hospitais', 'Organogramas');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const PORTAL = 'http://127.0.0.1:3000';
const MODOS = [
  { nome: 'atual',    btn: 'org-btn-atual', label: 'Organograma-Atual'     },
  { nome: 'v2',       btn: 'org-btn-v2',    label: 'Organograma-V2-Performance' },
  { nome: 'novo',     btn: 'org-btn-novo',  label: 'Organograma-Proposta-Estrutural' },
];

(async () => {
  console.log('🚀 Abrindo Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 3200, height: 2400, deviceScaleFactor: 2 });

  // 1. Abre o portal
  console.log('📡 Abrindo portal...');
  await page.goto(PORTAL, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));

  // 2. Navega para Gestão Hospitalar (hosp-super)
  console.log('🏥 Navegando para Gestão Hospitalar...');
  await page.evaluate(() => {
    const sb = document.querySelector('[data-view="hosp-super"]');
    if (sb) sb.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // 3. Clica na aba Organograma
  console.log('🏢 Abrindo aba Organograma...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#view-hosp-super .tab-btn')];
    const org = btns.find(b => b.textContent.includes('Organograma'));
    if (org) org.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // 4. Para cada modo, captura screenshot
  for (const modo of MODOS) {
    console.log(`📸 Capturando: ${modo.label}...`);

    // Clica no botão do modo
    await page.evaluate((btnId) => {
      const btn = document.getElementById(btnId);
      if (btn) btn.click();
    }, modo.btn);
    await new Promise(r => setTimeout(r, 1500));

    // Esconde elementos de UI que não fazem parte do organograma
    await page.evaluate(() => {
      document.querySelector('.sidebar')?.style.setProperty('display','none');
      document.querySelector('#topbar')?.style.setProperty('display','none');
    });

    // Captura o elemento do organograma
    const orgEl = await page.$('#org-container');
    if (!orgEl) {
      console.log(`  ⚠️  Elemento não encontrado para ${modo.label}`);
      continue;
    }

    // Screenshot do elemento
    const pngPath = path.join(OUT_DIR, `${modo.label}.png`);
    await orgEl.screenshot({ path: pngPath, type: 'png' });
    console.log(`  ✅ Salvo: ${pngPath}`);

    // Restaura sidebar
    await page.evaluate(() => {
      document.querySelector('.sidebar')?.style.removeProperty('display');
      document.querySelector('#topbar')?.style.removeProperty('display');
    });
  }

  // 5. Screenshot da página inteira com o V2 (para PowerPoint)
  console.log('📊 Capturando página completa V2 para PowerPoint...');
  await page.evaluate(() => {
    const btn = document.getElementById('org-btn-v2');
    if (btn) btn.click();
    document.querySelector('.sidebar')?.style.setProperty('display','none');
    document.querySelector('#topbar')?.style.setProperty('display','none');
  });
  await new Promise(r => setTimeout(r, 1500));

  const pptPath = path.join(OUT_DIR, 'Organograma-V2-Apresentacao-16x9.png');
  await page.setViewport({ width: 2560, height: 1440, deviceScaleFactor: 2 });
  const orgEl2 = await page.$('#org-container');
  if (orgEl2) {
    await orgEl2.screenshot({ path: pptPath, type: 'png' });
    console.log(`  ✅ PowerPoint-ready: ${pptPath}`);
  }

  await browser.close();

  // Lista os arquivos gerados
  console.log('\n✅ Imagens geradas em:');
  console.log('   ' + OUT_DIR);
  fs.readdirSync(OUT_DIR).forEach(f => {
    const s = fs.statSync(path.join(OUT_DIR, f));
    console.log(`   📄 ${f} (${(s.size/1024).toFixed(0)} KB)`);
  });
})();
