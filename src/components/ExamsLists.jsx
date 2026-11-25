import { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { createExam, listExams } from '../api/unicolab';

export default function ExamsLists({ questions, seedIds = [] }) {
  const [lists, setLists] = useState([]);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [selected, setSelected] = useState(seedIds);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (seedIds.length > 0) setSelected(seedIds);
  }, [seedIds]);

  useEffect(() => {
    let active = true;
    listExams()
      .then((items) => {
        if (!active) return;
        setLists(items.map((item) => ({ ...item, createdAt: 'no servidor' })));
      })
      .catch((err) => {
        if (!active) return;
        setMessage(err instanceof Error ? err.message : 'Não foi possível carregar as provas.');
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return questions;
    return questions.filter((question) => question.text.toLowerCase().includes(term) || question.area.toLowerCase().includes(term));
  }, [questions, query]);

  const save = async () => {
    if (!title.trim()) {
      setMessage('Dê um nome para a lista.');
      return;
    }
    if (selected.length === 0) {
      setMessage('Selecione ao menos uma questão.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const created = await createExam(title.trim(), minutes, selected);
      const item = { ...created, createdAt: 'no servidor' };
      setLists((current) => [item, ...current.filter((list) => list.id !== item.id)]);
      setTitle('');
      setSelected([]);
      setMessage('Prova gravada na API.');
      setOpenId(item.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Falha ao gravar a prova.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-slate-400">Espaço do professor <span className="text-brand">/ Provas e listas</span></p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Provas e listas</h1>
        <p className="mt-1 text-sm text-slate-500">Monte provas a partir do banco e grave no servidor.</p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <section className="rounded-[24px] border border-line bg-white p-5 lg:col-span-8">
          <h2 className="font-bold">Nova lista</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_140px]">
            <label className="text-sm">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">Nome</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Revisão de padrões de projeto" className="h-11 w-full rounded-xl border border-line px-3 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">Tempo (min)</span>
              <input type="number" min={5} value={minutes} onChange={(event) => setMinutes(Number(event.target.value) || 0)} className="h-11 w-full rounded-xl border border-line px-3 text-sm" />
            </label>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar questões do banco" className="mt-3 h-11 w-full rounded-xl border border-line px-3 text-sm" />
          <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {visible.map((question) => {
              const checked = selected.includes(question.id);
              return (
                <li key={question.id}>
                  <label className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${checked ? 'border-brand bg-[#f7f5ff]' : 'border-line'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setSelected((current) => (checked ? current.filter((id) => id !== question.id) : [...current, question.id]))}
                      className="mt-1 accent-brand"
                    />
                    <span>
                      <span className="block text-xs font-semibold text-brand">{question.area}</span>
                      <span className="mt-1 block text-sm leading-snug">{question.text}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-slate-500">{selected.length} selecionadas</span>
            <button type="button" onClick={save} disabled={saving} className="h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {saving ? 'Salvando...' : 'Salvar prova'}
            </button>
          </div>
        </section>

        <aside className="rounded-[24px] border border-line bg-white p-5 lg:col-span-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-brand" />
            <h2 className="font-bold">Listas salvas</h2>
          </div>
          {lists.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-canvas px-3 py-8 text-center text-sm text-slate-500">Nenhuma prova cadastrada no servidor.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {lists.map((item) => {
                const open = openId === item.id;
                const linked = item.questionIds.map((id) => questions.find((question) => question.id === id)).filter(Boolean);
                return (
                  <li key={item.id} className="rounded-2xl border border-line p-3">
                    <button type="button" onClick={() => setOpenId(open ? null : item.id)} className="w-full text-left">
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.questionIds.length} questões · {item.minutes} min · {item.createdAt}</p>
                    </button>
                    {open && (
                      <ol className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
                        {linked.map((question, index) => (
                          <li key={question.id} className="line-clamp-2 text-slate-600">{index + 1}. {question.text}</li>
                        ))}
                        {linked.length < item.questionIds.length && (
                          <li className="text-xs text-slate-400">Algumas questões não estão mais visíveis no banco.</li>
                        )}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
