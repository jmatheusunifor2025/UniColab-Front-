import { api, apiBaseUrl, clearToken, errorMessage, readToken, writeToken } from './client';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function difficulty(value) {
  if (value === 'facil' || value === 'medio' || value === 'dificil') return value;
  return 'medio';
}

function letterIndex(letra) {
  const index = LETTERS.indexOf((letra ?? '').trim().toUpperCase());
  return index;
}

function ordered(alternativas) {
  return [...(alternativas ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

function toSession(usuario, course) {
  return {
    id: usuario.id ?? 0,
    username: usuario.email || String(usuario.id ?? ''),
    displayName: usuario.nome || 'Usuário',
    role: usuario.tipoPerfil === 'estudante' ? 'student' : 'teacher',
    course,
  };
}

async function courseName(cursoId) {
  if (cursoId == null) return 'Instituição';
  const { data, response } = await api.GET('/api/cursos');
  if (!response.ok || !data) return 'Instituição';
  return data.find((curso) => curso.id === cursoId)?.nome || 'Instituição';
}

export async function listPublicCourses() {
  const { data, error, response } = await api.GET('/api/auth/cursos');
  if (!response.ok || !data) throw new Error(errorMessage(error, 'Não foi possível carregar os cursos.'));
  return data
    .filter((curso) => curso.id != null && Boolean(curso.nome))
    .map((curso) => ({ id: curso.id, nome: curso.nome }));
}

export async function registerAccount(input) {
  const { data, error, response } = await api.POST('/api/auth/registrar', {
    body: {
      nome: input.nome,
      email: input.email,
      senha: input.senha,
      tipoPerfil: input.tipoPerfil,
      matricula: input.matricula,
      cursoId: input.cursoId,
    },
  });
  if (!response.ok || !data?.token || !data.usuario) {
    throw new Error(errorMessage(error, 'Não foi possível criar a conta.'));
  }
  writeToken(data.token, input.persist);
  return toSession(data.usuario, await courseName(data.usuario.cursoId));
}

export async function signIn(identificador, senha, persist) {
  const { data, error, response } = await api.POST('/api/auth/login', {
    body: { identificador, senha },
  });
  if (!response.ok || !data?.token || !data.usuario) {
    throw new Error(errorMessage(error, 'Usuário ou senha incorretos.'));
  }
  writeToken(data.token, persist);
  return toSession(data.usuario, await courseName(data.usuario.cursoId));
}

export async function currentUser() {
  if (!readToken()) return null;
  const { data, response } = await api.GET('/api/auth/eu');
  if (!response.ok || !data) {
    clearToken();
    return null;
  }
  return toSession(data, await courseName(data.cursoId));
}

export function signOut() {
  clearToken();
}

export async function loadAreas() {
  const { data, error, response } = await api.GET('/api/areas');
  if (!response.ok || !data) throw new Error(errorMessage(error, 'Não foi possível carregar as áreas.'));
  return data
    .filter((area) => area.id != null && Boolean(area.nome))
    .map((area) => ({ id: area.id, nome: area.nome, componente: area.componente || 'componente_especifico' }));
}

function mapComments(items) {
  return (items ?? []).map((item) => ({
    id: String(item.id ?? ''),
    userName: item.autor || 'Usuário',
    role: item.papel === 'estudante' ? 'student' : 'teacher',
    text: item.mensagem || '',
    timestamp: item.criadoEm
      ? new Date(item.criadoEm).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })
      : '',
  }));
}

function mapQuestion(detalhe, componente, comments, hasJustification = false) {
  if (detalhe.id == null) return null;
  const alternativas = ordered(detalhe.alternativas);
  const correct = alternativas.findIndex((item) => item.ehCorreta === true);
  const justifications = alternativas.map((item) => item.explicacao || '');
  const commentary = justifications.filter(Boolean).join('\n');
  const explained = alternativas.length === 5 && justifications.filter((text) => text.trim().length >= 10).length === 5;
  return {
    id: String(detalhe.id),
    text: detalhe.enunciado || '',
    type: componente === 'formacao_geral' ? 'geral' : 'especifico',
    area: detalhe.area || 'Área',
    year: detalhe.ano ?? 0,
    difficulty: difficulty(detalhe.dificuldade),
    alternatives: alternativas.map((item) => item.texto || ''),
    alternativeIds: alternativas.map((item) => item.id ?? 0),
    correctAlternative: correct,
    justifications,
    hasJustification: hasJustification || explained,
    commentary,
    references: detalhe.padraoResposta || '',
    comments,
    authorId: detalhe.criadoPorId,
  };
}

export async function deleteQuestion(id) {
  const headers = new Headers();
  const token = readToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl}/api/questoes/${id}`, { method: 'DELETE', headers });
  if (response.ok) return;
  let message = 'Não foi possível apagar a questão.';
  try {
    message = errorMessage(await response.json(), message);
  } catch {
    message = response.status === 403 ? 'Só o professor apaga questão do banco.' : message;
  }
  throw new Error(message);
}

export async function loadQuestions() {
  const areas = await loadAreas();
  const componente = new Map(areas.map((area) => [area.id, area.componente]));
  const itens = [];
  let pagina = 1;
  let total = 0;
  do {
    const { data, error, response } = await api.GET('/api/questoes', {
      params: { query: { pagina, tamanho: 50 } },
    });
    if (!response.ok || !data) throw new Error(errorMessage(error, 'Não foi possível carregar o banco de questões.'));
    itens.push(...(data.itens ?? []));
    total = data.total ?? itens.length;
    pagina += 1;
  } while (itens.length < total && pagina < 20);

  const questions = await Promise.all(
    itens.map(async (item) => {
      if (item.id == null) return null;
      const [detail, comments] = await Promise.all([
        api.GET('/api/questoes/{id}', { params: { path: { id: item.id } } }),
        api.GET('/api/questoes/{questaoId}/comentarios', { params: { path: { questaoId: item.id } } }),
      ]);
      if (!detail.response.ok || !detail.data) return null;
      return mapQuestion(
        detail.data,
        componente.get(detail.data.areaId ?? -1) || 'componente_especifico',
        comments.response.ok ? mapComments(comments.data) : [],
        item.temJustificativa === true,
      );
    }),
  );

  return questions.filter((question) => question !== null);
}

export async function addComment(questionId, mensagem) {
  const { error, response } = await api.POST('/api/questoes/{questaoId}/comentarios', {
    params: { path: { questaoId: Number(questionId) } },
    body: { mensagem },
  });
  if (!response.ok) throw new Error(errorMessage(error, 'Falha ao publicar comentário.'));
}

function commentaryFrom(alternativas) {
  return ordered(alternativas)
    .map((item) => (item.explicacao ? `${item.letra}. ${item.explicacao}` : ''))
    .filter(Boolean)
    .join('\n');
}

export async function gradePractice(questions, answers, elapsedSeconds) {
  const answered = questions.filter((question) => answers[question.id] !== undefined);
  const slice = Math.max(1, Math.round(elapsedSeconds / Math.max(answered.length, 1)));
  const key = {};
  const notes = {};

  for (const question of answered) {
    const index = answers[question.id];
    if (index === undefined) continue;
    const alternativaId = question.alternativeIds?.[index];
    if (!alternativaId) continue;
    const { data, error, response } = await api.POST('/api/questoes/{id}/responder', {
      params: { path: { id: Number(question.id) } },
      body: { alternativaId, tempoSegundos: slice },
    });
    if (!response.ok || !data) throw new Error(errorMessage(error, 'Não foi possível registrar a resposta.'));
    const corretaId = data.alternativas?.find((item) => item.ehCorreta)?.id;
    const found = corretaId != null ? (question.alternativeIds ?? []).indexOf(corretaId) : -1;
    key[question.id] = found >= 0 ? found : letterIndex(data.letraCorreta);
    notes[question.id] = commentaryFrom(data.alternativas);
  }

  return { key, notes };
}

export async function loadStudentStats() {
  const [dashboard, badges, attempts] = await Promise.all([
    api.GET('/api/dashboard'),
    api.GET('/api/badges'),
    api.GET('/api/tentativas/minhas'),
  ]);
  if (!dashboard.response.ok || !dashboard.data) throw new Error(errorMessage(dashboard.error, 'Não foi possível carregar o painel.'));
  if (!badges.response.ok || !badges.data) throw new Error(errorMessage(badges.error, 'Não foi possível carregar as medalhas.'));
  if (!attempts.response.ok || !attempts.data) throw new Error(errorMessage(attempts.error, 'Não foi possível carregar as tentativas.'));

  const orderedAttempts = [...attempts.data].sort((a, b) => (b.iniciadoEm || '').localeCompare(a.iniciadoEm || ''));
  const details = await Promise.all(
    orderedAttempts.map(async (item) => {
      if (item.id == null) return null;
      const detail = await api.GET('/api/tentativas/{id}', { params: { path: { id: item.id } } });
      return detail.response.ok ? detail.data : null;
    }),
  );
  const history = orderedAttempts.map((item, index) => {
    const detail = details[index];
    const itens = detail?.itens ?? [];
    const correctAnswers = itens.filter((entry) => entry.acertou === true).length;
    return {
      id: String(item.id ?? ''),
      title: item.titulo || (item.modo === 'pratica' ? 'Prática avulsa' : 'Simulado'),
      date: item.iniciadoEm ? new Date(item.iniciadoEm).toLocaleDateString('pt-BR') : '',
      durationSeconds: detail?.tempoGastoSegundos ?? 0,
      totalQuestions: itens.length,
      correctAnswers,
      scorePercent: Math.round(item.notaTotal ?? detail?.notaTotal ?? 0),
      areasStats: {},
    };
  });

  const resolved = dashboard.data.reduce((sum, item) => sum + (item.totalResolvidas ?? 0), 0);
  const correct = dashboard.data.reduce((sum, item) => sum + (item.totalAcertos ?? 0), 0);

  return {
    points: badges.data.reduce((sum, item) => sum + (item.pontos ?? 0), 0),
    completedQuestionsCount: resolved,
    correctCount: correct,
    history,
    badges: badges.data.map((item) => ({
      id: item.codigo || item.nome || 'badge',
      title: item.nome || 'Medalha',
      description: item.descricao || '',
      icon: 'Award',
      unlockedAt: item.concedidoEm ? new Date(item.concedidoEm).toLocaleDateString('pt-BR') : undefined,
    })),
    areas: dashboard.data.map((item) => ({
      name: item.area || 'Área',
      score: Math.round(item.percentualAcerto ?? 0),
    })),
  };
}

export async function suggestTrailText(studentName) {
  const { data, error, response } = await api.POST('/api/trilhas/sugerir');
  if (!response.ok || !data) throw new Error(errorMessage(error, 'Não foi possível sugerir a trilha.'));
  const lines = (data.questoes ?? []).map((item, index) => {
    const area = item.area || 'Área';
    const level = item.dificuldade || 'medio';
    const reason = item.motivo || 'revisar este ponto';
    return `${index + 1}. ${area} (${level}) — ${reason}`;
  });
  const title = data.titulo || 'Trilha de estudo';
  if (lines.length === 0) {
    return `${title}\n\nAinda não há questões suficientes para montar a trilha de ${studentName}. Resolva itens do banco e gere de novo.`;
  }
  return [`${title}`, `Plano de ${studentName}`, '', ...lines].join('\n');
}

export async function createQuestion(input) {
  const areas = await loadAreas();
  const key = input.area.trim().toLowerCase();
  const area = areas.find((item) => item.nome.toLowerCase() === key);
  if (!area) throw new Error('Escolha uma área cadastrada no acervo.');

  const created = await api.POST('/api/questoes', {
    body: {
      enunciado: input.text,
      ano: input.year,
      areaId: area.id,
      dificuldade: input.difficulty,
      tipo: 'multipla_escolha',
      padraoResposta: input.references || null,
    },
  });
  if (!created.response.ok || created.data?.id == null) {
    throw new Error(errorMessage(created.error, 'Falha ao cadastrar a questão.'));
  }

  const questaoId = created.data.id;
  for (let index = 0; index < input.alternatives.length; index += 1) {
    const saved = await api.POST('/api/questoes/{id}/alternativas', {
      params: { path: { id: questaoId } },
      body: {
        letra: LETTERS[index] || String(index + 1),
        ordem: index + 1,
        texto: input.alternatives[index] || '',
        ehCorreta: index === input.correctAlternative,
      },
    });
    if (!saved.response.ok || saved.data?.id == null) {
      throw new Error(errorMessage(saved.error, 'Falha ao gravar uma alternativa.'));
    }
    const note = await api.PUT('/api/questoes/{questaoId}/alternativas/{alternativaId}/justificativa', {
      params: { path: { questaoId, alternativaId: saved.data.id } },
      body: { explicacao: (input.justifications[index] || '').trim() },
    });
    if (!note.response.ok) throw new Error(errorMessage(note.error, 'Falha ao gravar a justificativa.'));
  }

  const published = await api.POST('/api/questoes/{id}/publicar', {
    params: { path: { id: questaoId } },
  });
  if (!published.response.ok) throw new Error(errorMessage(published.error, 'A questão foi gravada, mas não foi publicada.'));
}

export async function listExams() {
  const { data, error, response } = await api.GET('/api/simulados');
  if (!response.ok || !data) throw new Error(errorMessage(error, 'Não foi possível carregar as provas.'));
  return data.map((item) => ({
    id: String(item.id ?? ''),
    title: item.titulo || 'Simulado',
    minutes: item.tempoLimiteMinutos ?? 0,
    questionCount: item.quantidadeQuestoes ?? item.questaoIds?.length ?? 0,
    questionIds: (item.questaoIds ?? []).map(String),
    personal: item.descricao === 'simulado-do-aluno',
  }));
}

export async function createPersonalExam(quantidade) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = readToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl}/api/simulados/pessoal`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ quantidade }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.id == null) {
    throw new Error(errorMessage(body, 'Não foi possível criar o simulado.'));
  }
  return {
    id: String(body.id),
    title: body.titulo || `Meu simulado de ${quantidade} questões`,
    minutes: body.tempoLimiteMinutos ?? quantidade * 4,
    questionCount: body.quantidadeQuestoes ?? body.questaoIds?.length ?? quantidade,
    questionIds: (body.questaoIds ?? []).map(String),
    personal: true,
  };
}

function sheetQuestion(item, known) {
  const alternativas = ordered(item.alternativas);
  const correct = alternativas.findIndex((entry) => entry.ehCorreta === true);
  return {
    id: String(item.questaoId ?? ''),
    text: item.enunciado || known?.text || '',
    type: known?.type || 'especifico',
    area: known?.area || 'Área',
    year: known?.year || 0,
    difficulty: known?.difficulty || 'medio',
    alternatives: alternativas.map((entry) => entry.texto || ''),
    alternativeIds: alternativas.map((entry) => entry.id ?? 0),
    correctAlternative: correct,
    commentary: alternativas
      .map((entry) => entry.explicacao)
      .filter((entry) => Boolean(entry))
      .join('\n'),
    references: known?.references || '',
    comments: known?.comments || [],
    authorId: known?.authorId,
  };
}

function mapAttempt(data, known, resumed) {
  const byId = new Map(known.map((question) => [question.id, question]));
  return {
    attemptId: data.id ?? 0,
    simuladoId: data.simuladoId ?? 0,
    title: data.simuladoTitulo || 'Simulado',
    startedAt: data.iniciadoEm || new Date().toISOString(),
    deadline: data.limiteEm || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    questions: (data.itens ?? []).map((item) => sheetQuestion(item, byId.get(String(item.questaoId ?? '')))),
    resumed,
  };
}

async function openAttempt(known) {
  const listed = await api.GET('/api/tentativas/minhas');
  if (!listed.response.ok || !listed.data) return null;
  const open = listed.data.find((item) => item.status === 'em_andamento' && item.modo === 'simulado' && item.id != null);
  if (!open?.id) return null;
  const detail = await api.GET('/api/tentativas/{id}', { params: { path: { id: open.id } } });
  if (!detail.response.ok || !detail.data) return null;
  return mapAttempt(detail.data, known, true);
}

export async function startExam(simuladoId, known) {
  const started = await api.POST('/api/simulados/{id}/iniciar', {
    params: { path: { id: simuladoId } },
  });
  if (started.response.ok && started.data) return mapAttempt(started.data, known, false);
  const message = errorMessage(started.error, 'Não foi possível iniciar o simulado.');
  if (/andamento/i.test(message)) {
    const open = await openAttempt(known);
    if (open) return open;
  }
  throw new Error(message);
}

export async function submitExam(attemptId, questions, answers, elapsedSeconds) {
  const answered = questions.filter((question) => answers[question.id] !== undefined);
  const slice = Math.max(1, Math.round(elapsedSeconds / Math.max(answered.length, 1)));
  for (const question of answered) {
    const alternativaId = question.alternativeIds?.[answers[question.id]];
    if (!alternativaId) continue;
    const saved = await api.POST('/api/tentativas/{id}/respostas', {
      params: { path: { id: attemptId } },
      body: { questaoId: Number(question.id), alternativaId, tempoSegundos: slice },
    });
    if (!saved.response.ok) throw new Error(errorMessage(saved.error, 'Não foi possível gravar a resposta.'));
  }
  const finished = await api.POST('/api/tentativas/{id}/finalizar', {
    params: { path: { id: attemptId } },
  });
  if (!finished.response.ok || !finished.data) {
    throw new Error(errorMessage(finished.error, 'Não foi possível finalizar o simulado.'));
  }
  const key = {};
  const notes = {};
  for (const item of finished.data.itens ?? []) {
    const question = questions.find((entry) => entry.id === String(item.questaoId ?? ''));
    const alternativas = ordered(item.alternativas);
    const corretaId = alternativas.find((entry) => entry.ehCorreta)?.id;
    const ids = question?.alternativeIds ?? alternativas.map((entry) => entry.id ?? 0);
    const found = corretaId != null ? ids.indexOf(corretaId) : -1;
    const id = String(item.questaoId ?? '');
    key[id] = found >= 0 ? found : letterIndex(alternativas.find((entry) => entry.ehCorreta)?.letra);
    notes[id] = commentaryFrom(alternativas);
  }
  return { key, notes };
}

export async function closeExam(attemptId) {
  const finished = await api.POST('/api/tentativas/{id}/finalizar', {
    params: { path: { id: attemptId } },
  });
  if (finished.response.ok) return;
  const message = errorMessage(finished.error, 'Não foi possível encerrar o simulado.');
  if (/encerrada/i.test(message)) return;
  throw new Error(message);
}

export async function createExam(title, minutes, questionIds) {
  const created = await api.POST('/api/simulados', {
    body: {
      titulo: title,
      modoComposicao: 'fixo',
      tempoLimiteMinutos: minutes,
      quantidadeQuestoes: questionIds.length,
    },
  });
  if (!created.response.ok || created.data?.id == null) {
    throw new Error(errorMessage(created.error, 'Falha ao criar a prova.'));
  }
  const defined = await api.PUT('/api/simulados/{id}/questoes', {
    params: { path: { id: created.data.id } },
    body: { questaoIds: questionIds.map(Number) },
  });
  if (!defined.response.ok || !defined.data) {
    throw new Error(errorMessage(defined.error, 'A prova foi criada, mas as questões não foram vinculadas.'));
  }
  return {
    id: String(defined.data.id ?? created.data.id),
    title: defined.data.titulo || title,
    minutes: defined.data.tempoLimiteMinutos ?? minutes,
    questionCount: defined.data.quantidadeQuestoes ?? questionIds.length,
    questionIds: (defined.data.questaoIds ?? questionIds.map(Number)).map(String),
  };
}
