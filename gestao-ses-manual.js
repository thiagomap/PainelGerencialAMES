// Login MANUAL no gestao.saude.sp.gov.br
// Abre browser visível, você faz login, o script salva cookies e explora o portal
// Uso: node gestao-ses-manual.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COOKIES_FILE = path.join(__dirname, 'gestao-ses-cookies.json');
const URL_LOGIN = 'https://gestao.saude.sp.gov.br/';

(async () => {
  console.log('🌐 Abrindo browser. Faça o login manualmente e pressione ENTER aqui quando estiver logado...');

  const browser = await puppeteer.launch({
    headless: false,          // VISÍVEL
    defaultViewport: null,    // Tamanho nativo
    args: ['--no-sandbox', '--ignore-certificate-errors', '--start-maximized'],
  });

  const page = await browser.newPage();
  await page.goto(URL_LOGIN, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('\n📋 Browser aberto em: ' + URL_LOGIN);
  console.log('👉 Preencha login, senha e captcha, clique em Entrar');
  console.log('👉 Quando estiver na página principal, AGUARDE — o script continua automaticamente\n');

  // Aguarda sair da página de login (detecção automática)
  let logado = false;
  let tentativas = 0;
  while (!logado && tentativas < 120) {
    await new Promise(r => setTimeout(r, 1000));
    tentativas++;
    const url = page.url();
    const title = await page.title().catch(() => '');
    if (!url.includes('index.php') || title !== ':: Gestão em Saúde ::') {
      // Página mudou
    }
    // Verifica se ainda está na tela de login
    const naLogin = await page.$('input[name=captcha]').then(el => !!el).catch(() => false);
    if (!naLogin) {
      logado = true;
      console.log('✅ Login detectado!');
      break;
    }
    if (tentativas % 10 === 0) console.log(`  Aguardando login... (${tentativas}s)`);
  }

  if (!logado) {
    console.log('⏱️  Timeout — encerrando.');
    await browser.close();
    return;
  }

  await new Promise(r => setTimeout(r, 2000));

  const url = page.url();
  const title = await page.title();
  console.log(`\nURL: ${url}`);
  console.log(`Título: ${title}`);

  // Salva cookies
  const cookies = await page.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  console.log('🍪 Cookies salvos:', COOKIES_FILE);

  // Explora o portal
  console.log('\n=== MAPA DO PORTAL ===\n');

  const texto = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('Conteúdo:', texto);

  const links = await page.$$eval('a', els => els.map(e => ({
    text: e.innerText.trim().slice(0, 80),
    href: e.href
  })).filter(l => l.text && l.href && !l.href.includes('javascript')));
  console.log('\nLinks:');
  links.forEach(l => console.log(`  ${l.text} → ${l.href}`));

  await page.screenshot({ path: 'gestao-ses-logado.png', fullPage: true });
  console.log('\n📸 Screenshot: gestao-ses-logado.png');

  // Aguarda input do usuário antes de fechar
  console.log('\n\nPressione Ctrl+C para fechar o browser ou aguarde 60s...');
  await new Promise(r => setTimeout(r, 60000));

  await browser.close();
  console.log('Browser fechado.');
})();
