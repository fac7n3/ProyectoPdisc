// node js/mfa-utils.test.mjs
import assert from 'node:assert/strict';
import {
  isStaffRole, mfaGate, normalizeTotpCode, isTotpCode, formatTotpSecret,
  verifiedTotpFactors, pendingTotpFactors, describeMfaError,
} from './mfa-utils.js';

// --- isStaffRole ---
assert.equal(isStaffRole('admin'), true);
assert.equal(isStaffRole('moderador'), true);
assert.equal(isStaffRole('vendedor'), false);
assert.equal(isStaffRole(undefined), false);

// --- mfaGate ---
// Admin sin factor -> tiene que activarla.
assert.equal(mfaGate({ role: 'admin', currentLevel: 'aal1', nextLevel: 'aal1' }), 'enroll');
assert.equal(mfaGate({ role: 'moderador', currentLevel: null, nextLevel: null }), 'enroll');
// Admin con factor y sesión de solo contraseña -> pedir el código.
assert.equal(mfaGate({ role: 'admin', currentLevel: 'aal1', nextLevel: 'aal2' }), 'verify');
// Admin que ya pasó por el código.
assert.equal(mfaGate({ role: 'admin', currentLevel: 'aal2', nextLevel: 'aal2' }), 'ok');
// Cliente sin factor: nada.
assert.equal(mfaGate({ role: 'cliente', currentLevel: 'aal1', nextLevel: 'aal1' }), 'ok');
assert.equal(mfaGate({}), 'ok');
// Cliente que la activó por su cuenta: también se le pide al entrar.
assert.equal(mfaGate({ role: 'cliente', currentLevel: 'aal1', nextLevel: 'aal2' }), 'verify');
assert.equal(mfaGate({ role: 'vendedor', currentLevel: 'aal2', nextLevel: 'aal2' }), 'ok');

// --- códigos ---
assert.equal(normalizeTotpCode(' 123 456 '), '123456');
assert.equal(normalizeTotpCode('123-4567'), '123456');
assert.equal(normalizeTotpCode(null), '');
assert.equal(isTotpCode('123456'), true);
assert.equal(isTotpCode('12345'), false);
assert.equal(isTotpCode('12345a'), false);
assert.equal(isTotpCode('1234567'), false);

assert.equal(formatTotpSecret('ABCDEFGHIJKLMNOP'), 'ABCD EFGH IJKL MNOP');
assert.equal(formatTotpSecret('ABCDEF'), 'ABCD EF');
assert.equal(formatTotpSecret('AB CD'), 'ABCD');

// --- factores ---
const factors = [
  { id: '1', factor_type: 'totp', status: 'verified' },
  { id: '2', factor_type: 'totp', status: 'unverified' },
  { id: '3', factor_type: 'phone', status: 'verified' },
];
assert.deepEqual(verifiedTotpFactors(factors).map((f) => f.id), ['1']);
assert.deepEqual(pendingTotpFactors(factors).map((f) => f.id), ['2']);
assert.deepEqual(verifiedTotpFactors(null), []);
assert.deepEqual(pendingTotpFactors(undefined), []);

// --- errores ---
assert.equal(describeMfaError({ code: 'mfa_totp_enroll_not_enabled', message: 'MFA enroll is disabled for TOTP' }).kind, 'disabled');
assert.equal(describeMfaError({ code: 'mfa_totp_verify_not_enabled' }).kind, 'disabled');
assert.equal(describeMfaError({ code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' }).kind, 'code');
assert.equal(describeMfaError({ code: 'mfa_challenge_expired' }).kind, 'code');
assert.equal(describeMfaError({ status: 429, message: 'Too many requests' }).kind, 'rate');
assert.equal(describeMfaError({ code: 'insufficient_aal', message: 'AAL2 required to unenroll verified factor' }).kind, 'aal');
assert.equal(describeMfaError({ message: 'Network error' }).kind, 'other');
assert.equal(describeMfaError(null).kind, 'other');

console.log('mfa-utils: ok');
