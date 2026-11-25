const KEY = 'unicolab_local_accounts';

export function readAccounts() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAccount(account) {
  const next = readAccounts().filter((item) => item.username !== account.username && item.email !== account.email);
  next.push(account);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function findAccount(login, password) {
  const key = login.toLowerCase().trim();
  return readAccounts().find(
    (account) =>
      account.password === password &&
      (account.username === key || account.email.toLowerCase() === key),
  );
}

export function accountExists(login) {
  const key = login.toLowerCase().trim();
  return readAccounts().some((account) => account.username === key || account.email.toLowerCase() === key);
}

export function updateAccountPassword(username, password) {
  const next = readAccounts().map((account) =>
    account.username === username ? { ...account, password } : account,
  );
  localStorage.setItem(KEY, JSON.stringify(next));
}
