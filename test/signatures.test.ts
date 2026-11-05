import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  REQUIRED_SIGNATURE_FLAGS, SECURITY_KEY_TYPES, approverKeys, commitSignature, flagWords, lacksRequiredFlags, requiredFlagsIn, sshSignature, verifySigned,
} from "../scripts/checks.ts";

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

describe("SPEC-001-R12 approver signatures come from a security key, with a touch", () => {
  const dir = mkdtempSync(join(tmpdir(), "sk-sig-"));
  // A plain software key, made once so that no test depends on another having run first.
  beforeAll(() => execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(dir, "plain")]));
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
    expect(approverKeys(`a@example.com ${SK} ssh-ed25519 AAAAC3Nza\nb@example.com nonsense\n`)).toEqual([
      { principal: "a@example.com", keyType: "ssh-ed25519" },
      { principal: "b@example.com", keyType: "" },
    ]);
    expect(approverKeys(readFileSync("approvers.txt.example", "utf8")).every((k) => SECURITY_KEY_TYPES.includes(k.keyType))).toBe(true);
  });

  it("SPEC-001-R12 requires a touch plus REQUIRED_SIGNATURE_FLAGS: touch and PIN passes, PIN without touch and no flags fail", () => {
    const key = fakeSecurityKey();
    const flagged = (flags: number) => sshSignature(skSign(key, Buffer.from("payload"), flags));
    // Written against the constant, so raising it to 0x05 is a one-constant change that these tests still pass.
    const pinRequired = (REQUIRED_SIGNATURE_FLAGS & PIN) !== 0;
    expect(flagWords()).toBe(pinRequired ? "touch and PIN" : "touch");
    expect(lacksRequiredFlags(flagged(TOUCH))).toBe(pinRequired);
    expect(lacksRequiredFlags(flagged(TOUCH | PIN))).toBe(false);
    expect(lacksRequiredFlags(flagged(PIN))).toBe(true);
    expect(lacksRequiredFlags(flagged(0))).toBe(true);
    // Touch only at 0x01 and touch and PIN at 0x05, whatever the constant holds. The touch flag is always required.
    expect(flagWords(TOUCH)).toBe("touch");
    expect(lacksRequiredFlags(flagged(TOUCH), TOUCH)).toBe(false);
    expect(flagWords(TOUCH | PIN)).toBe("touch and PIN");
    expect(lacksRequiredFlags(flagged(TOUCH), TOUCH | PIN)).toBe(true);
    expect(lacksRequiredFlags(flagged(TOUCH | PIN), TOUCH | PIN)).toBe(false);
    expect(lacksRequiredFlags(flagged(PIN), PIN)).toBe(true);
    expect(lacksRequiredFlags(flagged(0), 0)).toBe(true);
    expect(flagWords(0)).toBe("touch");
  });

  it("SPEC-001-R12 reads the required flags from a copy of scripts/checks.ts, with a touch as the floor", () => {
    expect(requiredFlagsIn(readFileSync("scripts/checks.ts", "utf8"))).toBe(REQUIRED_SIGNATURE_FLAGS | TOUCH);
    expect(requiredFlagsIn("export const REQUIRED_SIGNATURE_FLAGS: number = 0x05;\n")).toBe(TOUCH | PIN);
    expect(requiredFlagsIn("// x\nexport const REQUIRED_SIGNATURE_FLAGS = 4;\n")).toBe(TOUCH | PIN);
    expect(requiredFlagsIn("export const REQUIRED_SIGNATURE_FLAGS = 0;\n")).toBe(TOUCH);
    expect(requiredFlagsIn("export const TOUCH_AND_PIN = 0x05;\n")).toBe(TOUCH);
    expect(requiredFlagsIn(undefined)).toBe(TOUCH);
  });

  it("SPEC-001-R12 reads the key type and the flags of an SSH signature, and fails closed on unknown types", () => {
    const key = fakeSecurityKey();
    const message = Buffer.from("payload");
    const must = REQUIRED_SIGNATURE_FLAGS | TOUCH;
    for (const flags of [0, TOUCH, PIN, TOUCH | PIN, TOUCH | PIN | 0x20]) {
      const sig = sshSignature(skSign(key, message, flags));
      expect(sig).toEqual({ keyType: SK, flags });
      expect(lacksRequiredFlags(sig)).toBe((flags & must) !== must);
    }
    writeFileSync(join(dir, "msg"), message);
    execFileSync("ssh-keygen", ["-q", "-Y", "sign", "-n", "git", "-f", join(dir, "plain"), join(dir, "msg")]);
    const plain = sshSignature(readFileSync(join(dir, "msg.sig"), "utf8"));
    expect(plain).toEqual({ keyType: "ssh-ed25519", flags: undefined });
    expect(lacksRequiredFlags(plain)).toBe(false);
    // A WebAuthn security-key signature carries the same flags; an unknown key type fails closed.
    const shaped = (keyType: string, sigType: string, flags: number[] | null) => armor(Buffer.concat([Buffer.from("SSHSIG"), u32(1),
      str(Buffer.concat([str(keyType), str("pk")])), str("git"), str(""), str("sha512"),
      str(Buffer.concat([str(sigType), str("sig"), ...(flags === null ? [] : [Buffer.from(flags), u32(1)])]))]));
    const webauthn = sshSignature(shaped("sk-ecdsa-sha2-nistp256@openssh.com", "webauthn-sk-ecdsa-sha2-nistp256@openssh.com", [TOUCH]));
    expect(webauthn).toEqual({ keyType: "sk-ecdsa-sha2-nistp256@openssh.com", flags: TOUCH });
    expect(lacksRequiredFlags(webauthn, TOUCH)).toBe(false);
    expect(lacksRequiredFlags(webauthn, TOUCH | PIN)).toBe(true);
    expect(lacksRequiredFlags(sshSignature(shaped("sk-ecdsa-sha2-nistp256@openssh.com", "webauthn-sk-ecdsa-sha2-nistp256@openssh.com", [PIN])))).toBe(true);
    expect(lacksRequiredFlags(sshSignature(shaped("webauthn-sk-ecdsa-sha2-nistp256@openssh.com", "webauthn-sk-ecdsa-sha2-nistp256@openssh.com", [TOUCH])))).toBe(true);
    expect(lacksRequiredFlags(sshSignature(shaped("sk-unknown@example.com", "sk-unknown@example.com", [TOUCH | PIN])))).toBe(true);
    expect(lacksRequiredFlags(sshSignature(shaped("ssh-ed25519", "webauthn-sk-ecdsa-sha2-nistp256@openssh.com", [TOUCH])))).toBe(true);
    expect(lacksRequiredFlags({ keyType: "ssh-ed25519-cert-v01@openssh.com", flags: undefined })).toBe(true);
    expect(lacksRequiredFlags({ keyType: SK, flags: undefined })).toBe(true);
    expect(sshSignature(shaped(SK, SK, null))).toBeUndefined();
    expect(sshSignature("not a signature")).toBeUndefined();
    expect(sshSignature(armor(Buffer.from("SSHSIG\u0000\u0000")))).toBeUndefined();
    expect(lacksRequiredFlags(undefined)).toBe(true);
  });

  describe("SPEC-001-R12 security-key signatures on real commits", () => {
    const repo = join(dir, "repo");
    const key = fakeSecurityKey();
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
    const approvers = `t@example.com namespaces="git" ${key.line}\n`;

    // Writes a commit object signed by the fake security key with the given flags, and moves main to it. A `decoy`
    // signature goes in a gpgsig-sha256 header before gpgsig, which git leaves out of a SHA-1 commit's signed payload.
    function commit(files: Record<string, string>, message: string, flags: number | "plain" | "none", decoy?: string): string {
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
      const header = (name: string, armored: string) => `${name} ${armored.trimEnd().split("\n").join("\n ")}\n`;
      const gpgsig = `${decoy ? header("gpgsig-sha256", decoy) : ""}${signature ? header("gpgsig", signature) : ""}`;
      const sha = execFileSync("git", ["hash-object", "-t", "commit", "-w", "--stdin"], { cwd: repo, input: `${head}${gpgsig}\n${message}\n`, encoding: "utf8" }).trim();
      git("update-ref", "HEAD", sha);
      git("reset", "-q", "--hard");
      return sha;
    }
    const signaturesCheck = () => spawnSync(process.execPath, [join(process.cwd(), "scripts/checks.ts"), "signatures"], { cwd: repo, encoding: "utf8" });

    it("SPEC-001-R12 accepts a touch-only or touch-and-PIN signature, and ssh-keygen alone accepts one without a touch", () => {
      mkdirSync(repo);
      git("init", "-q", "-b", "main");
      const both = commit({ "approvers.txt": approvers }, "add approver", TOUCH | PIN);
      expect(verifySigned(both, approvers, repo)).toBe(true);
      expect(commitSignature(git("cat-file", "commit", both))).toMatch(/^-----BEGIN SSH SIGNATURE-----\n/);
      expect(lacksRequiredFlags(sshSignature(commitSignature(git("cat-file", "commit", both)) ?? ""))).toBe(false);
      expect(signaturesCheck().status).toBe(0);
      commit({ "specs/a.md": "a" }, "spec change", TOUCH);
      expect(signaturesCheck().status).toBe(0);

      const pinOnly = commit({ "specs/a.md": "b" }, "spec change without a touch", PIN);
      expect(verifySigned(pinOnly, approvers, repo)).toBe(true);
      const result = signaturesCheck();
      expect(result.stdout.trim()).toBe(`CHECK signatures FAILED: approver signature without touch: ${pinOnly.slice(0, 12)}`);
      expect(result.status).not.toBe(0);
    });

    it("SPEC-001-R12 requires touch and PIN only on commits after the constant is raised to 0x05", () => {
      git("update-ref", "HEAD", git("rev-parse", "HEAD~1").trim());
      git("reset", "-q", "--hard");
      const raised = commit({ "specs/raise.md": "r", "scripts/checks.ts": "export const REQUIRED_SIGNATURE_FLAGS: number = 0x05;\n" }, "raise", TOUCH);
      expect(signaturesCheck().status).toBe(0);
      commit({ "specs/a.md": "c" }, "spec change with touch and PIN", TOUCH | PIN);
      expect(signaturesCheck().status).toBe(0);
      const touchOnly = commit({ "specs/a.md": "d" }, "spec change with a touch only", TOUCH);
      expect(signaturesCheck().stdout.trim()).toBe(`CHECK signatures FAILED: approver signature without touch and PIN: ${touchOnly.slice(0, 12)}`);
      git("update-ref", "HEAD", git("rev-parse", `${raised}~1`).trim());
      git("reset", "-q", "--hard");
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

    it("SPEC-001-R12 reads only the signature git verifies, so a decoy signature header fails closed", () => {
      const base = git("rev-parse", "HEAD").trim();
      const touched = commitSignature(git("cat-file", "commit", base)) ?? "";
      expect(sshSignature(touched)).toEqual({ keyType: SK, flags: TOUCH });
      // No touch in gpgsig, which git verifies, and an earlier commit's touch-flagged signature in gpgsig-sha256 before it.
      const decoyed = commit({ "specs/a.md": "e" }, "spec change without a touch, behind a decoy", 0, touched);
      const raw = git("cat-file", "commit", decoyed);
      expect(raw.indexOf("\ngpgsig-sha256 ")).toBeLessThan(raw.indexOf("\ngpgsig "));
      expect(verifySigned(decoyed, approvers, repo)).toBe(true);
      expect(commitSignature(raw)).toBeUndefined();
      expect(signaturesCheck().stdout.trim()).toBe(`CHECK signatures FAILED: approver signature without touch: ${decoyed.slice(0, 12)}`);
      git("update-ref", "HEAD", base);
      git("reset", "-q", "--hard");
      const header = (name: string, kind: string) => `${name} -----BEGIN ${kind} SIGNATURE-----\n abc\n -----END ${kind} SIGNATURE-----\n`;
      const ssh = "-----BEGIN SSH SIGNATURE-----\nabc\n-----END SSH SIGNATURE-----";
      expect(commitSignature(`tree x\n${header("gpgsig", "SSH")}\nm\n`)).toBe(ssh);
      expect(commitSignature(`tree x\n${header("gpgsig-sha256", "SSH")}\nm\n`, "sha256")).toBe(ssh);
      expect(commitSignature(`tree x\n${header("gpgsig-sha256", "SSH")}\nm\n`)).toBeUndefined();
      expect(commitSignature(`tree x\n${header("gpgsig", "SSH")}${header("gpgsig", "SSH")}\nm\n`)).toBeUndefined();
      expect(commitSignature(`tree x\n${header("gpgsig", "PGP")}\nm\n`)).toBeUndefined();
      expect(commitSignature(`tree x\n\nno signature\n`)).toBeUndefined();
    });

    it("SPEC-001-R12 fails while approvers.txt holds a key that is not a security key", () => {
      git("update-ref", "HEAD", git("rev-parse", "HEAD~1").trim());
      git("reset", "-q", "--hard");
      const plainPub = readFileSync(join(dir, "plain.pub"), "utf8").split(" ").slice(0, 2).join(" ");
      commit({ "approvers.txt": `${approvers}p@example.com namespaces="git" ${plainPub}\n` }, "add a software approver", TOUCH | PIN);
      expect(signaturesCheck().stdout.trim()).toBe("CHECK signatures FAILED: approver key is not a security key: p@example.com");
    });
  });
});
