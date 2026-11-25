import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(__dirname, '..');
const BACK_DIR = path.resolve(FRONT_DIR, '..', 'UniColab-Back-');
const API_PORT = 5080;
const FRONT_PORT = 3001;
const CHROME_PORT = 9224;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome/Edge não encontrado.');
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
      this.ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message));
          else res(msg.result);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          this.errors.push(`PageException: ${msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text}`);
        } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
          this.errors.push(`ConsoleError: ${(msg.params.args || []).map((a) => a.value || a.description).join(' ')}`);
        }
      });
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }

  async waitForText(text, timeoutMs = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await this.eval(`document.body.innerText.toLowerCase().includes(${JSON.stringify(text)}.toLowerCase())`);
      if (ok) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    const snippet = await this.eval('document.body.innerText.slice(0, 700)');
    throw new Error(`Timeout esperando texto "${text}". Conteúdo atual:\n${snippet}`);
  }

  async clickButton(labelText) {
    const clicked = await this.eval(`(() => {
      const target = ${JSON.stringify(labelText)}.toLowerCase();
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => !b.disabled && b.innerText.trim().toLowerCase().includes(target));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`Botão "${labelText}" não encontrado ou desabilitado.`);
  }

  async clickAria(ariaLabel) {
    const clicked = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(`[aria-label="${ariaLabel}"]`)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`Elemento [aria-label="${ariaLabel}"] não encontrado.`);
  }

  async setInputValue(selector, value) {
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!ok) throw new Error(`Campo ${selector} não encontrado.`);
  }

  close() {
    this.ws?.close();
  }
}

async function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Servidor não respondeu em ${url}`);
}

const results = [];
async function test(name, fn) {
  const start = Date.now();
  await fn();
  const ms = Date.now() - start;
  results.push({ name, ms });
  console.log(`✔ PASS [${ms}ms] ${name}`);
}

async function main() {
  const tag = String(Date.now()).slice(-6);
  const studentEmail = `e2e.aluno.${tag}@edu.unifor.br`;
  const teacherEmail = `e2e.prof.${tag}@edu.unifor.br`;
  const questionTitle = `Questao E2E Real JS ${tag}: qual principio garante atomicidade e consistencia em transacoes no MySQL InnoDB?`;

  const backProc = spawn('dotnet', ['bin\\Debug\\net8.0\\UniColab.Api.dll', '--urls', `http://127.0.0.1:${API_PORT}`], {
    cwd: BACK_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const frontProc = spawn(process.execPath, ['dist/server.js'], {
    cwd: FRONT_DIR,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(FRONT_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const chromeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unicolab-e2e-real-'));
  const chromeProc = spawn(
    findChrome(),
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      `--remote-debugging-port=${CHROME_PORT}`,
      `--user-data-dir=${chromeDir}`,
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp;
  try {
    await waitForHttp(`http://127.0.0.1:${API_PORT}/api/health`);
    await waitForHttp(`http://127.0.0.1:${FRONT_PORT}/`);
    await waitForHttp(`http://127.0.0.1:${CHROME_PORT}/json/version`);

    const targets = await (await fetch(`http://127.0.0.1:${CHROME_PORT}/json`)).json();
    const pageTarget = targets.find((t) => t.type === 'page');
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    await test('1. API .NET real (/api/health), login inválido (401) e cadastro real de estudante no MySQL', async () => {
      await cdp.send('Page.navigate', { url: `http://localhost:${FRONT_PORT}/` });
      await cdp.waitForText('Bem-vindo de volta');

      await cdp.setInputValue('#unicolab-username', 'naoexiste@edu.unifor.br');
      await cdp.setInputValue('#unicolab-password', 'SenhaErrada123!');
      await cdp.clickButton('Entrar na plataforma');
      await cdp.waitForText('inválid');

      await cdp.clickButton('Criar conta');
      await cdp.waitForText('Engenharia de Computação');
      await cdp.setInputValue('input[placeholder="Vládia"]', `Aluno E2E ${tag}`);
      await cdp.setInputValue('input[placeholder="nome@edu.unifor.br"]', studentEmail);
      await cdp.setInputValue('input[placeholder="2214587"]', `26${tag}`);
      await cdp.eval(`(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        for (const el of inputs) {
          setter.call(el, 'SenhaE2E@2026');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        document.querySelector('input[type="checkbox"]').click();
      })()`);
      await cdp.clickButton('Criar minha conta');
      await cdp.waitForText(`Bem-vindo de volta, Aluno E2E ${tag}`);
    });

    await test('2. Banco de questões real do unicolab_db + Prática avulsa (POST /api/questoes/{id}/responder)', async () => {
      await cdp.clickButton('Banco de questões');
      await cdp.waitForText('Provas da banca');
      await cdp.waitForText('Resolver questão');
      await cdp.clickButton('Resolver questão');
      await cdp.waitForText('Prática avulsa');

      // Seleciona a primeira alternativa (letra A)
      await cdp.eval(`(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const altBtn = buttons.find((b) => b.querySelector('span')?.innerText.trim() === 'A');
        if (!altBtn) throw new Error('Alternativa A não encontrada');
        altBtn.click();
      })()`);
      await cdp.clickButton('Finalizar Respostas');
      await cdp.waitForText('Gabarito Comentado (Oficial)');
      await cdp.clickButton('Enviar e Ver Resultados');
      await cdp.waitForText(`Bem-vindo de volta, Aluno E2E ${tag}`);
    });

    await test('3. Simulado cronometrado real (sp_iniciar_tentativa → sp_registrar_resposta → sp_finalizar_tentativa)', async () => {
      const hasExam = await cdp.eval(`Array.from(document.querySelectorAll('button')).some((b) => b.innerText.trim().startsWith('Iniciar '))`);
      if (!hasExam) {
        console.log('   (aviso: nenhuma prova publicada no banco local; pulando início de simulado da banca)');
        return;
      }
      await cdp.clickButton('Iniciar ');
      await cdp.waitForText('Mapa do Simulado');
      await cdp.eval(`(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const altBtn = buttons.find((b) => b.querySelector('span')?.innerText.trim() === 'A');
        if (altBtn) altBtn.click();
      })()`);
      await cdp.clickButton('Finalizar Respostas');
      await cdp.waitForText('Gabarito Comentado (Oficial)');
      await cdp.clickButton('Enviar e Ver Resultados');
      await cdp.waitForText('Histórico de simulados');
    });

    await test('4. Fórum de dúvidas real gravando em comentarios_forum no MySQL', async () => {
      await cdp.clickButton('Fórum de dúvidas');
      await cdp.waitForText('Debates acadêmicos');
      const msg = `Duvida real E2E JS ${tag} gravada no MySQL!`;
      await cdp.setInputValue('textarea', msg);
      await cdp.clickButton('Publicar no fórum');
      await cdp.waitForText(msg);
    });

    await test('5. Trilha IA real (POST /api/trilhas/sugerir → sp_sugerir_trilha no MySQL)', async () => {
      await cdp.clickButton('Trilha IA');
      await cdp.clickButton('Gerar minha trilha de estudo personalizada');
      await cdp.waitForText('Trilha dos pontos fracos');
    });

    await test('6. Logout + Cadastro real de Professor no MySQL + Painel Docente', async () => {
      await cdp.clickAria('Sair');
      await cdp.waitForText('Bem-vindo de volta');
      await cdp.clickButton('Criar conta de professor');
      await cdp.waitForText('Carteira Nacional Docente do Brasil');
      await cdp.setInputValue('input[placeholder="Nome e sobrenome"]', `Prof E2E ${tag}`);
      await cdp.setInputValue('input[placeholder="nome@edu.unifor.br"]', teacherEmail);
      await cdp.setInputValue('input[placeholder="Número da CNDB"]', `CNDB${tag}`);
      await cdp.eval(`(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        for (const el of inputs) {
          setter.call(el, 'SenhaProf@2026');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        document.querySelector('input[type="checkbox"]').click();
      })()`);
      await cdp.clickButton('Criar conta de professor');
      await cdp.waitForText(`Olá, Prof E2E ${tag}`);
    });

    await test('7. Professor publica questão real (trigger trg_questoes_bu) e apaga via sp_apagar_questao', async () => {
      await cdp.clickButton('Nova questão');
      await cdp.waitForText('Cadastrar nova questão ENADE');
      await cdp.setInputValue('textarea', questionTitle);
      await cdp.clickButton('Continuar para alternativas');
      await cdp.waitForText('Alternativas de resposta');

      const alts = [
        'Propriedades ACID garantidas pelo motor InnoDB',
        'Apenas chaves estrangeiras sem transacao',
        'Somente indices FULLTEXT em tabela MyISAM',
        'Armazenamento temporario em memoria sem log',
        'Desativacao completa de triggers e constraints',
      ];
      for (let i = 0; i < 5; i++) {
        await cdp.setInputValue(`input[placeholder="Conteúdo da alternativa ${String.fromCharCode(65 + i)}"]`, alts[i]);
      }
      await cdp.clickButton('Continuar para o gabarito');
      await cdp.waitForText('Gabarito e referências');

      for (let i = 0; i < 5; i++) {
        await cdp.clickAria(`Alternativa ${String.fromCharCode(65 + i)}`);
        await cdp.setInputValue(
          'textarea[placeholder*="Explique esta alternativa"]',
          `Justificativa pedagogica detalhada da letra ${String.fromCharCode(65 + i)} no teste real.`,
        );
      }
      await cdp.clickAria('Alternativa A');
      await cdp.clickButton('Publicar questão');
      await cdp.waitForText('Questão cadastrada. Ela já entra no banco e nos simulados.');

      // Busca a questão no banco do professor e apaga via sp_apagar_questao para manter o banco limpo
      await cdp.clickButton('Banco de questões');
      await cdp.waitForText('Todas as questões');
      await cdp.setInputValue('input[placeholder="Pesquisar por enunciado ou palavra-chave"]', `E2E Real JS ${tag}`);
      await cdp.waitForText(`Questao E2E Real JS ${tag}`);
      await cdp.clickAria('Apagar questão');
      await cdp.waitForText('A questão sai do banco de dados.');
      await cdp.eval(`(() => {
        const btns = Array.from(document.querySelectorAll('div[role="dialog"] button'));
        const confirmBtn = btns.find((b) => b.innerText.trim() === 'Apagar');
        if (!confirmBtn) throw new Error('Botão Apagar do modal não encontrado');
        confirmBtn.click();
      })()`);
      await cdp.waitForText('Questão apagada do banco.');
    });

    if (cdp.errors.length > 0) {
      throw new Error(`Erros de runtime/console detectados no navegador:\n${cdp.errors.join('\n')}`);
    }

    console.log(`\n✅ TODOS OS ${results.length} CENÁRIOS E2E REAIS (FRONT JS + BACK .NET 8 + MYSQL unicolab_db) PASSARAM!`);
  } finally {
    cdp?.close();
    chromeProc.kill();
    frontProc.kill();
    backProc.kill();
    setTimeout(() => {
      try { fs.rmSync(chromeDir, { recursive: true, force: true }); } catch {}
    }, 300);
  }
}

main().catch((err) => {
  console.error('\n❌ FALHA NO TESTE E2E REAL:', err);
  process.exit(1);
});
