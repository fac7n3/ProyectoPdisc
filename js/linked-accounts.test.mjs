import assert from "node:assert/strict";

// localStorage / sessionStorage mínimos para correr el módulo en node.
const mem = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = mem();
globalThis.sessionStorage = mem();

const {
  loadLinkedAccounts, rememberAccount, forgetAccount, clearLinkedAccounts,
  markLinkPending, completePendingLink, resetLocalCartState,
} = await import("./linked-accounts.js");

const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { console.error(`  FALLA  ${name}\n         ${err.message}`); process.exitCode = 1; }
};
const ses = (id, email) => ({ access_token: `a-${id}`, refresh_token: `r-${id}`, user: { id, email, user_metadata: {} } });

check("rememberAccount guarda y actualiza sin duplicar", () => {
  rememberAccount(ses("1", "a@a.com"));
  rememberAccount(ses("2", "b@b.com"));
  rememberAccount({ ...ses("1", "a@a.com"), refresh_token: "r-nuevo" });
  const lista = loadLinkedAccounts();
  assert.equal(lista.length, 2);
  assert.equal(lista[0].session.refresh_token, "r-nuevo");
});

check("forgetAccount saca una y clearLinkedAccounts borra todo", () => {
  forgetAccount("2");
  assert.deepEqual(loadLinkedAccounts().map((e) => e.id), ["1"]);
  clearLinkedAccounts();
  assert.deepEqual(loadLinkedAccounts(), []);
  assert.equal(localStorage.getItem("bl_linked_accounts_v1"), null);
});

check("completePendingLink: suma la cuenta nueva al volver de Google", () => {
  clearLinkedAccounts();
  rememberAccount(ses("1", "a@a.com"));
  markLinkPending("1");
  assert.equal(completePendingLink(ses("2", "b@b.com")), true);
  assert.deepEqual(loadLinkedAccounts().map((e) => e.id).sort(), ["1", "2"]);
  // la marca se usa una sola vez
  assert.equal(completePendingLink(ses("3", "c@c.com")), false);
});

check("completePendingLink: si Google devolvió la misma cuenta, no agrega nada", () => {
  clearLinkedAccounts();
  markLinkPending("1");
  assert.equal(completePendingLink(ses("1", "a@a.com")), false);
  assert.deepEqual(loadLinkedAccounts(), []);
});

check("completePendingLink: sin vinculación en curso, o vencida, no agrega", () => {
  clearLinkedAccounts();
  assert.equal(completePendingLink(ses("2", "b@b.com")), false);
  localStorage.setItem("bl_linked_pending", JSON.stringify({ from: "1", at: Date.now() - 16 * 60 * 1000 }));
  assert.equal(completePendingLink(ses("2", "b@b.com")), false);
  assert.deepEqual(loadLinkedAccounts(), []);
});

check("completePendingLink tolera una marca rota", () => {
  localStorage.setItem("bl_linked_pending", "{no json");
  assert.equal(completePendingLink(ses("2", "b@b.com")), false);
});

check("resetLocalCartState deja de lado el carrito de este navegador", () => {
  localStorage.setItem("bl_cart", "[1]");
  localStorage.setItem("bl_cart_unsynced", "1");
  sessionStorage.setItem("bl_cart_synced", "1");
  resetLocalCartState();
  assert.equal(localStorage.getItem("bl_cart"), null);
  assert.equal(localStorage.getItem("bl_cart_unsynced"), null);
  assert.equal(sessionStorage.getItem("bl_cart_synced"), null);
});

if (!process.exitCode) console.log("\nTodo bien.");
