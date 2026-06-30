// Login no gestao.saude.sp.gov.br com suporte a captcha semi-automático
// O script salva o captcha em arquivo, aguarda a solução, então completa o login
// Uso: node gestao-ses-login.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CAPTCHA_IMG = path.join(__dirname, 'gestao-captcha-atual.png');
const CAPTCHA_SOL = path.join(__dirname, 'gestao-captcha-solucao.txt');
const COOKIES_FILE = path.join(__dirname, 'gestao-ses-cookies.json');

const CONFIG_FILE = path.join(__dirname, 'CONFIGURACAO.env');
function lerEnvRaw(chave) {
  try {
    const lines = fs.readFileSync(CONFIG_FILE, 'utf8').split('\n');
    const l = lines.find(l => l.startsWith(chave + '='));
    return l ? l.slice(chave.length + 1).trim() : '';
  } catch { return ''; }
}

const USER = lerEnvRaw('GESTAO_SES_USER');
const SENHA = lerEnvRaw('GESTAO_SES_SENHA');
const URL_LOGIN = 'https://gestao.saude.sp.gov.br/';

async function fazerLogin(page) {
  console.log('📡 Carregando página de login...');
  await page.goto(URL_LOGIN, { waitUntil: 'networkidle2', timeout: 30000 });

  // Salva imagem do captcha via screenshot do elemento (sem refazer requisição)
  const captchaEl = await page.$('img[alt="captcha"]');
  if (!captchaEl) throw new Error('Elemento captcha não encontrado');

  await captchaEl.screenshot({ path: CAPTCHA_IMG });
  console.log(`\n📸 Captcha salvo em: ${CAPTCHA_IMG}`);

  // Remove solução anterior se existir
  if (fs.existsSync(CAPTCHA_SOL)) fs.unlinkSync(CAPTCHA_SOL);

  console.log(`\n⏳ Aguardando solução do captcha em: ${CAPTCHA_SOL}`);
  console.log('   (escreva apenas o texto do captcha no arquivo e salve)\n');

  // Aguarda arquivo de solução (max 120s)
  const solucao = await new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (fs.existsSync(CAPTCHA_SOL)) {
        const texto = fs.readFileSync(CAPTCHA_SOL, 'utf8').trim();
        if (texto.length >= 3) {
          clearInterval(interval);
          resolve(texto);
        }
      }
      if (Date.now() - start > 120000) {
        clearInterval(interval);
        reject(new Error('Timeout aguardando solução do captcha'));
      }
    }, 500);
  });

  console.log(`✅ Solução recebida: "${solucao}"`);

  // Preenche formulário
  await page.$eval('input[name=LOGIN]', el => el.value = '');
  await page.type('input[name=LOGIN]', USER);
  await page.type('input[name=SENHA]', SENHA);
  await page.type('input[name=captcha]', solucao);

  await page.screenshot({ path: 'gestao-ses-pre-submit.png' });

  // Captura alertas de erro
  page.on('dialog', async dialog => {
    console.log('⚠️  Alert:', dialog.message());
    await dialog.accept();
  });

  // Submete sem waitForNavigation (pode ter alert ou redirect lento)
  await page.click('input[name=entra]');
  console.log('Botão clicado, aguardando 8s...');
  await new Promise(r => setTimeout(r, 8000));

  const url = page.url();
  const title = await page.title();
  console.log(`\nURL após login: ${url}`);
  console.log(`Título: ${title}`);

  const texto = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('Texto:', texto.slice(0, 300));

  // Tenta waitForNavigation se ainda estiver na login
  if (url.includes('gestao.saude.sp.gov.br') && (title.includes('Gest') || texto.includes('Autenticação'))) {
    console.log('Aguardando navegação adicional...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log('Nav timeout:', e.message));
    console.log('URL final:', page.url());
  }

  // Salva cookies para reutilizar sessão
  const cookies = await page.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  console.log('🍪 Cookies salvos.');

  return page;
}

async function explorarPortal(page) {
  console.log('\n\n=== EXPLORANDO PORTAL ===\n');

  const url = page.url();
  const title = await page.title();
  const texto = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('URL:', url);
  console.log('Título:', title);
  console.log('\nConteúdo:\n', texto);

  const links = await page.$$eval('a', els => els.map(e => ({
    text: e.innerText.trim().slice(0, 80),
    href: e.href
  })).filter(l => l.text && l.href && !l.href.includes('javascript')));
  console.log('\nLinks disponíveis:');
  links.forEach(l => console.log(`  ${l.text} → ${l.href}`));

  // Menu principal
  const menus = await page.$$eval('li a, nav a, .menu a, ul a', els =>
    els.map(e => ({ text: e.innerText.trim(), href: e.href })).filter(l => l.text)
  ).catch(() => []);
  if (menus.length) {
    console.log('\nItens de menu:');
    menus.forEach(m => console.log(`  ${m.text} → ${m.href}`));
  }

  await page.screenshot({ path: 'gestao-ses-logado.png', fullPage: true });
  console.log('\n📸 Screenshot: gestao-ses-logado.png');
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    await fazerLogin(page);
    await explorarPortal(page);

  } catch(e) {
    console.error('❌ Erro:', e.message);
  } finally {
    await browser.close();
  }
})();
