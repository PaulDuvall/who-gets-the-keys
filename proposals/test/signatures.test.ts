import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SECURITY_KEY_TYPES, approverKeys, commitSignature, lacksTouchAndPin, sshSignature, verifySigned } from "../scripts/checks.ts";

const SK = "sk-ssh-ed25519@openssh.com";
const TOUCH = 0x01;
const PIN = 0x04;
const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const str = (v: Buffer | string): Buffer => {
  const b = typeof v === "string" ? Buffer.from(v, "latin1") : v;
  return Buffer.concat([u32(b.length), b]);
};
const digest = (alg: string, b: Buffer): Buffer => createHash(alg).update(b).digest();
const armor = (blob: Buffer): string =>
  ["-----BEGIN SSH SIGNATURE-----", ...(blob.toString("base64").match(/.{1,70}/g) ?? []), "-----END SSH SIGNATURE-----", ""].join("\n");

interface FakeKey { privateKey: KeyObject; application: string; blob: Buffer; line: string }

// A software stand-in for a FIDO2 key: an Ed25519 key published as sk-ssh-ed25519, so a test chooses the flags a
// real authenticator would assert. ssh-keygen verifies its signatures exactly as it verifies hardware-made ones.
function fakeSecurityKey(): FakeKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x ?? "", "base64url");
  const application = "ssh:";
  const blob = Buffer.concat([str(SK), str(raw), str(application)]);
  return { privateKey, application, blob, line: `${SK} ${blob.toString("base64")}` };
}

// An SSH signature in namespace git (OpenSSH PROTOCOL.sshsig) whose security-key flags are `flags` (PROTOCOL.u2f).
function skSign(key: FakeKey, message: Buffer, flags: number): string {
  const signed = Buffer.concat([Buffer.from("SSHSIG"), str("git"), str(""), str("sha512"), str(digest("sha512", message))]);
  const assertion = Buffer.concat([digest("sha256", Buffer.from(key.application)), Buffer.from([flags]), u32(1), digest("sha256", signed)]);
  const inner = Buffer.concat([str(SK), str(sign(null, assertion, key.privateKey)), Buffer.from([flags]), u32(1)]);
  return armor(Buffer.concat([Buffer.from("SSHSIG"), u32(1), str(key.blob), str("git"), str(""), str("sha512"), str(inner)]));
}

describe("SPEC-001-R12 approver signatures come from a security key, with a touch and a PIN", () => {
  const dir = mkdtempSync(join(tmpdir(), "sk-sig-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("SPEC-001-R12 reads each approver's principal and key type", () => {
    const approvers = [
      "# one line per approver",
      `alice@example.com namespaces="git" ${SK} AAAA comment`,
      "",
      "bob@example.com ssh-ed25519 AAAA",
      'carol@example.com cert-authority,namespaces="git,file" sk-ecdsa-sha2-nistp256@openssh.com AAAA',
    ].join("\n");
    expect(approverKeys(approvers)).toEqual([
      { principal: "alice@example.com", keyType: SK },
      { principal: "bob@example.com", keyType: "ssh-ed25519" },
      { principal: "carol@example.com", keyType: "sk-ecdsa-sha2-nistp256@openssh.com" },
    ]);
    expect(approverKeys(readFileSync("approvers.txt.example", "utf8")).every((k) => SECURITY_KEY_TYPES.includes(k.keyType))).toBe(true);
  });

  it("SPEC-001-R12 reads the key type and the touch and PIN flags of an SSH signature", () => {
    const key = fakeSecurityKey();
    const message = Buffer.from("payload");
    for (const flags of [0, TOUCH, PIN, TOUCH | PIN, TOUCH | PIN | 0x20]) {
      const sig = sshSignature(skSign(key, message, flags));
      expect(sig).toEqual({ keyType: SK, flags });
      expect(lacksTouchAndPin(sig)).toBe((flags & (TOUCH | PIN)) !== (TOUCH | PIN));
    }
    execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(dir, "plain")]);
    writeFileSync(join(dir, "msg"), message);
    execFileSync("ssh-keygen", ["-q", "-Y", "sign", "-n", "git", "-f", join(dir, "plain"), join(dir, "msg")]);
    const plain = sshSignature(readFileSync(join(dir, "msg.sig"), "utf8"));
    expect(plain).toEqual({ keyType: "ssh-ed25519", flags: undefined });
    expect(lacksTouchAndPin(plain)).toBe(false);
    expect(sshSignature("not a signature")).toBeUndefined();
    expect(sshSignature(armor(Buffer.from("SSHSIG\u0000\u0000")))).toBeUndefined();
    expect(lacksTouchAndPin(undefined)).toBe(true);
  });

  describe("SPEC-001-R12 security-key signatures on real commits", () => {
    const repo = join(dir, "repo");
    const key = fakeSecurityKey();
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
    const approvers = `t@example.com namespaces="git" ${key.line}\n`;

    // Writes a commit object signed by the fake security key with the given flags, and moves main to it.
    function commit(files: Record<string, string>, message: string, flags: number | "plain" | "none"): string {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(join(repo, path, ".."), { recursive: true });
        writeFileSync(join(repo, path), text);
      }
      git("add", ".");
      const tree = git("write-tree").trim();
      const parent = spawnSync("git", ["rev-parse", "--verify", "-q", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();
      const head = `tree ${tree}\n${parent ? `parent ${parent}\n` : ""}author t <t@example.com> 1700000000 +0000\ncommitter t <t@example.com> 1700000000 +0000\n`;
      const payload = `${head}\n${message}\n`;
      let signature = "";
      if (flags === "plain") {
        writeFileSync(join(dir, "payload"), payload);
        execFileSync("ssh-keygen", ["-q", "-Y", "sign", "-n", "git", "-f", join(dir, "plain"), join(dir, "payload")]);
        signature = readFileSync(join(dir, "payload.sig"), "utf8");
        rmSync(join(dir, "payload.sig"));
      } else if (flags !== "none") {
        signature = skSign(key, Buffer.from(payload), flags);
      }
      const gpgsig = signature ? `gpgsig ${signature.trimEnd().split("\n").join("\n ")}\n` : "";
      const sha = execFileSync("git", ["hash-object", "-t", "commit", "-w", "--stdin"], { cwd: repo, input: `${head}${gpgsig}\n${message}\n`, encoding: "utf8" }).trim();
      git("update-ref", "HEAD", sha);
      git("reset", "-q", "--hard");
      return sha;
    }
    const signaturesCheck = () => spawnSync(process.execPath, [join(process.cwd(), "scripts/checks.ts"), "signatures"], { cwd: repo, encoding: "utf8" });

    it("SPEC-001-R12 accepts a touch-and-PIN signature, and ssh-keygen alone accepts one without", () => {
      mkdirSync(repo);
      git("init", "-q", "-b", "main");
      const both = commit({ "approvers.txt": approvers }, "add approver", TOUCH | PIN);
      expect(verifySigned(both, approvers, repo)).toBe(true);
      expect(commitSignature(git("cat-file", "commit", both))).toMatch(/^-----BEGIN SSH SIGNATURE-----\n/);
      expect(lacksTouchAndPin(sshSignature(commitSignature(git("cat-file", "commit", both)) ?? ""))).toBe(false);
      expect(signaturesCheck().status).toBe(0);

      const touchOnly = commit({ "specs/a.md": "a" }, "spec change", TOUCH);
      expect(verifySigned(touchOnly, approvers, repo)).toBe(true);
      const result = signaturesCheck();
      expect(result.stdout.trim()).toBe(`CHECK signatures FAILED: approver signature without touch and PIN: ${touchOnly.slice(0, 12)}`);
      expect(result.status).not.toBe(0);
    });

    it("SPEC-001-R12 binds the flags to the signature, so changing them breaks it", () => {
      const raw = git("cat-file", "commit", "HEAD");
      const armored = commitSignature(raw) ?? "";
      const blob = Buffer.from(armored.replace(/-----(?:BEGIN|END) SSH SIGNATURE-----/g, "").replace(/\s/g, ""), "base64");
      blob.writeUInt8(TOUCH | PIN, blob.length - 5);
      const forged = raw.replace(armored.trimEnd().split("\n").join("\n "), armor(blob).trimEnd().split("\n").join("\n "));
      const sha = execFileSync("git", ["hash-object", "-t", "commit", "-w", "--stdin"], { cwd: repo, input: forged, encoding: "utf8" }).trim();
      expect(sshSignature(commitSignature(git("cat-file", "commit", sha)) ?? "")).toEqual({ keyType: SK, flags: TOUCH | PIN });
      expect(verifySigned(sha, approvers, repo)).toBe(false);
    });

    it("SPEC-001-R12 fails while approvers.txt holds a key that is not a security key", () => {
      git("update-ref", "HEAD", git("rev-parse", "HEAD~1").trim());
      git("reset", "-q", "--hard");
      const plainPub = readFileSync(join(dir, "plain.pub"), "utf8").split(" ").slice(0, 2).join(" ");
      commit({ "approvers.txt": `${approvers}p@example.com namespaces="git" ${plainPub}\n` }, "add a software approver", TOUCH | PIN);
      expect(signaturesCheck().stdout.trim()).toBe("CHECK signatures FAILED: approver key is not a security key: p@example.com");
      expect(commitSignature(`tree x\n\nno signature\n`)).toBeUndefined();
      expect(commitSignature(`tree x\ngpgsig-sha256 -----BEGIN SSH SIGNATURE-----\n abc\n -----END SSH SIGNATURE-----\n\nm\n`))
        .toBe("-----BEGIN SSH SIGNATURE-----\nabc\n-----END SSH SIGNATURE-----");
    });
  });
});
