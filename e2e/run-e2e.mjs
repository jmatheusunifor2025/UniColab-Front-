import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(__dirname, '..');
const API_PORT = 5080;
const FRONT_PORT = 3001;
const CHROME_PORT = 9223;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome/Edge não encontrado. Defina CHROME_PATH.');
}

function createMockBackend() {
  const courses = [
    { id: 1, nome: 'Análise e Desenvolvimento de Sistemas', codigo: 'ADS' },
    { id: 2, nome: 'Engenharia de Computação', codigo: 'EC' },
  ];

  const areas = [
    { id: 1, nome: 'Engenharia de Software', componente: 'componente_especifico' },
    { id: 2, nome: 'Banco de Dados', componente: 'componente_especifico' },
    { id: 3, nome: 'Ética e Sociedade', componente: 'formacao_geral' },
  ];

  const users = new Map([
    [
      'vladia@edu.unifor.br',
      {
        id: 10,
        nome: 'Vládia',
        email: 'vladia@edu.unifor.br',
        senha: 'Password@123',
        tipoPerfil: 'estudante',
        cursoId: 1,
        token: 'jwt-student-10',
      },
    ],
    [
      'docente@edu.unifor.br',
      {
        id: 20,
        nome: 'Prof. Carlos',
        email: 'docente@edu.unifor.br',
        senha: 'Password@123',
        tipoPerfil: 'professor',
        cursoId: 1,
        token: 'jwt-teacher-20',
      },
    ],
  ]);

  let nextId = 100;

  const questions = [
    {
      id: 1,
      enunciado: 'Qual padrão de projeto garante que uma classe tenha apenas uma instância global em toda a aplicação?',
      ano: 2024,
      areaId: 1,
      area: 'Engenharia de Software',
      dificuldade: 'facil',
      tipo: 'multipla_escolha',
      padraoResposta: 'Gamma et al., Padrões de Projeto.',
      criadoPorId: 20,
      status: 'publicada',
      alternativas: [
        { id: 11, letra: 'A', ordem: 1, texto: 'Factory Method', ehCorreta: false, explicacao: 'Factory Method delega a criação a subclasses.' },
        { id: 12, letra: 'B', ordem: 2, texto: 'Singleton', ehCorreta: true, explicacao: 'Singleton garante instância única com acesso global.' },
        { id: 13, letra: 'C', ordem: 3, texto: 'Adapter', ehCorreta: false, explicacao: 'Adapter converte interfaces incompatíveis.' },
        { id: 14, letra: 'D', ordem: 4, texto: 'Observer', ehCorreta: false, explicacao: 'Observer notifica dependentes sobre eventos.' },
        { id: 15, letra: 'E', ordem: 5, texto: 'Facade', ehCorreta: false, explicacao: 'Facade simplifica a interface de um subsistema.' },
      ],
      comentarios: [
        { id: 1, autor: 'Vládia', papel: 'estudante', mensagem: 'Qual cuidado ter com Singleton em concorrência?', criadoEm: '2026-11-20T14:00:00Z' },
      ],
    },
    {
      id: 2,
      enunciado: 'Na Terceira Forma Normal (3FN) de bancos de dados relacionais, qual dependência deve ser eliminada?',
      ano: 2023,
      areaId: 2,
      area: 'Banco de Dados',
      dificuldade: 'medio',
      tipo: 'multipla_escolha',
      padraoResposta: 'Elmasri & Navathe, Sistemas de Banco de Dados.',
      criadoPorId: 20,
      status: 'publicada',
      alternativas: [
        { id: 21, letra: 'A', ordem: 1, texto: 'Dependência funcional transitiva entre atributos não-chave', ehCorreta: true, explicacao: 'A 3FN elimina dependências transitivas de atributos não-chave.' },
        { id: 22, letra: 'B', ordem: 2, texto: 'Chaves estrangeiras entre tabelas distintas', ehCorreta: false, explicacao: 'Chaves estrangeiras garantem integridade referencial.' },
        { id: 23, letra: 'C', ordem: 3, texto: 'Chaves primárias simples', ehCorreta: false, explicacao: 'Chaves primárias são fundamentais no modelo relacional.' },
        { id: 24, letra: 'D', ordem: 4, texto: 'Índices compostos de busca', ehCorreta: false, explicacao: 'Índices são estruturas físicas de desempenho.' },
        { id: 25, letra: 'E', ordem: 5, texto: 'Restrições CHECK de domínio', ehCorreta: false, explicacao: 'Constraints CHECK validam regras de domínio.' },
      ],
      comentarios: [],
    },
  ];

  const exams = [
    {
      id: 1,
      titulo: 'Simulado ENADE ADS',
      descricao: 'prova-banca',
      tempoLimiteMinutos: 30,
      quantidadeQuestoes: 2,
      questaoIds: [1, 2],
    },
  ];

  const attempts = [];
  const metrics = [
    { area: 'Engenharia de Software', totalResolvidas: 5, totalAcertos: 4, percentualAcerto: 80 },
    { area: 'Banco de Dados', totalResolvidas: 5, totalAcertos: 3, percentualAcerto: 60 },
  ];
  const badges = [
    { codigo: 'FIRST_SIM', nome: 'Primeiro Simulado', descricao: 'Concluiu 1 simulado', pontos: 100, concedidoEm: '2026-11-20T15:00:00Z' },
  ];

  function userByToken(req) {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    for (const u of users.values()) {
      if (u.token === token) return u;
    }
    return null;
  }

  function readBody(req) {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        if (!data) return resolve({});
        try { resolve(JSON.parse(data)); } catch { resolve({}); }
      });
    });
  }

  function sendJson(res, status, payload) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    });
    res.end(payload === undefined ? '' : JSON.stringify(payload));
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      });
      return res.end();
    }

    const url = new URL(req.url, `http://127.0.0.1:${API_PORT}`);
    const pathname = url.pathname;
    const method = req.method;

    // Public routes
    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ok' });
    }
    if (method === 'GET' && pathname === '/api/auth/cursos') {
      return sendJson(res, 200, courses);
    }
    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readBody(req);
      const user = users.get((body.identificador || '').toLowerCase());
      if (!user || user.senha !== body.senha) {
        return sendJson(res, 401, { mensagem: 'Usuário ou senha incorretos.' });
      }
      return sendJson(res, 200, {
        token: user.token,
        usuario: { id: user.id, nome: user.nome, email: user.email, tipoPerfil: user.tipoPerfil, cursoId: user.cursoId },
      });
    }
    if (method === 'POST' && pathname === '/api/auth/registrar') {
      const body = await readBody(req);
      const email = (body.email || '').toLowerCase();
      if (users.has(email)) return sendJson(res, 409, { mensagem: 'Esse e-mail já está cadastrado.' });
      const id = ++nextId;
      const user = {
        id,
        nome: body.nome,
        email,
        senha: body.senha,
        tipoPerfil: body.tipoPerfil || 'estudante',
        cursoId: body.cursoId ?? null,
        token: `jwt-user-${id}`,
      };
      users.set(email, user);
      return sendJson(res, 201, {
        token: user.token,
        usuario: { id: user.id, nome: user.nome, email: user.email, tipoPerfil: user.tipoPerfil, cursoId: user.cursoId },
      });
    }

    // Protected routes
    const user = userByToken(req);
    if (!user) return sendJson(res, 401, { mensagem: 'Não autenticado.' });

    if (method === 'GET' && pathname === '/api/auth/eu') {
      return sendJson(res, 200, { id: user.id, nome: user.nome, email: user.email, tipoPerfil: user.tipoPerfil, cursoId: user.cursoId });
    }
    if (method === 'GET' && pathname === '/api/cursos') {
      return sendJson(res, 200, courses);
    }
    if (method === 'GET' && pathname === '/api/areas') {
      return sendJson(res, 200, areas);
    }
    if (method === 'GET' && pathname === '/api/questoes') {
      return sendJson(res, 200, {
        total: questions.length,
        itens: questions.map((q) => ({
          id: q.id,
          enunciado: q.enunciado,
          ano: q.ano,
          area: q.area,
          dificuldade: q.dificuldade,
          temJustificativa: q.alternativas.length === 5 && q.alternativas.every((a) => (a.explicacao || '').length >= 10),
        })),
      });
    }
    if (method === 'POST' && pathname === '/api/questoes') {
      const body = await readBody(req);
      const area = areas.find((a) => a.id === body.areaId);
      const id = ++nextId;
      const q = {
        id,
        enunciado: body.enunciado,
        ano: body.ano,
        areaId: body.areaId,
        area: area?.nome || 'Área',
        dificuldade: body.dificuldade,
        tipo: body.tipo || 'multipla_escolha',
        padraoResposta: body.padraoResposta || '',
        criadoPorId: user.id,
        status: 'rascunho',
        alternativas: [],
        comentarios: [],
      };
      questions.push(q);
      return sendJson(res, 201, q);
    }

    let m;
    if ((m = pathname.match(/^\/api\/questoes\/(\d+)$/)) && method === 'GET') {
      const q = questions.find((item) => item.id === Number(m[1]));
      if (!q) return sendJson(res, 404, { mensagem: 'Questão não encontrada.' });
      const hideKey = user.tipoPerfil === 'estudante';
      return sendJson(res, 200, {
        ...q,
        alternativas: q.alternativas.map((a) => ({
          ...a,
          ehCorreta: hideKey ? undefined : a.ehCorreta,
          explicacao: hideKey ? undefined : a.explicacao,
        })),
      });
    }
    if ((m = pathname.match(/^\/api\/questoes\/(\d+)$/)) && method === 'DELETE') {
      if (user.tipoPerfil !== 'professor') return sendJson(res, 403, { mensagem: 'Só o professor apaga questão.' });
      const idx = questions.findIndex((item) => item.id === Number(m[1]));
      if (idx === -1) return sendJson(res, 404, { mensagem: 'Questão não encontrada.' });
      questions.splice(idx, 1);
      return sendJson(res, 204);
    }
    if ((m = pathname.match(/^\/api\/questoes\/(\d+)\/alternativas$/)) && method === 'POST') {
      const q = questions.find((item) => item.id === Number(m[1]));
      const body = await readBody(req);
      const alt = { id: ++nextId, letra: body.letra, ordem: body.ordem, texto: body.texto, ehCorreta: Boolean(body.ehCorreta), explicacao: '' };
      q.alternativas.push(alt);
      return sendJson(res, 201, alt);
    }
    if ((m = pathname.match(/^\/api\/questoes\/(\d+)\/alternativas\/(\d+)\/justificativa$/)) && method === 'PUT') {
      const q = questions.find((item) => item.id === Number(m[1]));
      const alt = q?.alternativas.find((a) => a.id === Number(m[2]));
      const body = await readBody(req);
      if (alt) alt.explicacao = body.explicacao || '';
      return sendJson(res, 204);
    }
    if ((m = pathname.match(/^\/api\/questoes\/(\d+)\/publicar$/)) && method === 'POST') {
      const q = questions.find((item) => item.id === Number(m[1]));
      if (q) q.status = 'publicada';
      return sendJson(res, 204);
    }
    if ((m = pathname.match(/^\/api\/questoes\/(\d+)\/comentarios$/)) && method === 'GET') {
      const q = questions.find((item) => item.id === Number(m[1]));
      return sendJson(res, 200, q?.comentarios || []);
    }
    if ((m = pathname.match(/^\/api\/questoes\/(\d+)\/comentarios$/)) && method === 'POST') {
      const q = questions.find((item) => item.id === Number(m[1]));
      const body = await readBody(req);
      const comment = {
        id: ++nextId,
        autor: user.nome,
        papel: user.tipoPerfil,
        mensagem: body.mensagem,
        criadoEm: new Date().toISOString(),
      };
      q.comentarios.push(comment);
      return sendJson(res, 201, comment);
    }
    if ((m = pathname.match(/^\/api\/questoes\/(\d+)\/responder$/)) && method === 'POST') {
      const q = questions.find((item) => item.id === Number(m[1]));
      const body = await readBody(req);
      const correta = q.alternativas.find((a) => a.ehCorreta);
      const acertou = correta?.id === body.alternativaId;
      const metric = metrics.find((mt) => mt.area === q.area);
      if (metric) {
        metric.totalResolvidas += 1;
        if (acertou) metric.totalAcertos += 1;
        metric.percentualAcerto = Math.round((metric.totalAcertos / metric.totalResolvidas) * 100);
      }
      return sendJson(res, 200, {
        acertou,
        letraCorreta: correta?.letra || 'A',
        alternativas: q.alternativas,
      });
    }

    if (method === 'GET' && pathname === '/api/simulados') {
      return sendJson(res, 200, exams);
    }
    if (method === 'POST' && pathname === '/api/simulados') {
      const body = await readBody(req);
      const exam = {
        id: ++nextId,
        titulo: body.titulo,
        descricao: '',
        tempoLimiteMinutos: body.tempoLimiteMinutos || 30,
        quantidadeQuestoes: body.quantidadeQuestoes || 1,
        questaoIds: [],
      };
      exams.push(exam);
      return sendJson(res, 201, exam);
    }
    if ((m = pathname.match(/^\/api\/simulados\/(\d+)\/questoes$/)) && method === 'PUT') {
      const exam = exams.find((e) => e.id === Number(m[1]));
      const body = await readBody(req);
      exam.questaoIds = body.questaoIds || [];
      exam.quantidadeQuestoes = exam.questaoIds.length;
      return sendJson(res, 200, exam);
    }
    if ((m = pathname.match(/^\/api\/simulados\/(\d+)\/iniciar$/)) && method === 'POST') {
      const exam = exams.find((e) => e.id === Number(m[1]));
      const id = ++nextId;
      const attempt = {
        id,
        usuarioId: user.id,
        simuladoId: exam.id,
        simuladoTitulo: exam.titulo,
        modo: 'simulado',
        status: 'em_andamento',
        iniciadoEm: new Date().toISOString(),
        limiteEm: new Date(Date.now() + exam.tempoLimiteMinutos * 60 * 1000).toISOString(),
        tempoGastoSegundos: 0,
        notaTotal: 0,
        itens: exam.questaoIds.map((qid, idx) => {
          const q = questions.find((item) => item.id === qid);
          return {
            questaoId: q.id,
            ordem: idx + 1,
            enunciado: q.enunciado,
            alternativaSelecionadaId: null,
            acertou: false,
            alternativas: q.alternativas.map((a) => ({ id: a.id, letra: a.letra, ordem: a.ordem, texto: a.texto })),
          };
        }),
      };
      attempts.push(attempt);
      return sendJson(res, 200, attempt);
    }

    if (method === 'GET' && pathname === '/api/tentativas/minhas') {
      return sendJson(
        res,
        200,
        attempts
          .filter((a) => a.usuarioId === user.id)
          .map((a) => ({
            id: a.id,
            titulo: a.simuladoTitulo,
            modo: a.modo,
            status: a.status,
            iniciadoEm: a.iniciadoEm,
            notaTotal: a.notaTotal,
          })),
      );
    }
    if ((m = pathname.match(/^\/api\/tentativas\/(\d+)$/)) && method === 'GET') {
      const attempt = attempts.find((a) => a.id === Number(m[1]));
      if (!attempt) return sendJson(res, 404, { mensagem: 'Tentativa não encontrada.' });
      return sendJson(res, 200, attempt);
    }
    if ((m = pathname.match(/^\/api\/tentativas\/(\d+)\/respostas$/)) && method === 'POST') {
      const attempt = attempts.find((a) => a.id === Number(m[1]));
      const body = await readBody(req);
      const item = attempt.itens.find((i) => i.questaoId === body.questaoId);
      const q = questions.find((qq) => qq.id === body.questaoId);
      item.alternativaSelecionadaId = body.alternativaId;
      item.acertou = q.alternativas.some((a) => a.id === body.alternativaId && a.ehCorreta);
      return sendJson(res, 200, item);
    }
    if ((m = pathname.match(/^\/api\/tentativas\/(\d+)\/finalizar$/)) && method === 'POST') {
      const attempt = attempts.find((a) => a.id === Number(m[1]));
      attempt.status = 'finalizado';
      const correct = attempt.itens.filter((i) => i.acertou).length;
      attempt.notaTotal = Math.round((correct / Math.max(attempt.itens.length, 1)) * 100);
      attempt.tempoGastoSegundos = 45;
      attempt.itens = attempt.itens.map((i) => {
        const q = questions.find((qq) => qq.id === i.questaoId);
        return { ...i, alternativas: q.alternativas };
      });
      return sendJson(res, 200, attempt);
    }

    if (method === 'GET' && pathname === '/api/dashboard') {
      return sendJson(res, 200, metrics);
    }
    if (method === 'GET' && pathname === '/api/badges') {
      return sendJson(res, 200, badges);
    }
    if (method === 'POST' && pathname === '/api/trilhas/sugerir') {
      return sendJson(res, 200, {
        titulo: 'Trilha dos pontos fracos',
        questoes: [
          { area: 'Banco de Dados', dificuldade: 'medio', motivo: 'Revisar Banco de Dados' },
        ],
      });
    }

    return sendJson(res, 404, { mensagem: `Rota não mapeada: ${method} ${pathname}` });
  });

  return server;
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

  async waitForText(text, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await this.eval(`document.body.innerText.toLowerCase().includes(${JSON.stringify(text)}.toLowerCase())`);
      if (ok) return;
      await new Promise((r) => setTimeout(r, 120));
    }
    const snippet = await this.eval('document.body.innerText.slice(0, 600)');
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

async function waitForHttp(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
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
  const backend = createMockBackend();
  await new Promise((resolve) => backend.listen(API_PORT, '127.0.0.1', resolve));

  const frontProc = spawn(process.execPath, ['dist/server.js'], {
    cwd: FRONT_DIR,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(FRONT_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const chromeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unicolab-e2e-'));
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

    await test('1. Carregamento inicial, erro de login inválido e modal legal', async () => {
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${FRONT_PORT}/` });
      await cdp.waitForText('Bem-vindo de volta');
      await cdp.setInputValue('#unicolab-username', 'errado@edu.unifor.br');
      await cdp.setInputValue('#unicolab-password', 'wrongpass');
      await cdp.clickButton('Entrar na plataforma');
      await cdp.waitForText('Usuário ou senha incorretos.');
      await cdp.clickButton('Privacidade');
      await cdp.waitForText('A senha fica apenas como hash.');
      await cdp.clickButton('Fechar');
    });

    await test('2. Login do estudante, Dashboard, Banco de questões e Prática avulsa', async () => {
      await cdp.setInputValue('#unicolab-username', 'vladia@edu.unifor.br');
      await cdp.setInputValue('#unicolab-password', 'Password@123');
      await cdp.clickButton('Entrar na plataforma');
      await cdp.waitForText('Bem-vinda de volta, Vládia');
      await cdp.waitForText('Análise e Desenvolvimento de Sistemas');
      await cdp.waitForText('Iniciar Simulado ENADE ADS');

      await cdp.clickButton('Banco de questões');
      await cdp.waitForText('Provas da banca');
      await cdp.waitForText('padrão de projeto');
      await cdp.clickButton('Resolver questão');
      await cdp.waitForText('Prática avulsa');
      await cdp.waitForText('Singleton');
      await cdp.clickButton('Singleton');
      await cdp.clickButton('Finalizar Respostas');
      await cdp.waitForText('Parabéns, você acertou a questão!');
      await cdp.clickButton('Enviar e Ver Resultados');
      await cdp.waitForText('Bem-vinda de volta, Vládia');
    });

    await test('3. Simulado cronometrado + Explicação de erro por IA (/api/gemini/explicar)', async () => {
      await cdp.clickButton('Iniciar Simulado ENADE ADS');
      await cdp.waitForText('Mapa do Simulado');
      // Escolhe alternativa errada (A - Factory Method) na questão 1 para testar explicação de erro IA
      await cdp.clickButton('Factory Method');
      await cdp.clickButton('Próxima');
      await cdp.waitForText('Terceira Forma Normal');
      // Escolhe alternativa correta na questão 2
      await cdp.clickButton('Dependência funcional transitiva');
      await cdp.clickButton('Finalizar Respostas');
      await cdp.waitForText('Gabarito Comentado (Oficial)');
      await cdp.clickButton('Anterior');
      await cdp.waitForText('Que pena, resposta incorreta!');
      await cdp.clickButton('Explicar Meu Erro');
      await cdp.waitForText('análise oficial');
      await cdp.clickButton('Enviar e Ver Resultados');
      await cdp.waitForText('50%');
    });

    await test('4. Fórum de dúvidas (publicar comentário do estudante)', async () => {
      await cdp.clickButton('Fórum de dúvidas');
      await cdp.waitForText('Debates acadêmicos');
      await cdp.setInputValue('textarea', 'Comentário de teste E2E em JavaScript puro!');
      await cdp.clickButton('Publicar no fórum');
      await cdp.waitForText('Comentário de teste E2E em JavaScript puro!');
    });

    await test('5. Trilha IA personalizada (POST /api/trilhas/sugerir)', async () => {
      await cdp.clickButton('Trilha IA');
      await cdp.clickButton('Gerar minha trilha de estudo personalizada');
      await cdp.waitForText('Trilha dos pontos fracos');
      await cdp.waitForText('Revisar Banco de Dados');
    });

    await test('6. Logout do estudante + Login do professor + Painel docente', async () => {
      await cdp.clickAria('Sair');
      await cdp.waitForText('Bem-vindo de volta');
      await cdp.setInputValue('#unicolab-username', 'docente@edu.unifor.br');
      await cdp.setInputValue('#unicolab-password', 'Password@123');
      await cdp.clickButton('Entrar na plataforma');
      await cdp.waitForText('Olá, Prof. Carlos');
      await cdp.waitForText('Dúvidas aguardando o corpo docente');
    });

    await test('7. Professor cadastra nova questão (3 etapas), monta prova e salva configurações', async () => {
      await cdp.clickButton('Nova questão');
      await cdp.waitForText('Cadastrar nova questão ENADE');
      await cdp.setInputValue('textarea', 'Enunciado completo criado no teste E2E para validar fluxo docente em JavaScript.');
      await cdp.clickButton('Continuar para alternativas');
      await cdp.waitForText('Alternativas de resposta');

      const alts = ['Alternativa A válida', 'Alternativa B correta', 'Alternativa C distrator', 'Alternativa D distrator', 'Alternativa E distrator'];
      for (let i = 0; i < 5; i++) {
        await cdp.setInputValue(`input[placeholder="Conteúdo da alternativa ${String.fromCharCode(65 + i)}"]`, alts[i]);
      }
      await cdp.clickButton('Continuar para o gabarito');
      await cdp.waitForText('Gabarito e referências');

      for (let i = 0; i < 5; i++) {
        await cdp.clickAria(`Alternativa ${String.fromCharCode(65 + i)}`);
        await cdp.setInputValue('textarea[placeholder*="Explique esta alternativa"]', `Justificativa completa da alternativa ${String.fromCharCode(65 + i)} para o teste.`);
      }
      await cdp.clickAria('Alternativa B');
      await cdp.clickButton('Publicar questão');
      await cdp.waitForText('Questão cadastrada. Ela já entra no banco e nos simulados.');

      // Monta prova em Provas e listas
      await cdp.clickButton('Provas e listas');
      await cdp.waitForText('Nova lista');
      await cdp.setInputValue('input[placeholder="Revisão de padrões de projeto"]', 'Prova E2E JS');
      await cdp.eval(`document.querySelector('ul input[type="checkbox"]').click()`);
      await cdp.clickButton('Salvar prova');
      await cdp.waitForText('Prova gravada na API.');
      await cdp.waitForText('Prova E2E JS');

      // Configurações do professor
      await cdp.clickButton('Configurações');
      await cdp.waitForText('Dados da sessão docente');
      await cdp.clickButton('Salvar preferências');
      await cdp.waitForText('Preferências salvas neste navegador.');
    });

    await test('8. Cadastro de novo estudante (@edu.unifor.br) via API', async () => {
      await cdp.clickButton('Sair da conta');
      await cdp.waitForText('Bem-vindo de volta');
      await cdp.clickButton('Criar conta');
      await cdp.waitForText('Qualquer e-mail @edu.unifor.br cria a conta de aluno na hora.');
      await cdp.waitForText('Análise e Desenvolvimento de Sistemas');

      await cdp.setInputValue('input[placeholder="Vládia"]', 'Matheus Teste');
      await cdp.setInputValue('input[placeholder="nome@edu.unifor.br"]', 'matheus.e2e@edu.unifor.br');
      await cdp.setInputValue('input[placeholder="2214587"]', '2410999');
      await cdp.eval(`(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        for (const el of inputs) {
          setter.call(el, 'SenhaForte@2026');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        document.querySelector('input[type="checkbox"]').click();
      })()`);
      await cdp.clickButton('Criar minha conta');
      await cdp.waitForText('Bem-vindo de volta, Matheus Teste');
    });

    if (cdp.errors.length > 0) {
      throw new Error(`Erros de runtime/console detectados no navegador:\n${cdp.errors.join('\n')}`);
    }

    console.log(`\n✅ TODOS OS ${results.length} CENÁRIOS E2E PASSARAM SEM ERROS DE CONSOLE OU RUNTIME!`);
  } finally {
    cdp?.close();
    chromeProc.kill();
    frontProc.kill();
    backend.close();
    setTimeout(() => {
      try { fs.rmSync(chromeDir, { recursive: true, force: true }); } catch {}
    }, 300);
  }
}

main().catch((err) => {
  console.error('\n❌ FALHA NO TESTE E2E:', err);
  process.exit(1);
});
