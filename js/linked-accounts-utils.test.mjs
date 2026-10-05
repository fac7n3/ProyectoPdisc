import assert from "node:assert/strict";
import {
  snapshotSession, accountDisplayName, buildAccountEntry, parseLinkedAccounts,
  upsertAccount, removeAccount, switchTargets, canLinkAccount, MAX_LINKED_ACCOUNTS,
} from "./linked-accounts-utils.js";

const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { console.error(`  FALLA  ${name}\n         ${err.message}`); process.exitCode = 1; }
};
const ses = (id, email, extra = {}) => ({
  access_token: `a-${id}`, refresh_token: `r-${id}`,
  user: { id, email, user_metadata: extra },
});

check("snapshotSession guarda solo los dos tokens", () => {
  assert.deepEqual(snapshotSession({ ...ses("1", "a@a.com"), expires_at: 5 }), { access_token: "a-1", refresh_token: "r-1" });
  assert.equal(snapshotSession({ access_token: "x" }), null);
  assert.equal(snapshotSession(null), null);
});

check("accountDisplayName: nombre, si no la parte del mail", () => {
  assert.equal(accountDisplayName({ email: "bere@x.com", user_metadata: { full_name: " Bere Piri " } }), "Bere Piri");
  assert.equal(accountDisplayName({ email: "bere@x.com", user_metadata: {} }), "bere");
  assert.equal(accountDisplayName(null), "Cuenta");
});

check("buildAccountEntry normaliza el mail y rechaza sesiones incompletas", () => {
  const e = buildAccountEntry(ses("1", "Bere@X.com", { full_name: "Bere" }));
  assert.deepEqual(e, { id: "1", email: "bere@x.com", name: "Bere", session: { access_token: "a-1", refresh_token: "r-1" } });
  assert.equal(buildAccountEntry({ access_token: "a", refresh_token: "r", user: {} }), null);
});

check("parseLinkedAccounts tolera JSON roto, duplicados y entradas sin tokens", () => {
  assert.deepEqual(parseLinkedAccounts("{no es json"), []);
  assert.deepEqual(parseLinkedAccounts(null), []);
  assert.deepEqual(parseLinkedAccounts('{"a":1}'), []);
  const e1 = buildAccountEntry(ses("1", "a@a.com"));
  const roto = { id: "2", email: "b@b.com", session: { access_token: "x" } };
  const lista = parseLinkedAccounts(JSON.stringify([e1, e1, roto, null, 5]));
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, "1");
});

check("parseLinkedAccounts respeta el tope", () => {
  const muchas = Array.from({ length: 9 }, (_, i) => buildAccountEntry(ses(String(i), `u${i}@a.com`)));
  assert.equal(parseLinkedAccounts(JSON.stringify(muchas)).length, MAX_LINKED_ACCOUNTS);
});

check("upsertAccount agrega y actualiza en su lugar (tokens nuevos, mismo orden)", () => {
  let lista = [];
  lista = upsertAccount(lista, buildAccountEntry(ses("1", "a@a.com")));
  lista = upsertAccount(lista, buildAccountEntry(ses("2", "b@b.com")));
  const nueva = buildAccountEntry({ ...ses("1", "a@a.com"), refresh_token: "r-NUEVO" });
  lista = upsertAccount(lista, nueva);
  assert.equal(lista.length, 2);
  assert.equal(lista[0].session.refresh_token, "r-NUEVO");
  assert.equal(lista[1].id, "2");
  assert.equal(upsertAccount(lista, null), lista);
});

check("removeAccount y switchTargets", () => {
  const lista = ["1", "2", "3"].map((i) => buildAccountEntry(ses(i, `u${i}@a.com`)));
  assert.deepEqual(removeAccount(lista, "2").map((e) => e.id), ["1", "3"]);
  assert.deepEqual(switchTargets(lista, "1").map((e) => e.id), ["2", "3"]);
  assert.deepEqual(switchTargets([], "1"), []);
});

check("canLinkAccount: la misma, una repetida, el tope", () => {
  const lista = [buildAccountEntry(ses("2", "b@b.com"))];
  assert.equal(canLinkAccount(lista, "1", "3"), null);
  assert.match(canLinkAccount(lista, "1", "1"), /ya es la cuenta/);
  assert.match(canLinkAccount(lista, "1", "2"), /ya está/);
  assert.match(canLinkAccount(lista, "1", ""), /identificar/);
  const llena = Array.from({ length: MAX_LINKED_ACCOUNTS }, (_, i) => buildAccountEntry(ses(`x${i}`, `x${i}@a.com`)));
  assert.match(canLinkAccount(llena, "1", "zz"), /hasta/);
});

if (!process.exitCode) console.log("\nTodo bien.");
