/*
 * receipt-proof.mjs: the cryptography behind page 11's receipt, offline, with node:crypto alone.
 *
 * proveReceipt() derives every hash and signature the page may show, from git and from the public evidence in
 * evidence/, and verifies each signature as it goes. It returns the facts it proved, grouped by the receipt line that
 * may show them, and a list of problems. verify.mjs's Receipt check then holds each page line to its group.
 *
 *   spec      the spec commit adds the requirement under specs/ and the task file under tasks/
 *   approval  the spec commit's one signature header is an SSH signature (PROTOCOL.sshsig) by a security key that
 *             approvers.txt lists at its parent, namespace git, with the touch flag, and it verifies over the commit
 *   agent     the Claude Code version, SHA-256 and limits pinned in producer.yml, in the tree of the signed spec commit
 *   diff      the SHA-256 of `git diff --binary --no-renames --abbrev=7 <spec commit> <commit>`, the bytes the
 *             producer's agent job wrote and its publish job checked
 *   commit    the commit, its Spec and Agent trailers
 *   files     the artifact digest both signed statements name as their subject
 *   slsa, v2  for each statement: its SHA-256 equals the payload hash Rekor logged; its DSSE signature verifies with
 *             the Fulcio certificate Rekor logged; that certificate chains to Sigstore's Fulcio root and was valid
 *             when Rekor logged the entry; Rekor's signed entry timestamp and inclusion proof verify, and so does
 *             the checkpoint that proof ends at, all with the Rekor key in Sigstore's trusted root
 *   signer    what both certificates say: workflow, runner, the commit as signer and source digest, the run
 *
 * The trusted root is a pin, like fonts.json: fetched from Sigstore's TUF CDN on 2026-11-14 as the file targets.json
 * version 14 names by its SHA-256. This file does not walk TUF's signed metadata back to a root of trust.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const sha256 = (b) => crypto.createHash('sha256').update(b).digest();
// A signature check that cannot run, such as one with a key of the wrong type, does not verify.
const verifies = (...args) => {
  try {
    return crypto.verify(...args);
  } catch {
    return false;
  }
};
// An SSH wire string: uint32 length, then the bytes.
const wire = (b, at) => {
  const n = b.readUInt32BE(at);
  return [b.subarray(at + 4, at + 4 + n), at + 4 + n];
};
const lengthPrefixed = (b) => {
  const n = Buffer.alloc(4);
  n.writeUInt32BE(b.length);
  return Buffer.concat([n, b]);
};
// A canonical JSON form: keys sorted, no spaces. Rekor signs its entry timestamp over this.
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));

// The value of a Fulcio extension (OID 1.3.6.1.4.1.57264.1.<n>, n >= 8): a DER UTF8String inside the extension's
// OCTET STRING. Read from a certificate whose signature has already been verified.
function fulcioExtension(der, n) {
  const oid = Buffer.from([0x06, 0x0a, 0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xbf, 0x30, 0x01, n]);
  const at = der.indexOf(oid);
  if (at < 0) return null;
  let i = at + oid.length;
  if (der[i] === 0x01) i += 3; // critical BOOLEAN
  if (der[i] !== 0x04) return null;
  i += der[i + 1] & 0x80 ? 2 + (der[i + 1] & 0x7f) : 2;
  if (der[i] !== 0x0c) return null;
  const len = der[i + 1] & 0x80 ? der.readUIntBE(i + 2, der[i + 1] & 0x7f) : der[i + 1];
  const start = i + 2 + (der[i + 1] & 0x80 ? der[i + 1] & 0x7f : 0);
  return der.subarray(start, start + len).toString('utf8');
}

// RFC 9162, 2.1.3.2: the root an inclusion proof gives, or null. Division, not >>, for indexes past 2^31.
function inclusionRoot(leaf, index, size, hashes) {
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

// The SSH signature of a commit, verified. Only the commit's headers are read, and it must have exactly one
// signature header, the one git verifies for the repository's object format.
function sshCommitSignature(raw, objectFormat, approverKeys) {
  const cut = raw.indexOf('\n\n');
  const lines = raw.slice(0, cut).split('\n');
  const want = objectFormat === 'sha256' ? 'gpgsig-sha256' : 'gpgsig';
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
  if (sigs.length !== 1 || sigs[0][0] !== want) throw new Error(`not exactly one ${want} header`);
  const armored = /^-----BEGIN SSH SIGNATURE-----\n([\s\S]*?)\n-----END SSH SIGNATURE-----$/.exec(sigs[0][1].trim());
  if (!armored) throw new Error('the signature is not an SSH signature');
  const blob = Buffer.from(armored[1].replace(/\s/g, ''), 'base64');
  if (blob.subarray(0, 6).toString() !== 'SSHSIG' || blob.readUInt32BE(6) !== 1) throw new Error('not an SSHSIG version 1 blob');
  const [publicKey, a1] = wire(blob, 10);
  const [namespace, a2] = wire(blob, a1);
  const [reserved, a3] = wire(blob, a2);
  const [hashAlg, a4] = wire(blob, a3);
  const [signature] = wire(blob, a4);
  const [keyType, k1] = wire(publicKey, 0);
  if (keyType.toString() !== 'sk-ecdsa-sha2-nistp256@openssh.com') throw new Error(`key type ${keyType} is not one this check verifies`);
  const [curve, k2] = wire(publicKey, k1);
  const [point, k3] = wire(publicKey, k2);
  const [application] = wire(publicKey, k3);
  const [sigType, s1] = wire(signature, 0);
  const [rs, s2] = wire(signature, s1);
  const flags = signature[s2];
  const counter = signature.readUInt32BE(s2 + 1);
  if (sigType.toString() !== keyType.toString() || curve.toString() !== 'nistp256' || point[0] !== 4 || point.length !== 65) throw new Error('malformed key or signature');
  if (namespace.toString() !== 'git') throw new Error(`namespace ${namespace} is not git`);
  if (!['sha256', 'sha512'].includes(hashAlg.toString())) throw new Error(`hash ${hashAlg} is not sha256 or sha512`);
  if (!approverKeys.includes(publicKey.toString('base64'))) throw new Error('the key is not in approvers.txt at the parent');
  if (!(flags & 0x01)) throw new Error('the signature does not assert a touch');
  // What git signed: the commit without its signature header.
  const message = Buffer.from(kept.join('\n') + raw.slice(cut), 'latin1');
  const signed = Buffer.concat([Buffer.from('SSHSIG'), lengthPrefixed(namespace), lengthPrefixed(reserved), lengthPrefixed(hashAlg), lengthPrefixed(crypto.createHash(hashAlg.toString()).update(message).digest())]);
  // A security key signs SHA-256(application) || flags || counter || SHA-256(data), as OpenSSH's ssh-ecdsa-sk.c checks.
  const count = Buffer.alloc(4);
  count.writeUInt32BE(counter);
  const tbs = Buffer.concat([sha256(application), Buffer.from([flags]), count, sha256(signed)]);
  const [r, r1] = wire(rs, 0);
  const [s] = wire(rs, r1);
  const int = (x) => {
    let i = 0;
    while (i < x.length - 1 && x[i] === 0) i++;
    const v = x.subarray(i);
    const body = v[0] & 0x80 ? Buffer.concat([Buffer.from([0]), v]) : v;
    return Buffer.concat([Buffer.from([2, body.length]), body]);
  };
  const seq = Buffer.concat([int(r), int(s)]);
  const der = Buffer.concat([Buffer.from([0x30, seq.length]), seq]);
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') }, format: 'jwk' });
  if (!verifies('sha256', tbs, { key, dsaEncoding: 'der' }, der)) throw new Error('the signature does not verify');
  return {
    keyType: keyType.toString(),
    fingerprint: `SHA256:${sha256(publicKey).toString('base64').replace(/=+$/, '')}`,
    signature: rs.toString('base64'),
    application: application.toString(),
    counter,
  };
}

// One Rekor DSSE entry and the statement it logged, verified end to end against the trusted root.
function rekorStatement(entryFile, statementFile, trusted) {
  const [[uuid, e]] = Object.entries(JSON.parse(fs.readFileSync(entryFile, 'utf8')));
  const bodyBytes = Buffer.from(e.body, 'base64');
  const body = JSON.parse(bodyBytes);
  if (body.kind !== 'dsse' || body.spec?.signatures?.length !== 1) throw new Error(`${path.basename(entryFile)} is not a DSSE entry with one signature`);
  const tlog = trusted.tlogs.find((t) => Buffer.from(t.logId.keyId, 'base64').toString('hex') === e.logID);
  if (!tlog) throw new Error(`log ${e.logID.slice(0, 16)} is not in the trusted root`);
  const rekorKey = crypto.createPublicKey({ key: Buffer.from(tlog.publicKey.rawBytes, 'base64'), format: 'der', type: 'spki' });
  const set = verifies('sha256', Buffer.from(canon({ body: e.body, integratedTime: e.integratedTime, logID: e.logID, logIndex: e.logIndex })), rekorKey, Buffer.from(e.verification.signedEntryTimestamp, 'base64'));
  if (!set) throw new Error(`Rekor's signed entry timestamp for ${e.logIndex} does not verify`);
  const proof = e.verification.inclusionProof;
  const root = inclusionRoot(sha256(Buffer.concat([Buffer.from([0]), bodyBytes])), proof.logIndex, proof.treeSize, proof.hashes);
  if (!root || root.toString('hex') !== proof.rootHash) throw new Error(`the inclusion proof for ${e.logIndex} does not reach its root`);
  const [note, sigs] = proof.checkpoint.split('\n\n');
  const [, size, rootB64] = note.split('\n');
  if (Number(size) !== proof.treeSize || Buffer.from(rootB64, 'base64').toString('hex') !== proof.rootHash) throw new Error(`the checkpoint for ${e.logIndex} names another tree`);
  const line = sigs.split('\n').find((l) => l.startsWith('\u2014 rekor.sigstore.dev '));
  if (!line || !verifies('sha256', Buffer.from(`${note}\n`), rekorKey, Buffer.from(line.split(' ')[2], 'base64').subarray(4))) throw new Error(`the checkpoint for ${e.logIndex} is not signed by Rekor`);
  const payload = fs.readFileSync(statementFile);
  if (sha256(payload).toString('hex') !== body.spec.payloadHash.value) throw new Error(`${path.basename(statementFile)} is not the payload Rekor logged`);
  const leafPem = Buffer.from(body.spec.signatures[0].verifier, 'base64').toString();
  const leaf = new crypto.X509Certificate(leafPem);
  const pae = Buffer.concat([Buffer.from('DSSEv1 28 application/vnd.in-toto+json '), Buffer.from(`${payload.length} `), payload]);
  if (!verifies('sha256', pae, leaf.publicKey, Buffer.from(body.spec.signatures[0].signature, 'base64'))) throw new Error(`the DSSE signature in ${e.logIndex} does not verify`);
  const chained = trusted.certificateAuthorities.some((ca) => {
    const chain = ca.certChain.certificates.map((c) => new crypto.X509Certificate(Buffer.from(c.rawBytes, 'base64')));
    return leaf.verify(chain[0].publicKey) && chain.every((c, i) => c.verify((chain[i + 1] ?? c).publicKey));
  });
  if (!chained) throw new Error(`the certificate in ${e.logIndex} does not chain to a Fulcio root`);
  const at = e.integratedTime * 1000;
  if (at < Date.parse(leaf.validFrom) || at > Date.parse(leaf.validTo)) throw new Error(`the certificate in ${e.logIndex} was not valid when Rekor logged it`);
  const statement = JSON.parse(payload);
  return {
    uuid,
    logIndex: e.logIndex,
    integrated: new Date(at).toISOString().replace('.000Z', 'Z'),
    payloadSha256: body.spec.payloadHash.value,
    signature: body.spec.signatures[0].signature,
    serial: leaf.serialNumber,
    workflow: leaf.subjectAltName?.replace(/^URI:/, ''),
    signerDigest: fulcioExtension(leaf.raw, 10),
    runner: fulcioExtension(leaf.raw, 11),
    sourceDigest: fulcioExtension(leaf.raw, 13),
    sourceRef: fulcioExtension(leaf.raw, 14),
    run: fulcioExtension(leaf.raw, 21),
    statement,
  };
}

/** Every fact page 11 may show, proved; and what failed. */
export function proveReceipt({ root, evidence, commit, specCommit }) {
  const facts = {};
  const problems = [];
  const add = (group, ...values) => (facts[group] ??= []).push(...values.filter((v) => v !== undefined && v !== null).map(String));
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'latin1', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
  const step = (name, fn) => {
    try {
      fn();
    } catch (e) {
      problems.push(`${name}: ${String(e.message || e).split('\n')[0]}`);
    }
  };
  step('commit', () => {
    const message = git('log', '-1', '--format=%B', commit);
    const paragraphs = message.trim().split(/\n\s*\n/);
    const trailers = [...(paragraphs[paragraphs.length - 1] ?? '').matchAll(/^([A-Za-z-]+): (.+)$/gm)].map((x) => [x[1], x[2].trim()]);
    add('commit', commit, ...trailers.map(([k, v]) => `${k}: ${v}`));
    facts.trailers = trailers;
  });
  step('spec', () => {
    try {
      git('merge-base', '--is-ancestor', specCommit, commit);
    } catch {
      throw new Error(`${specCommit.slice(0, 7)} is not an ancestor of ${commit.slice(0, 7)}`);
    }
    const added = git('show', '--format=', specCommit, '--', 'specs/').split('\n').flatMap((l) => /^\+\| (SPEC-\d{3}-R\d+) \|/.exec(l)?.[1] ?? []);
    const tasks = git('show', '--name-status', '--format=', specCommit).split('\n').filter((l) => /^[AR]/.test(l)).flatMap((l) => /\ttasks\/(TASK-[A-Z0-9-]+)\.task\.md$/.exec(l)?.[1] ?? []);
    if (!added.length) throw new Error(`${specCommit.slice(0, 7)} adds no requirement under specs/`);
    if (!tasks.length) throw new Error(`${specCommit.slice(0, 7)} adds no task file`);
    add('spec', specCommit, ...added, ...tasks);
  });
  step('approval', () => {
    const keys = git('show', `${specCommit}^:approvers.txt`).split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).flatMap((l) => l.trim().split(/\s+/).filter((w) => w.startsWith('AAAA')));
    const sig = sshCommitSignature(git('cat-file', 'commit', specCommit), git('rev-parse', '--show-object-format').trim(), keys);
    add('approval', sig.keyType.replace('@openssh.com', ''), sig.fingerprint, sig.signature, 'touch', specCommit);
  });
  step('agent', () => {
    const producer = git('show', `${specCommit}:.github/workflows/producer.yml`);
    const version = /^\s*CLAUDE_CODE_VERSION: "([\d.]+)"$/m.exec(producer)?.[1];
    const digest = /^\s*CLAUDE_CODE_SHA256: ([0-9a-f]{64})$/m.exec(producer)?.[1];
    const limits = /--max-turns (\d+) --max-budget-usd (\d+)/.exec(producer);
    if (!version || !digest || !limits) throw new Error(`producer.yml at ${specCommit.slice(0, 7)} pins no Claude Code version, digest or limits`);
    add('agent', `Claude Code ${version}`, `sha256:${digest}`, `${limits[1]} turns`, `$${limits[2]}`);
  });
  step('diff', () => {
    const bytes = execFileSync('git', ['-C', root, 'diff', '--binary', '--no-renames', '--abbrev=7', specCommit, commit], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
    add('diff', `sha256:${sha256(bytes).toString('hex')}`, specCommit.slice(0, 7), commit.slice(0, 7));
  });
  step('statements', () => {
    const trusted = JSON.parse(fs.readFileSync(path.join(evidence, 'sigstore-trusted-root.json'), 'utf8'));
    const entries = fs.readdirSync(evidence).filter((f) => /^rekor-\d+\.json$/.test(f)).sort();
    const statements = { 'https://slsa.dev/provenance/v1': 'slsa-provenance-v1.statement.json', 'https://github.com/PaulDuvall/who-gets-the-keys/provenance/v2': 'provenance-v2.statement.json' };
    const proved = entries.map((f) => {
      const raw = JSON.parse(fs.readFileSync(path.join(evidence, f), 'utf8'));
      const body = JSON.parse(Buffer.from(Object.values(raw)[0].body, 'base64'));
      const file = Object.values(statements).find((s) => sha256(fs.readFileSync(path.join(evidence, s))).toString('hex') === body.spec.payloadHash.value);
      if (!file) throw new Error(`${f} logs no statement in evidence/`);
      return rekorStatement(path.join(evidence, f), path.join(evidence, file), trusted);
    });
    const subjects = new Set();
    for (const p of proved) {
      const group = p.statement.predicateType === 'https://slsa.dev/provenance/v1' ? 'slsa' : 'v2';
      for (const s of p.statement.subject) subjects.add(s.digest.sha256);
      if (p.signerDigest !== commit || p.sourceDigest !== commit) throw new Error(`Rekor ${p.logIndex}'s certificate names another commit`);
      add(group, `sha256:${p.payloadSha256}`, p.signature, `Rekor ${p.logIndex}`, p.integrated, p.serial, p.uuid, p.statement.predicateType, p.statement.predicateType.split('/').slice(-2).join('/'));
      add('signer', p.workflow?.replace(/^https:\/\/github\.com\/[^/]+\/[^/]+\/\.github\/workflows\//, ''), p.runner, p.signerDigest, p.run, p.serial);
      if (group === 'v2') {
        const record = p.statement.predicate.commits?.find((c) => c.commit === commit);
        if (!record) throw new Error('the provenance/v2 statement holds no record for the commit');
        add('v2', ...record.spec_ids, `agent ${record.agent}`, `model ${record.model}`);
      }
      if (group === 'slsa') add('slsa', p.statement.predicate.runDetails?.metadata?.invocationId);
    }
    if (proved.length !== 2 || subjects.size !== 1) throw new Error('evidence/ needs exactly two statements, both over one artifact');
    add('files', `sha256:${[...subjects][0]}`);
    add('deploy', Buffer.from([...subjects][0], 'hex').toString('base64'));
  });
  return { facts, problems };
}
