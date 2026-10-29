// The implementation lives in `shared/identity` so the vault layer can identify the text a page was built from
// without importing the recovery layer; recovery keeps importing it from here.
export { fingerprint } from '../shared/identity/textFingerprint';
