import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, UserRound, Hash, BookOpen, Sparkles, Check, ArrowRight, AlertCircle } from 'lucide-react';
import { SessionUser } from '../types';
import { listPublicCourses, registerAccount, signIn } from '../api/unicolab';

const INSTITUTIONAL_EMAIL = /^[^\s@]+@edu\.unifor\.br$/i;

interface LoginProps {
  onLogin: (user: SessionUser, persist: boolean) => void;
}

type AuthMode = 'login' | 'register' | 'register-teacher' | 'forgot';
type LegalKind = 'privacidade' | 'termos' | 'ajuda' | null;

function passwordScore(password: string) {
  const rules = [
    { ok: password.length >= 12, label: '12+ caracteres' },
    { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), label: 'Letras maiúsculas e minúsculas' },
    { ok: /\d/.test(password), label: 'Números' },
    { ok: /[^A-Za-z0-9]/.test(password), label: 'Símbolos (@ # ! $)' },
  ];
  const score = rules.filter((rule) => rule.ok).length;
  const label = ['Muito fraca', 'Fraca', 'Razoável', 'Forte', 'Muito forte'][score];
  return { rules, score, label };
}

export default function Login({ onLogin }: LoginProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [persist, setPersist] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [legal, setLegal] = useState<LegalKind>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [courses, setCourses] = useState<Array<{ id: number; nome: string }>>([]);
  const [course, setCourse] = useState('');
  const [department, setDepartment] = useState('');
  const [enrollment, setEnrollment] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const strength = useMemo(() => passwordScore(password), [password]);
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === password;

  useEffect(() => {
    if (mode !== 'register' && mode !== 'register-teacher') return;
    let active = true;
    listPublicCourses()
      .then((items) => {
        if (!active) return;
        setCourses(items);
        setCourse((current) => current || String(items[0]?.id ?? ''));
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Não foi possível carregar os cursos.');
      });
    return () => {
      active = false;
    };
  }, [mode]);

  const enter = (user: SessionUser, keep: boolean) => {
    onLogin(user, keep);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 450));

    try {
      const user = await signIn(username.trim(), password, persist);
      enter(user, persist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Usuário ou senha incorretos.');
      setLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInfo('');

    const name = fullName.trim();
    const mail = email.toLowerCase().trim();
    if (name.length < 3) {
      setError('Informe o nome completo.');
      return;
    }
    if (!INSTITUTIONAL_EMAIL.test(mail)) {
      setError('Use um e-mail @edu.unifor.br.');
      return;
    }
    if (!course) {
      setError('Escolha um curso.');
      return;
    }
    if (!enrollment.trim()) {
      setError('Informe a matrícula.');
      return;
    }
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (!acceptedTerms) {
      setError('Aceite os termos para criar a conta.');
      return;
    }

    setLoading(true);
    try {
      const user = await registerAccount({
        nome: name,
        email: mail,
        senha: password,
        tipoPerfil: 'estudante',
        matricula: enrollment.trim(),
        cursoId: Number(course),
        persist: true,
      });
      enter(user, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a conta.');
      setLoading(false);
    }
  };

  const handleRegisterTeacher = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInfo('');

    const name = fullName.trim();
    const mail = email.toLowerCase().trim();
    if (name.length < 3) {
      setError('Informe o nome completo.');
      return;
    }
    if (!INSTITUTIONAL_EMAIL.test(mail)) {
      setError('Use um e-mail @edu.unifor.br.');
      return;
    }
    if (!enrollment.trim()) {
      setError('Informe o número da Carteira Nacional Docente do Brasil (CNDB).');
      return;
    }
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (!acceptedTerms) {
      setError('Aceite os termos para criar a conta.');
      return;
    }

    setLoading(true);
    try {
      const user = await registerAccount({
        nome: name,
        email: mail,
        senha: password,
        tipoPerfil: 'professor',
        matricula: enrollment.trim(),
        cursoId: department ? Number(department) : null,
        persist: true,
      });
      enter(user, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a conta.');
      setLoading(false);
    }
  };

  const handleForgot = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const key = username.toLowerCase().trim();
    if (!key) {
      setError('Informe o usuário ou o e-mail.');
      return;
    }
    setInfo('A recuperação de senha é feita pela coordenação.');
  };

  return (
    <div className="min-h-screen bg-[#eef0f6] p-3 sm:p-4 text-ink">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1240px] lg:grid-cols-2 lg:gap-4">
        <aside className="relative hidden overflow-hidden rounded-[28px] bg-[linear-gradient(160deg,#24145f_0%,#3d2294_48%,#6846e4_100%)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -right-16 top-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-10 left-10 h-40 w-40 rounded-full bg-fuchsia-300/20 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-lg font-extrabold ring-1 ring-white/25">
              U
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight">UniColab</span>
                <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide ring-1 ring-white/20">ENADE</span>
              </div>
              <p className="text-[11px] text-white/70">Plataforma de estudos</p>
            </div>
          </div>

          <div className="relative max-w-md space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wide ring-1 ring-white/15">
              <Sparkles className="h-3.5 w-3.5" />
              Plataforma inteligente
            </span>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight xl:text-5xl">
              {mode === 'register' ? (
                <>
                  Crie sua conta e<br />
                  <span className="text-[#c9d4ff]">comece a treinar</span>
                </>
              ) : mode === 'register-teacher' ? (
                <>
                  Crie sua conta e<br />
                  <span className="text-[#c9d4ff]">entre como professor</span>
                </>
              ) : (
                <>
                  Prepare-se para o<br />
                  <span className="text-[#c9d4ff]">ENADE</span>
                </>
              )}
            </h1>
            <p className="max-w-sm text-sm leading-relaxed text-white/75">
              {mode === 'register-teacher'
                ? 'Cadastre o acesso docente para o banco de questões, as provas, o fórum e o painel do professor.'
                : 'Banco de questões, simulados cronometrados, fórum de dúvidas e uma trilha que se adapta ao seu ritmo — tudo em um só lugar.'}
            </p>

            <div className="rounded-2xl bg-[#1b1148]/55 p-4 ring-1 ring-white/10 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between text-[11px] text-white/70">
                <span>Questão 12 · Engenharia de Software</span>
                <span>02:14</span>
              </div>
              <p className="text-sm font-semibold leading-snug">
                Qual padrão de projeto garante que uma classe tenha apenas uma instância?
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="rounded-xl bg-white/8 px-3 py-2 text-white/80 ring-1 ring-white/10">A &nbsp; Factory Method</div>
                <div className="flex items-center justify-between rounded-xl bg-emerald-400/15 px-3 py-2 text-emerald-100 ring-1 ring-emerald-300/40">
                  <span>B &nbsp; Singleton</span>
                  <Check className="h-4 w-4" />
                </div>
                <div className="rounded-xl bg-white/8 px-3 py-2 text-white/80 ring-1 ring-white/10">C &nbsp; Observer</div>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/70">
                <Sparkles className="h-3.5 w-3.5" />
                A IA explica por que a alternativa B está correta
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
            {[
              ['200+', 'Questões'],
              ['50+', 'Simulados'],
              ['1.2k', 'Alunos ativos'],
            ].map(([value, label]) => (
              <div key={label}>
                <p className="text-2xl font-extrabold">{value}</p>
                <p className="text-xs text-white/60">{label}</p>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex flex-col px-4 py-5 sm:px-8 lg:px-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-sm font-extrabold text-white">U</div>
              <span className="font-extrabold">UniColab</span>
            </div>
            <p className="ml-auto text-sm text-slate-500">
              {mode === 'login' ? (
                <>
                  Novo por aqui?{' '}
                  <button type="button" className="font-semibold text-brand" onClick={() => { setMode('register'); setError(''); setInfo(''); }}>
                    Criar conta
                  </button>
                  <span className="mx-1 text-slate-300">·</span>
                  <button type="button" className="font-semibold text-brand" onClick={() => { setMode('register-teacher'); setError(''); setInfo(''); }}>
                    Criar conta de professor
                  </button>
                </>
              ) : (
                <>
                  Já tem uma conta?{' '}
                  <button type="button" className="font-semibold text-brand" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>
                    Entrar
                  </button>
                </>
              )}
            </p>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
            {mode === 'login' && (
              <>
                <h2 className="text-3xl font-extrabold tracking-tight">Bem-vindo de volta</h2>
                <p className="mt-2 text-sm text-slate-500">Entre com seu usuário institucional para continuar sua preparação.</p>
                <form onSubmit={handleLogin} className="mt-8 space-y-4" noValidate>
                  <Field label="Usuário" icon={<UserRound className="h-4 w-4" />}>
                    <input
                      id="unicolab-username"
                      autoComplete="username"
                      value={username}
                      onChange={(event) => { setUsername(event.target.value); setError(''); }}
                      placeholder="nome@edu.unifor.br"
                      className="h-12 w-full bg-transparent text-sm outline-none"
                      required
                    />
                  </Field>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="unicolab-password" className="text-sm font-medium text-slate-700">Senha</label>
                      <button type="button" className="text-sm font-medium text-brand" onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}>
                        Esqueci minha senha
                      </button>
                    </div>
                    <Field icon={<Lock className="h-4 w-4" />} trailing={
                      <button type="button" className="text-slate-400" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }>
                      <input
                        id="unicolab-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => { setPassword(event.target.value); setError(''); }}
                        className="h-12 w-full bg-transparent text-sm outline-none"
                        required
                      />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={persist} onChange={(event) => setPersist(event.target.checked)} className="h-4 w-4 accent-brand" />
                    Manter conectado neste dispositivo
                  </label>
                  {error && <Alert text={error} />}
                  <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white shadow-[0_8px_20px_rgba(109,74,255,0.28)] hover:bg-brand-dark disabled:opacity-60">
                    {loading ? 'Entrando...' : 'Entrar na plataforma'}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>
              </>
            )}

            {mode === 'register' && (
              <>
                <h2 className="text-3xl font-extrabold tracking-tight">Criar conta</h2>
                <p className="mt-2 text-sm text-slate-500">Qualquer e-mail @edu.unifor.br cria a conta de aluno na hora.</p>
                <form onSubmit={handleRegister} className="mt-7 space-y-4" noValidate>
                  <Labeled label="Nome completo">
                    <Field icon={<UserRound className="h-4 w-4" />}>
                      <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Vládia" className="h-12 w-full bg-transparent text-sm outline-none" />
                    </Field>
                  </Labeled>
                  <Labeled label="E-mail institucional">
                    <Field icon={<Mail className="h-4 w-4" />}>
                      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@edu.unifor.br" className="h-12 w-full bg-transparent text-sm outline-none" />
                    </Field>
                  </Labeled>
                  <div className="grid grid-cols-2 gap-3">
                    <Labeled label="Curso">
                      <Field icon={<BookOpen className="h-4 w-4" />}>
                        <select value={course} onChange={(event) => setCourse(event.target.value)} className="h-12 w-full bg-transparent text-sm outline-none">
                          {courses.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                        </select>
                      </Field>
                    </Labeled>
                    <Labeled label="Matrícula">
                      <Field icon={<Hash className="h-4 w-4" />}>
                        <input value={enrollment} onChange={(event) => setEnrollment(event.target.value)} placeholder="2214587" className="h-12 w-full bg-transparent text-sm outline-none" />
                      </Field>
                    </Labeled>
                  </div>
                  <Labeled label="Senha">
                    <Field icon={<Lock className="h-4 w-4" />} trailing={
                      <button type="button" className="text-slate-400" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }>
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full bg-transparent text-sm outline-none" />
                    </Field>
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {[0, 1, 2, 3].map((index) => (
                        <span key={index} className={`h-1.5 rounded-full ${index < strength.score ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Força da senha</span>
                      <span className={strength.score >= 3 ? 'font-semibold text-emerald-600' : 'text-slate-500'}>{password ? strength.label : ''}</span>
                    </div>
                    <ul className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-500">
                      {strength.rules.map((rule) => (
                        <li key={rule.label} className={rule.ok ? 'text-emerald-600' : ''}>{rule.ok ? '●' : '○'} {rule.label}</li>
                      ))}
                    </ul>
                  </Labeled>
                  <Labeled label="Confirmar senha">
                    <Field icon={<Lock className="h-4 w-4" />} trailing={passwordsMatch ? <Check className="h-4 w-4 text-emerald-500" /> : null}>
                      <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-12 w-full bg-transparent text-sm outline-none" />
                    </Field>
                    {passwordsMatch && <p className="mt-1 text-xs text-emerald-600">As senhas coincidem</p>}
                  </Labeled>
                  <label className="flex items-start gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
                    <span>
                      Li e aceito os{' '}
                      <button type="button" className="font-semibold text-brand" onClick={() => setLegal('termos')}>Termos de uso</button>
                      {' '}e a{' '}
                      <button type="button" className="font-semibold text-brand" onClick={() => setLegal('privacidade')}>Política de privacidade</button>
                      {' '}da UniColab.
                    </span>
                  </label>
                  {error && <Alert text={error} />}
                  <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                    {loading ? 'Criando conta...' : 'Criar minha conta'}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>
              </>
            )}

            {mode === 'register-teacher' && (
              <>
                <h2 className="text-3xl font-extrabold tracking-tight">Criar conta de professor</h2>
                <p className="mt-2 text-sm text-slate-500">Qualquer e-mail @edu.unifor.br cria a conta de professor na hora.</p>
                <form onSubmit={handleRegisterTeacher} className="mt-7 space-y-4" noValidate>
                  <Labeled label="Nome completo">
                    <Field icon={<UserRound className="h-4 w-4" />}>
                      <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nome e sobrenome" className="h-12 w-full bg-transparent text-sm outline-none" />
                    </Field>
                  </Labeled>
                  <Labeled label="E-mail institucional">
                    <Field icon={<Mail className="h-4 w-4" />}>
                      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@edu.unifor.br" className="h-12 w-full bg-transparent text-sm outline-none" />
                    </Field>
                  </Labeled>
                  <Labeled label="Área">
                    <Field icon={<BookOpen className="h-4 w-4" />}>
                      <select value={department} onChange={(event) => setDepartment(event.target.value)} className="h-12 w-full bg-transparent text-sm outline-none">
                        <option value="">Todos os cursos</option>
                        {courses.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                      </select>
                    </Field>
                  </Labeled>
                  <Labeled label="Carteira Nacional Docente do Brasil (CNDB)">
                    <Field icon={<Hash className="h-4 w-4" />}>
                      <input value={enrollment} onChange={(event) => setEnrollment(event.target.value)} placeholder="Número da CNDB" className="h-12 w-full bg-transparent text-sm outline-none" />
                    </Field>
                  </Labeled>
                  <Labeled label="Senha">
                    <Field icon={<Lock className="h-4 w-4" />} trailing={
                      <button type="button" className="text-slate-400" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }>
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full bg-transparent text-sm outline-none" />
                    </Field>
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {[0, 1, 2, 3].map((index) => (
                        <span key={index} className={`h-1.5 rounded-full ${index < strength.score ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Força da senha</span>
                      <span className={strength.score >= 3 ? 'font-semibold text-emerald-600' : 'text-slate-500'}>{password ? strength.label : ''}</span>
                    </div>
                    <ul className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-500">
                      {strength.rules.map((rule) => (
                        <li key={rule.label} className={rule.ok ? 'text-emerald-600' : ''}>{rule.ok ? '●' : '○'} {rule.label}</li>
                      ))}
                    </ul>
                  </Labeled>
                  <Labeled label="Confirmar senha">
                    <Field icon={<Lock className="h-4 w-4" />} trailing={passwordsMatch ? <Check className="h-4 w-4 text-emerald-500" /> : null}>
                      <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-12 w-full bg-transparent text-sm outline-none" />
                    </Field>
                    {passwordsMatch && <p className="mt-1 text-xs text-emerald-600">As senhas coincidem</p>}
                  </Labeled>
                  <label className="flex items-start gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
                    <span>
                      Li e aceito os{' '}
                      <button type="button" className="font-semibold text-brand" onClick={() => setLegal('termos')}>Termos de uso</button>
                      {' '}e a{' '}
                      <button type="button" className="font-semibold text-brand" onClick={() => setLegal('privacidade')}>Política de privacidade</button>
                      {' '}da UniColab.
                    </span>
                  </label>
                  {error && <Alert text={error} />}
                  <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                    {loading ? 'Criando conta...' : 'Criar conta de professor'}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </button>
                  <p className="text-center text-sm text-slate-500">
                    É aluno?{' '}
                    <button type="button" className="font-semibold text-brand" onClick={() => { setMode('register'); setError(''); setInfo(''); }}>
                      Criar conta
                    </button>
                  </p>
                </form>
              </>
            )}

            {mode === 'forgot' && (
              <>
                <h2 className="text-3xl font-extrabold tracking-tight">Recuperar acesso</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  A API não recupera senha. Informe o e-mail para ver como a coordenação libera o acesso.
                </p>
                <form onSubmit={handleForgot} className="mt-8 space-y-4">
                  <Labeled label="Usuário ou e-mail">
                    <Field icon={<UserRound className="h-4 w-4" />}>
                      <input value={username} onChange={(event) => setUsername(event.target.value)} className="h-12 w-full bg-transparent text-sm outline-none" />
                    </Field>
                  </Labeled>
                  {error && <Alert text={error} />}
                  {info && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>}
                  <button type="submit" className="h-12 w-full rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-dark">
                    Verificar conta
                  </button>
                  <button type="button" className="w-full text-sm font-semibold text-brand" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>
                    Voltar para o login
                  </button>
                </form>
              </>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 pb-2 text-xs text-slate-400">
            <span>© 2026 UniColab</span>
            <div className="flex gap-4">
              <button type="button" onClick={() => setLegal('privacidade')}>Privacidade</button>
              <button type="button" onClick={() => setLegal('termos')}>Termos</button>
              <button type="button" onClick={() => setLegal('ajuda')}>Ajuda</button>
            </div>
          </footer>
        </section>
      </div>

      {legal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center" onClick={() => setLegal(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="text-lg font-extrabold">
              {legal === 'privacidade' && 'Privacidade'}
              {legal === 'termos' && 'Termos de uso'}
              {legal === 'ajuda' && 'Ajuda'}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {legal === 'privacidade' && 'Uma conta nova é gravada no servidor quando o e-mail termina em @edu.unifor.br. A senha fica apenas como hash.'}
              {legal === 'termos' && 'A UniColab é um protótipo acadêmico para estudo do ENADE. O conteúdo serve para treino e não substitui o exame oficial. O cadastro aceita e-mails @edu.unifor.br.'}
              {legal === 'ajuda' && 'Crie a conta com um e-mail @edu.unifor.br. O aluno entra no fluxo do aluno e o professor no espaço do professor.'}
            </p>
            <button type="button" className="mt-5 h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white" onClick={() => setLegal(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Field({
  label,
  icon,
  trailing,
  children,
}: {
  label?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>}
      <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
        {icon && <span className="text-slate-400">{icon}</span>}
        {children}
        {trailing}
      </div>
    </div>
  );
}

function Alert({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {text}
    </p>
  );
}
