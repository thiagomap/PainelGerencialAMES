// Diagnóstico do portal gestao.saude.sp.gov.br
// Uso: node gestao-ses-diagnostico.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URL_BASE = 'http://www.gestao.saude.sp.gov.br/principal.php';
const USER = 'ddgsilva';
const SENHA = '260718';

(async () => {
  console.log('🚀 Iniciando diagnóstico gestao.saude.sp.gov.br...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Captura todas as respostas JSON
  const apiResponses = [];
  page.on('response', async resp => {
    const ct = resp.headers()['content-type'] || '';
    if (ct.includes('json') || ct.includes('javascript')) {
      try {
        const text = await resp.text();
        if (text.length < 50000 && text.trim().startsWith('{') || text.trim().startsWith('[')) {
          apiResponses.push({ url: resp.url(), status: resp.status(), body: text.slice(0, 2000) });
        }
      } catch(e) {}
    }
  });

  try {
    console.log(`\n📡 Navegando para ${URL_BASE}...`);
    await page.goto(URL_BASE, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.screenshot({ path: 'gestao-ses-01-inicial.png', fullPage: true });
    console.log('📸 Screenshot: gestao-ses-01-inicial.png');

    const title = await page.title();
    console.log(`Título: ${title}`);

    // Detecta formulário de login
    const loginForm = await page.$('form');
    const inputUser = await page.$('input[type=text], input[name*=user], input[name*=login], input[id*=user], input[id*=login]');
    const inputSenha = await page.$('input[type=password]');

    console.log(`\nFormulário: ${loginForm ? 'SIM' : 'NÃO'}`);
    console.log(`Campo usuário: ${inputUser ? 'encontrado' : 'não encontrado'}`);
    console.log(`Campo senha: ${inputSenha ? 'encontrado' : 'não encontrado'}`);

    // Mostra todos os inputs
    const inputs = await page.$$eval('input', els => els.map(e => ({
      type: e.type, name: e.name, id: e.id, placeholder: e.placeholder
    })));
    console.log('\nTodos os inputs:', JSON.stringify(inputs, null, 2));

    if (inputUser && inputSenha) {
      console.log('\n🔐 Tentando login...');
      await inputUser.click({ clickCount: 3 });
      await inputUser.type(USER);
      await inputSenha.type(SENHA);

      await page.screenshot({ path: 'gestao-ses-02-pre-login.png' });

      // Tenta submit
      const submitBtn = await page.$('input[type=submit], button[type=submit], button');
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await inputSenha.press('Enter');
      }

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));

      await page.screenshot({ path: 'gestao-ses-03-pos-login.png', fullPage: true });
      console.log('📸 Screenshot: gestao-ses-03-pos-login.png');

      const titleLogado = await page.title();
      console.log(`Título após login: ${titleLogado}`);

      const url = page.url();
      console.log(`URL atual: ${url}`);
    } else {
      // Pode já estar logado ou ter estrutura diferente
      console.log('\nNão encontrou campos de login. Examinando estrutura...');
    }

    // Mostra conteúdo da página
    const texto = await page.evaluate(() => document.body.innerText);
    console.log('\n📄 Texto da página (primeiros 3000 chars):');
    console.log(texto.slice(0, 3000));

    // Links disponíveis
    const links = await page.$$eval('a', els => els.slice(0, 40).map(e => ({
      text: e.innerText.trim().slice(0, 60),
      href: e.href
    })).filter(l => l.text));
    console.log('\n🔗 Links disponíveis:');
    links.forEach(l => console.log(`  ${l.text} → ${l.href}`));

    // Iframes?
    const iframes = await page.$$eval('iframe', els => els.map(e => ({ src: e.src, id: e.id })));
    if (iframes.length) {
      console.log('\n🖼️  Iframes:', JSON.stringify(iframes));
    }

    // Menu / navegação
    const menus = await page.$$eval('nav a, .menu a, ul.nav a, #menu a', els =>
      els.map(e => e.innerText.trim()).filter(t => t)
    ).catch(() => []);
    if (menus.length) {
      console.log('\nMenu:', menus.join(' | '));
    }

    if (apiResponses.length) {
      console.log('\n📡 Respostas JSON capturadas:');
      apiResponses.forEach(r => console.log(`  [${r.status}] ${r.url}\n  ${r.body.slice(0, 300)}`));
    }

  } catch(e) {
    console.error('Erro:', e.message);
    await page.screenshot({ path: 'gestao-ses-erro.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log('\n✅ Diagnóstico concluído.');
  }
})();
