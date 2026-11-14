/*
 * receipt-proof.mjs: prints page 11's receipt from verified evidence, offline, with node:crypto and git alone.
 *
 * A receipt is printed by a machine, as the pipeline's receipt job prints its lines from verified statements
 * (SPEC-001-R55). So carousel.yaml holds the receipt's title, header and footer wording, and this file prints its
 * lines: every hash, signature, ID and number on them comes from a proof below, and a line whose proof fails prints
 * NOT VERIFIED. What the receipt is for, and what it trusts, is pinned here, in RECEIPT, never in carousel.yaml:
 *
 * - the delivery: the commit, the signed commit that approved its requirement and task, and the pipeline run;
 * - the trust root: the SHA-256 of evidence/sigstore-trusted-root.json and the Rekor log the entries must be in;
 * - the identity: the certificate issuer, the workflow, the ref, the repository, the run and a GitHub-hosted runner,
 *   as SPEC-001-R50 pins the pipeline's own receipt check;
 * - the rows each line covers, by their text in carousel.yaml.
 *
 * The proofs:
 * - approval: the spec commit's one signature header is an SSH signature (PROTOCOL.sshsig, namespace git) by a
 *   security key that approvers.txt lists at its parent, with the flags REQUIRED_SIGNATURE_FLAGS names there, and it
 *   verifies over the commit without that header, as OpenSSH's ssh-ecdsa-sk.c and ssh-ed25519-sk.c check it.
 * - statements: each evidence/ statement hashes to the payload Rekor logged; its DSSE signature verifies with the
 *   certificate Rekor logged; that certificate chains, issuer by issuer, to a Fulcio CA in the pinned trusted root,
 *   each certificate and the CA's validFor covering the moment Rekor logged it, with code-signing usage and the pinned
 *   identity in its extensions; Rekor's signed entry timestamp, its inclusion proof (RFC 9162, 2.1.3.2), the UUID's
 *   leaf hash and tree, and the signed checkpoint all verify with the pinned Rekor key.
 * - git: the diff the producer's agent wrote, recomputed with no user configuration; the Claude Code pin and limits in
 *   producer.yml inside the signed tree; the deploy job's OIDC role in pipeline.yml at the commit.
 * - run logs: turns, cost, the checks' pass lines and the apply's counts and time exist only in GitHub's logs, which
 *   the batch notes quote under each job's ID. Lines print them after "run log:".
 *
 * Not verified: the trusted root's TUF metadata (the pin is the SHA-256 that targets.json version 14 named on
 * 2026-11-14), the certificates' SCTs, and the run logs' text, which no one signed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KIT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(KIT, '..');

export const RECEIPT = {
  repo: 'PaulDuvall/who-gets-the-keys',
  commit: '9f959a350e541d1aa52654e4ace7d7fdd4fa52a6',
  specCommit: 'c7c6b4d98a4e2622979b333c299bd09b8c677ba5',
  run: '42501305077',
  attempt: '1',
  ref: 'refs/heads/main',
  workflow: '.github/workflows/pipeline.yml',
  issuer: 'https://token.actions.githubusercontent.com',
  runner: 'github-hosted',
  evidence: path.join(KIT, 'evidence'),
  trustedRootSha256: '6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66',
  rekorLogId: 'c0d23d6ad406973f9559f3ba2d1ca01f84147d8ffc5b8445c224f98b9591801d',
  statements: {
    'https://slsa.dev/provenance/v1': 'slsa-provenance-v1.statement.json',
    'https://github.com/PaulDuvall/who-gets-the-keys/provenance/v2': 'provenance-v2.statement.json',
  },
  // The batch notes quote these jobs' log lines; a "run log:" value is read from there.
  notes: path.join(ROOT, 'docs/notes/practices-carousel.md'),
  jobs: { agent: '128788563404', publish: '128788887004', checks: '128794438881', deploy: '128795003787' },
  checkOrder: ['secrets', 'allowlist', 'workflows', 'install', 'lint', 'typecheck', 'iac', 'sast', 'sca', 'trace', 'ratchet', 'signatures', 'slides', 'test', 'mutation'],
};
const SLSA = 'https://slsa.dev/provenance/v1';
const V2 = 'https://github.com/PaulDuvall/who-gets-the-keys/provenance/v2';

// The rows of carousel.yaml each line covers, in full (shows) and in part (partly): a judgment, made here so the page
// cannot count more than the evidence covers. The batch notes, "Which rows it covers", give the reasons.
const ROWS = {
  SPEC: { shows: ['Specs change only through an approver-signed commit'], partly: ['Trace every change to a spec ID and every requirement to a test'] },
  APPROVED: { shows: ['Approvers sign every change to the factory that the agent proposes'], partly: [] },
  AGENT: {
    shows: ['Cap turns and spend on every agent run'],
    partly: ['Record a hash of every agent input: instructions, skills, MCP config and model', 'Pin actions by commit SHA, dependencies and images by hash',
      'Allowlist MCP servers by exact command or URL', 'Check provenance and integrity of what it retrieves'],
  },
  DIFF: { shows: ['Run unit tests and code-quality checks in the sandbox and again in the pipeline'], partly: ['Limit what the agent can do to an allow list of commands and paths'] },
  COMMIT: {
    shows: ['SAST on every change', 'SCA on every lockfile', 'Property tests hold invariants across generated inputs', 'No cache shared between untrusted jobs and release'],
    partly: ['Fail a change whose mutation score drops, on changed code only', 'Scan for secrets in the sandbox and again in the pipeline',
      'Scan infrastructure code and publish an SBOM', 'Check new dependencies against an allowlist and a hash-pinned mirror'],
  },
  FILES: { shows: [], partly: [] },
  SLSA: { shows: ['Build the artifact once and sign its attestations, and deploy verifies them first'], partly: [] },
  RECORD: { shows: [], partly: ['Provenance records the commit, spec ID, agent and model version'] },
  SIGNER: { shows: [], partly: [] },
  DEPLOY: { shows: ['Deploy with one short-lived identity, federated through OIDC'], partly: ['A human approves irreversible actions, and the pipeline checks the approval'] },
};
export const RECEIPT_KEYS = Object.keys(ROWS);
export const RECEIPT_ROWS = ROWS;

const sha256 = (b) => crypto.createHash('sha256').update(b).digest();
// A signature check that cannot run, such as one with a key of the wrong type, does not verify.
const verifies = (...args) => {
  try {
    return crypto.verify(...args);
  } catch {
    return false;
  }
};
// git with no user or system configuration, so diff.noprefix and the like cannot change its output.
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_COUNT: '0', GIT_CONFIG_PARAMETERS: '' };
const gitBytes = (...a) => execFileSync('git', ['-C', ROOT, ...a], { env: GIT_ENV, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
const git = (...a) => gitBytes(...a).toString('latin1');
const fail = (msg) => {
  throw new Error(msg);
};

// An SSH wire string: uint32 length, then the bytes. Reading past the end fails.
function wire(b, at) {
  if (at + 4 > b.length) fail('truncated SSH string');
  const n = b.readUInt32BE(at);
  if (at + 4 + n > b.length) fail('truncated SSH string');
  return [b.subarray(at + 4, at + 4 + n), at + 4 + n];
}
const lengthPrefixed = (b) => {
  const n = Buffer.alloc(4);
  n.writeUInt32BE(b.length);
  return Buffer.concat([n, b]);
};
// Canonical JSON: keys sorted, no spaces. Rekor signs its entry timestamp over this.
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));

// ---------------------------------------------------------------- DER, for a certificate's extensions
function tlv(buf, at) {
  if (at + 2 > buf.length) fail('truncated DER');
  let len = buf[at + 1];
  let start = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) fail('bad DER length');
    len = buf.readUIntBE(start, n);
    start += n;
  }
  if (start + len > buf.length) fail('truncated DER');
  return { tag: buf[at], start, end: start + len };
}
function oidString(bytes) {
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let v = 0;
  for (const b of bytes.subarray(1)) {
    v = v * 128 + (b & 0x7f);
    if (!(b & 0x80)) {
      parts.push(v);
      v = 0;
    }
  }
  return parts.join('.');
}
// Certificate -> TBSCertificate -> [3] Extensions -> each Extension's OID and OCTET STRING. A repeated OID fails.
function extensionsOf(raw) {
  const cert = tlv(raw, 0);
  const tbs = tlv(raw, cert.start);
  let ext = null;
  for (let at = tbs.start; at < tbs.end; ) {
    const f = tlv(raw, at);
    if (f.tag === 0xa3) ext = f;
    at = f.end;
  }
  if (!ext) fail('the certificate has no extensions');
  const seq = tlv(raw, ext.start);
  const out = new Map();
  for (let at = seq.start; at < seq.end; ) {
    const e = tlv(raw, at);
    const oid = tlv(raw, e.start);
    if (oid.tag !== 0x06) fail('bad extension');
    let next = tlv(raw, oid.end);
    if (next.tag === 0x01) next = tlv(raw, next.end);
    if (next.tag !== 0x04) fail('bad extension value');
    const id = oidString(raw.subarray(oid.start, oid.end));
    if (out.has(id)) fail(`extension ${id} appears twice`);
    out.set(id, raw.subarray(next.start, next.end));
    at = e.end;
  }
  return out;
}
// A Fulcio extension from 1.3.6.1.4.1.57264.1.8 on: a DER UTF8String inside the OCTET STRING.
function fulcio(exts, n) {
  const v = exts.get(`1.3.6.1.4.1.57264.1.${n}`);
  if (!v) return null;
  const s = tlv(v, 0);
  if (s.tag !== 0x0c || s.end !== v.length) fail(`Fulcio extension 1.${n} is not one UTF8String`);
  return v.subarray(s.start, s.end).toString('utf8');
}

// RFC 9162, 2.1.3.2: the root an inclusion proof gives, or null. Division, not >>, for indexes past 2^31.
function inclusionRoot(leaf, index, size, hashes) {
  if (!(index < size)) return null;
  let fn = index;
  let sn = size - 1;
  let r = leaf;
  for (const h of hashes) {
    const p = Buffer.from(h, 'hex');
    if (sn === 0) return null;
    if (fn % 2 === 1 || fn === sn) {
      r = sha256(Buffer.concat([Buffer.from([1]), p, r]));
      if (fn % 2 === 0) {
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else r = sha256(Buffer.concat([Buffer.from([1]), r, p]));
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 ? r : null;
}

// ---------------------------------------------------------------- the approver's SSH signature
// approvers.txt in SSH allowed-signers form: principals, options, key type, key, comment. A cert-authority line, a
// namespaces option without git, or a valid-after or valid-before that excludes the commit's time admits no key.
function approverKeys(text, when) {
  const types = new Set(['sk-ecdsa-sha2-nistp256@openssh.com', 'sk-ssh-ed25519@openssh.com', 'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa']);
  const stamp = (s) => {
    const m = /^(\d{4})(\d\d)(\d\d)(\d\d)?(\d\d)?(\d\d)?Z?$/.exec(s);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) : NaN;
  };
  const keys = [];
  for (const line of text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))) {
    const words = line.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
    const i = words.findIndex((w) => types.has(w));
    if (i < 1 || !words[i + 1]) continue;
    const options = words.slice(1, i).join(',').split(',').filter(Boolean);
    const opt = (k) => options.find((o) => o.toLowerCase().startsWith(`${k}=`))?.slice(k.length + 1).replace(/^"|"$/g, '');
    if (options.some((o) => o.toLowerCase() === 'cert-authority')) continue;
    const namespaces = opt('namespaces');
    if (namespaces !== undefined && !namespaces.split(',').includes('git')) continue;
    const after = opt('valid-after');
    const before = opt('valid-before');
    if (after !== undefined && !(when >= stamp(after))) continue;
    if (before !== undefined && !(when < stamp(before))) continue;
    keys.push(words[i + 1]);
  }
  return keys;
}
function sshCommitSignature(commit) {
  const raw = git('cat-file', 'commit', commit);
  const cut = raw.indexOf('\n\n');
  const lines = raw.slice(0, cut).split('\n');
  const want = git('rev-parse', '--show-object-format').trim() === 'sha256' ? 'gpgsig-sha256' : 'gpgsig';
  const kept = [];
  const sigs = [];
  for (let i = 0; i < lines.length; i++) {
    const key = lines[i].slice(0, lines[i].indexOf(' '));
    if (!key.startsWith('gpgsig')) {
      kept.push(lines[i]);
      continue;
    }
    let value = lines[i].slice(key.length + 1);
    while (lines[i + 1]?.startsWith(' ')) value += `\n${lines[++i].slice(1)}`;
    sigs.push([key, value]);
  }
  if (sigs.length !== 1 || sigs[0][0] !== want) fail(`the commit does not have exactly one ${want} header`);
  const armored = /^-----BEGIN SSH SIGNATURE-----\n([\s\S]*?)\n-----END SSH SIGNATURE-----$/.exec(sigs[0][1].trim());
  if (!armored) fail('the signature is not an SSH signature');
  const blob = Buffer.from(armored[1].replace(/\s/g, ''), 'base64');
  if (blob.subarray(0, 6).toString() !== 'SSHSIG' || blob.readUInt32BE(6) !== 1) fail('not an SSHSIG version 1 blob');
  const [publicKey, a1] = wire(blob, 10);
  const [namespace, a2] = wire(blob, a1);
  const [reserved, a3] = wire(blob, a2);
  const [hashAlg, a4] = wire(blob, a3);
  const [signature, a5] = wire(blob, a4);
  if (a5 !== blob.length) fail('trailing bytes after the signature');
  const [keyType, k1] = wire(publicKey, 0);
  const type = keyType.toString();
  if (namespace.toString() !== 'git') fail(`namespace ${namespace} is not git`);
  if (!['sha256', 'sha512'].includes(hashAlg.toString())) fail(`hash ${hashAlg} is not sha256 or sha512`);
  const committed = Number(/^committer .* (\d+) [+-]\d{4}$/m.exec(raw.slice(0, cut))?.[1]) * 1000;
  if (!approverKeys(git('show', `${commit}^:approvers.txt`), committed).includes(publicKey.toString('base64'))) fail('the key is not an approver in approvers.txt at the parent');
  const required = Number(/REQUIRED_SIGNATURE_FLAGS: number = (0x[0-9a-f]+|\d+);/i.exec(git('show', `${commit}^:scripts/checks.ts`))?.[1]);
  if (!Number.isInteger(required)) fail('no REQUIRED_SIGNATURE_FLAGS in scripts/checks.ts at the parent');
  let key;
  let point;
  let end;
  if (type === 'sk-ecdsa-sha2-nistp256@openssh.com') {
    const [curve, k2] = wire(publicKey, k1);
    [point, end] = wire(publicKey, k2);
    if (curve.toString() !== 'nistp256' || point[0] !== 4 || point.length !== 65) fail('malformed key');
    key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') }, format: 'jwk' });
  } else if (type === 'sk-ssh-ed25519@openssh.com') {
    [point, end] = wire(publicKey, k1);
    if (point.length !== 32) fail('malformed key');
    key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: point.toString('base64url') }, format: 'jwk' });
  } else fail(`key type ${type} is not a security key`);
  const [application, k3] = wire(publicKey, end);
  if (k3 !== publicKey.length) fail('trailing bytes after the key');
  const [sigType, s1] = wire(signature, 0);
  const [inner, s2] = wire(signature, s1);
  if (sigType.toString() !== type || s2 + 5 !== signature.length) fail('malformed signature');
  const flags = signature[s2];
  const counter = signature.readUInt32BE(s2 + 1);
  if ((flags & required) !== required) fail(`the flags ${flags} lack the required ${required}`);
  // What git signed is the commit without its signature header; a security key signs
  // SHA-256(application) || flags || counter || SHA-256(the SSHSIG signed data).
  const message = Buffer.from(kept.join('\n') + raw.slice(cut), 'latin1');
  const signed = Buffer.concat([Buffer.from('SSHSIG'), lengthPrefixed(namespace), lengthPrefixed(reserved), lengthPrefixed(hashAlg), lengthPrefixed(crypto.createHash(hashAlg.toString()).update(message).digest())]);
  const count = Buffer.alloc(4);
  count.writeUInt32BE(counter);
  const tbs = Buffer.concat([sha256(application), Buffer.from([flags]), count, sha256(signed)]);
  let ok;
  if (type === 'sk-ssh-ed25519@openssh.com') ok = inner.length === 64 && verifies(null, tbs, key, inner);
  else {
    const [r, r1] = wire(inner, 0);
    const [s, r2] = wire(inner, r1);
    if (r2 !== inner.length) fail('trailing bytes in the ECDSA signature');
    const int = (x) => {
      let i = 0;
      while (i < x.length - 1 && x[i] === 0) i++;
      const v = x.subarray(i);
      const body = v[0] & 0x80 ? Buffer.concat([Buffer.from([0]), v]) : v;
      return Buffer.concat([Buffer.from([2, body.length]), body]);
    };
    const seq = Buffer.concat([int(r), int(s)]);
    ok = verifies('sha256', tbs, { key, dsaEncoding: 'der' }, Buffer.concat([Buffer.from([0x30, seq.length]), seq]));
  }
  if (!ok) fail('the signature does not verify');
  return {
    type: type.replace('@openssh.com', ''),
    fingerprint: `SHA256:${sha256(publicKey).toString('base64').replace(/=+$/, '')}`,
    signature: inner.toString('base64'),
    flags: [flags & 0x01 ? 'touch' : null, flags & 0x04 ? 'PIN' : null].filter(Boolean).join(' and ') || 'none',
    counter,
  };
}

// ---------------------------------------------------------------- one Rekor entry and its statement
function rekorStatement(entryFile, trusted) {
  const all = Object.entries(JSON.parse(fs.readFileSync(entryFile, 'utf8')));
  if (all.length !== 1) fail(`${path.basename(entryFile)} holds ${all.length} entries`);
  const [[uuid, e]] = all;
  const bodyBytes = Buffer.from(e.body, 'base64');
  const body = JSON.parse(bodyBytes);
  const at = e.integratedTime * 1000;
  const name = `Rekor ${e.logIndex}`;
  if (body.kind !== 'dsse' || body.spec?.signatures?.length !== 1 || body.spec.payloadHash?.algorithm !== 'sha256') fail(`${name} is not a DSSE entry with one signature and a SHA-256 payload hash`);
  if (e.logID !== RECEIPT.rekorLogId) fail(`${name} is in another log`);
  const tlog = trusted.tlogs.find((t) => Buffer.from(t.logId.keyId, 'base64').toString('hex') === e.logID);
  if (!tlog || at < Date.parse(tlog.publicKey.validFor.start) || (tlog.publicKey.validFor.end && at > Date.parse(tlog.publicKey.validFor.end))) fail(`${name}'s log key was not valid then`);
  const rekorKey = crypto.createPublicKey({ key: Buffer.from(tlog.publicKey.rawBytes, 'base64'), format: 'der', type: 'spki' });
  if (!verifies('sha256', Buffer.from(canon({ body: e.body, integratedTime: e.integratedTime, logID: e.logID, logIndex: e.logIndex })), rekorKey, Buffer.from(e.verification.signedEntryTimestamp, 'base64'))) fail(`${name}'s signed entry timestamp does not verify`);
  const leaf = sha256(Buffer.concat([Buffer.from([0]), bodyBytes]));
  const proof = e.verification.inclusionProof;
  const root = inclusionRoot(leaf, proof.logIndex, proof.treeSize, proof.hashes);
  if (!root || root.toString('hex') !== proof.rootHash) fail(`${name}'s inclusion proof does not reach its root`);
  const [note, sigs = ''] = proof.checkpoint.split('\n\n');
  const [origin, size, rootB64] = note.split('\n');
  const tree = /^rekor\.sigstore\.dev - (\d+)$/.exec(origin)?.[1];
  if (!tree || Number(size) !== proof.treeSize || Buffer.from(rootB64 ?? '', 'base64').toString('hex') !== proof.rootHash) fail(`${name}'s checkpoint names another tree`);
  if (uuid.length !== 80 || uuid.slice(16) !== leaf.toString('hex') || BigInt(`0x${uuid.slice(0, 16)}`) !== BigInt(tree)) fail(`${name}'s UUID is not its tree and leaf hash`);
  const line = sigs.split('\n').find((l) => l.startsWith('\u2014 rekor.sigstore.dev '));
  const sig = line ? Buffer.from(line.split(' ')[2], 'base64') : Buffer.alloc(0);
  if (sig.subarray(0, 4).toString('hex') !== e.logID.slice(0, 8) || !verifies('sha256', Buffer.from(`${note}\n`), rekorKey, sig.subarray(4))) fail(`${name}'s checkpoint is not signed by the pinned Rekor key`);
  // The statement Rekor logged, and its DSSE signature.
  const file = Object.values(RECEIPT.statements).find((f) => sha256(fs.readFileSync(path.join(RECEIPT.evidence, f))).toString('hex') === body.spec.payloadHash.value);
  if (!file) fail(`no statement in evidence/ is the payload ${name} logged`);
  const payload = fs.readFileSync(path.join(RECEIPT.evidence, file));
  const cert = new crypto.X509Certificate(Buffer.from(body.spec.signatures[0].verifier, 'base64').toString());
  const pae = Buffer.concat([Buffer.from(`DSSEv1 28 application/vnd.in-toto+json ${payload.length} `), payload]);
  if (!verifies('sha256', pae, cert.publicKey, Buffer.from(body.spec.signatures[0].signature, 'base64'))) fail(`${name}'s DSSE signature does not verify`);
  // The certificate: issued, issuer by issuer, by a Fulcio CA in the trusted root, every one valid when Rekor logged it.
  const valid = (c) => at >= Date.parse(c.validFrom) && at <= Date.parse(c.validTo);
  const chained = trusted.certificateAuthorities.some((ca) => {
    if (at < Date.parse(ca.validFor.start) || (ca.validFor.end && at > Date.parse(ca.validFor.end))) return false;
    const chain = ca.certChain.certificates.map((c) => new crypto.X509Certificate(Buffer.from(c.rawBytes, 'base64')));
    const links = [cert, ...chain];
    return links.every((c, i) => valid(c) && (i === 0 ? !c.ca : c.ca)
      && (i === links.length - 1 ? c.checkIssued(c) && c.verify(c.publicKey) : c.checkIssued(links[i + 1]) && c.verify(links[i + 1].publicKey)));
  });
  if (!chained) fail(`${name}'s certificate does not chain to a Fulcio CA valid at that time`);
  if (!(cert.keyUsage ?? []).includes('1.3.6.1.5.5.7.3.3')) fail(`${name}'s certificate is not for code signing`);
  // The identity, pinned as SPEC-001-R50 pins the pipeline's receipt check.
  const exts = extensionsOf(cert.raw);
  const repoUrl = `https://github.com/${RECEIPT.repo}`;
  const signer = `${repoUrl}/${RECEIPT.workflow}@${RECEIPT.ref}`;
  const runUrl = `${repoUrl}/actions/runs/${RECEIPT.run}/attempts/${RECEIPT.attempt}`;
  const want = [['SAN', cert.subjectAltName, `URI:${signer}`], ['issuer', fulcio(exts, 8), RECEIPT.issuer], ['build signer', fulcio(exts, 9), signer],
    ['signer digest', fulcio(exts, 10), RECEIPT.commit], ['runner', fulcio(exts, 11), RECEIPT.runner], ['source repository', fulcio(exts, 12), repoUrl],
    ['source digest', fulcio(exts, 13), RECEIPT.commit], ['source ref', fulcio(exts, 14), RECEIPT.ref], ['run', fulcio(exts, 21), runUrl]];
  for (const [what, got, expected] of want) if (got !== expected) fail(`${name}'s certificate names ${what} ${got}, not ${expected}`);
  const statement = JSON.parse(payload);
  if (statement._type !== 'https://in-toto.io/Statement/v1' || statement.subject?.length !== 1) fail(`${file} is not an in-toto statement with one subject`);
  return { logIndex: e.logIndex, at, payload: body.spec.payloadHash.value, signature: body.spec.signatures[0].signature, serial: cert.serialNumber, statement, signer, runUrl, repoUrl };
}

// ---------------------------------------------------------------- the run logs the batch notes quote
function quotedJobs() {
  const notes = fs.readFileSync(RECEIPT.notes, 'utf8');
  const block = /### Log lines, quoted[\s\S]*?```text\n([\s\S]*?)\n```/.exec(notes)?.[1] ?? fail('the batch notes quote no log lines');
  return new Map(block.split(/\n\s*\n/).map((g) => [/job (\d+)/.exec(g.split('\n')[0])?.[1], g.split('\n').slice(1)]));
}

/** Page 11's lines, gaps and header values, printed from verified evidence; and what could not be verified. */
export function printReceipt() {
  const problems = [];
  const lines = [];
  const proved = {};
  const step = (key, fn) => {
    try {
      const line = fn();
      if (line) lines.push({ key, ...line, ...ROWS[key] });
    } catch (e) {
      const why = String(e.message || e).split('\n')[0];
      problems.push(`${key}: ${why}`);
      if (ROWS[key]) lines.push({ key, value: 'NOT VERIFIED', note: why, shows: [], partly: [] });
    }
  };
  let jobs = new Map();
  step('logs', () => {
    jobs = quotedJobs();
    for (const id of Object.values(RECEIPT.jobs)) if (!jobs.has(id)) fail(`the notes quote no lines of job ${id}`);
  });
  const log = (job, re, what) => {
    for (const l of jobs.get(job) ?? []) {
      const m = re.exec(l);
      if (m) return m;
    }
    return fail(`job ${job}'s quoted log has no ${what}`);
  };
  step('statements', () => {
    const rootBytes = fs.readFileSync(path.join(RECEIPT.evidence, 'sigstore-trusted-root.json'));
    if (sha256(rootBytes).toString('hex') !== RECEIPT.trustedRootSha256) fail('evidence/sigstore-trusted-root.json is not the pinned trusted root');
    const trusted = JSON.parse(rootBytes);
    const files = fs.readdirSync(RECEIPT.evidence).filter((f) => /^rekor-\d+\.json$/.test(f)).sort();
    const entries = files.map((f) => rekorStatement(path.join(RECEIPT.evidence, f), trusted));
    if (entries.length !== 2) fail(`evidence/ holds ${entries.length} Rekor entries, not 2`);
    for (const type of [SLSA, V2]) {
      const found = entries.filter((x) => x.statement.predicateType === type);
      if (found.length !== 1) fail(`evidence/ holds ${found.length} entries for ${type}`);
      proved[type] = found[0];
    }
    const digests = new Set(entries.map((x) => x.statement.subject[0].digest?.sha256));
    if (digests.size !== 1 || !/^[0-9a-f]{64}$/.test([...digests][0])) fail('the two statements name different artifacts');
    proved.artifact = { name: entries[0].statement.subject[0].name, digest: [...digests][0] };
    const slsa = proved[SLSA];
    const p = slsa.statement.predicate;
    const workflow = p?.buildDefinition?.externalParameters?.workflow;
    if (workflow?.ref !== RECEIPT.ref || workflow?.repository !== slsa.repoUrl || workflow?.path !== RECEIPT.workflow || p.buildDefinition.resolvedDependencies?.[0]?.digest?.gitCommit !== RECEIPT.commit
      || p.runDetails?.builder?.id !== slsa.signer || p.runDetails?.metadata?.invocationId !== slsa.runUrl) fail('the SLSA statement names another workflow, ref, commit or run');
    const record = proved[V2].statement.predicate?.commits;
    if (!Array.isArray(record) || record.length !== 1 || record[0].commit !== RECEIPT.commit) fail('the provenance/v2 statement holds no single record for the commit');
    proved.record = record[0];
  });
  const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
  step('SPEC', () => {
    try {
      gitBytes('merge-base', '--is-ancestor', RECEIPT.specCommit, RECEIPT.commit);
    } catch {
      fail('the spec commit is not an ancestor of the commit');
    }
    const added = git('show', '--format=', RECEIPT.specCommit, '--', 'specs/').split('\n').flatMap((l) => /^\+\| (SPEC-\d{3}-R\d+) \|/.exec(l)?.[1] ?? []);
    const tasks = git('show', '--name-status', '--format=', RECEIPT.specCommit).split('\n').filter((l) => /^[AR]/.test(l)).flatMap((l) => /\ttasks\/(TASK-[A-Z0-9-]+)\.task\.md$/.exec(l)?.[1] ?? []);
    if (added.length !== 1 || tasks.length !== 1) fail('the spec commit does not add exactly one requirement and one task file');
    return { value: `${added[0]} · ${tasks[0]}`, note: `added by commit ${RECEIPT.specCommit}` };
  });
  step('APPROVED', () => {
    const s = sshCommitSignature(RECEIPT.specCommit);
    return { value: s.fingerprint, sig: s.signature, note: `${s.type} key in approvers.txt · namespace git · flags: ${s.flags} · counter ${s.counter}` };
  });
  step('AGENT', () => {
    const producer = git('show', `${RECEIPT.specCommit}:.github/workflows/producer.yml`);
    const version = /^\s*CLAUDE_CODE_VERSION: "([\d.]+)"$/m.exec(producer)?.[1];
    const digest = /^\s*CLAUDE_CODE_SHA256: ([0-9a-f]{64})$/m.exec(producer)?.[1];
    const limits = /--max-turns (\d+) --max-budget-usd (\d+) /.exec(producer);
    if (!version || !digest || !limits || !/sha256sum -c/.test(producer)) fail('producer.yml in the signed tree pins no Claude Code version, digest and limits');
    const mcp = /--strict-mcp-config --mcp-config '(\{[^']*\})'/.exec(producer)?.[1];
    const servers = mcp ? Object.keys(JSON.parse(mcp).mcpServers ?? {}).length : 'not pinned';
    const run = log(RECEIPT.jobs.agent, /^RUN ENDED: success, (\d+) turns, estimated USD ([\d.]+)$/, 'end line');
    return {
      value: `sha256:${digest}`,
      note: `Claude Code ${version}, pinned in the signed tree · MCP servers allowed: ${servers} · run log: ${run[1]} of ${limits[1]} turns, est. $${Number(run[2]).toFixed(2)} of $${limits[2]}`,
    };
  });
  step('DIFF', () => {
    const bytes = gitBytes('-c', 'core.quotePath=true', 'diff', '--no-ext-diff', '--no-color', '--no-relative', '--src-prefix=a/', '--dst-prefix=b/', '--binary', '--no-renames', '--abbrev=7', RECEIPT.specCommit, RECEIPT.commit);
    const digest = sha256(bytes).toString('hex');
    if (log(RECEIPT.jobs.publish, /^\s*PATCH_SHA256: ([0-9a-f]{64})$/, 'PATCH_SHA256')[1] !== digest) fail('the publish job checked another diff');
    const tests = (jobs.get(RECEIPT.jobs.agent) ?? []).flatMap((l) => /^TOOL Bash: npm run check:(\w+)/.exec(l)?.[1] ?? []);
    return { value: `sha256:${digest}`, note: `git diff ${RECEIPT.specCommit.slice(0, 7)} ${RECEIPT.commit.slice(0, 7)}, which the publish job checked · run log: the agent ran ${tests.join(', ') || 'no check'} in its sandbox` };
  });
  step('COMMIT', () => {
    const message = git('log', '-1', '--format=%B', RECEIPT.commit).trim().split(/\n\s*\n/);
    const trailers = [...(message[message.length - 1] ?? '').matchAll(/^([A-Za-z-]+): (.+)$/gm)];
    const spec = trailers.filter((t) => t[1] === 'Spec').map((t) => t[2].trim());
    const agent = trailers.find((t) => t[1] === 'Agent')?.[2].trim();
    const passed = (jobs.get(RECEIPT.jobs.checks) ?? []).flatMap((l) => /^check (\w+) passed$/.exec(l)?.[1] ?? []);
    if (passed.join(' ') !== RECEIPT.checkOrder.join(' ')) fail('the checks job did not pass every check in order');
    return { value: RECEIPT.commit, note: `Spec: ${spec.join(', ') || 'none'} · Agent: ${agent ?? 'none'}, as the commit reports · run log: ${passed.length} of ${RECEIPT.checkOrder.length} checks passed, ${passed[0]} to ${passed[passed.length - 1]}` };
  });
  step('FILES', () => {
    const a = proved.artifact ?? fail('no statement verified');
    return { value: `sha256:${a.digest}`, note: `${a.name}, the subject of both statements below` };
  });
  step('SLSA', () => {
    const x = proved[SLSA] ?? fail('no statement verified');
    return { value: `sha256:${x.payload}`, sig: x.signature, note: `SLSA v1 statement · Rekor ${x.logIndex} · ${iso(x.at)}` };
  });
  step('RECORD', () => {
    const x = proved[V2] ?? fail('no statement verified');
    const r = proved.record;
    return { value: `sha256:${x.payload}`, sig: x.signature, note: `provenance/v2: ${r.spec_ids.join(', ')}, agent ${r.agent}, model ${r.model} · Rekor ${x.logIndex} · ${iso(x.at)}` };
  });
  step('SIGNER', () => {
    const x = proved[SLSA] ?? fail('no statement verified');
    const y = proved[V2];
    return { value: `${RECEIPT.workflow.split('/').pop()}@${RECEIPT.ref} · ${RECEIPT.runner}`, note: `run ${RECEIPT.run} · Fulcio certs ${x.serial} and ${y.serial} · issuer ${new URL(RECEIPT.issuer).host}` };
  });
  step('DEPLOY', () => {
    const a = proved.artifact ?? fail('no statement verified');
    const planned = Buffer.from(a.digest, 'hex').toString('base64');
    const change = log(RECEIPT.jobs.deploy, /^\s*~ source_code_hash\s+= "[A-Za-z0-9+/=]+" -> "([A-Za-z0-9+/=]+)"$/, 'source_code_hash change')[1];
    if (change !== planned) fail('Terraform planned another source_code_hash');
    const applied = log(RECEIPT.jobs.deploy, /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)\.\d+Z Apply complete! Resources: (\d+) added, (\d+) changed, (\d+) destroyed\.$/, 'apply line');
    const pipeline = git('show', `${RECEIPT.commit}:${RECEIPT.workflow}`);
    if (!/id-token: write/.test(pipeline) || !/aws-actions\/configure-aws-credentials@[0-9a-f]{40}/.test(pipeline) || !/role-to-assume:/.test(pipeline) || /aws-access-key-id|aws-secret-access-key/.test(pipeline)) fail('the deploy job does not take an OIDC role alone');
    proved.deployed = applied[1];
    return { value: `source_code_hash ${planned}`, note: `the FILES digest in base64, as Terraform planned it · OIDC role · run log: ${applied[2]} added, ${applied[3]} changed at ${applied[1]}Z` };
  });
  // What the receipt does not show yet, from what the proofs lack.
  const gaps = [];
  const r = proved.record ?? {};
  if (r.model === undefined || r.model === 'not recorded') gaps.push('the model');
  if (!('task' in r) && !('intent' in r)) gaps.push('intent and task lines');
  if (!('producer_run' in r)) gaps.push('the producer run');
  if (!proved[V2]?.statement.predicate?.factory) gaps.push('a hash of every agent input');
  const slsa = proved[SLSA];
  if (!slsa || slsa.signer.startsWith(`${slsa.repoUrl}/`)) gaps.push("a signer the agent can't edit");
  const vars = {
    ref: RECEIPT.ref.replace('refs/heads/', ''),
    run: RECEIPT.run,
    date: slsa ? new Date(slsa.at).toISOString().slice(0, 10) : 'NOT VERIFIED',
    deployed: proved.deployed ? proved.deployed.slice(11, 16) : 'NOT VERIFIED',
  };
  return { lines: RECEIPT_KEYS.map((k) => lines.find((l) => l.key === k)), gaps, vars, problems };
}
