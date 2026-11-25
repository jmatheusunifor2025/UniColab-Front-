import createClient from 'openapi-fetch';

const TOKEN_KEY = 'unicolab_token';

export const apiBaseUrl = import.meta.env?.VITE_API_URL || 'http://localhost:5080';

export function readToken() {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function writeToken(token, persist) {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  const store = persist ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export const api = createClient({ baseUrl: apiBaseUrl });

const auth = {
  async onRequest({ request }) {
    const token = readToken();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
};

api.use(auth);

export function errorMessage(error, fallback) {
  if (!error || typeof error !== 'object') return fallback;
  const body = error;
  if (typeof body.mensagem === 'string' && body.mensagem) return body.mensagem;
  const first = body.errors ? Object.values(body.errors).flat().find(Boolean) : undefined;
  if (first) return first;
  if (typeof body.title === 'string' && body.title && !body.title.startsWith('One or more')) return body.title;
  return fallback;
}
