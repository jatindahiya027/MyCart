import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, open, readFile } from "node:fs/promises";
import path from "node:path";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const SECRET_VERSION = "v1";
const KEY_FILE = path.join(process.cwd(), ".mycart-secret");

let encryptionKeyPromise;

function decodeConfiguredKey(value) {
  if (!value) return null;
  const trimmed = value.trim();
  const encoding = /^[a-f0-9]{64}$/i.test(trimmed) ? "hex" : "base64";
  const key = Buffer.from(trimmed, encoding);
  if (key.length !== KEY_BYTES) {
    throw new Error("MYCART_ENCRYPTION_KEY must contain exactly 32 bytes.");
  }
  return key;
}

async function readOrCreateLocalKey() {
  try {
    const stored = (await readFile(KEY_FILE, "utf8")).trim();
    return decodeConfiguredKey(stored);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const generated = randomBytes(KEY_BYTES).toString("base64");
  try {
    const handle = await open(KEY_FILE, "wx", 0o600);
    await handle.writeFile(`${generated}\n`, "utf8");
    await handle.close();
    await chmod(KEY_FILE, 0o600).catch(() => {});
    return Buffer.from(generated, "base64");
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const stored = (await readFile(KEY_FILE, "utf8")).trim();
    return decodeConfiguredKey(stored);
  }
}

async function getEncryptionKey() {
  if (!encryptionKeyPromise) {
    encryptionKeyPromise = Promise.resolve(
      decodeConfiguredKey(process.env.MYCART_ENCRYPTION_KEY)
    ).then((configured) => configured || readOrCreateLocalKey());
  }
  return encryptionKeyPromise;
}

export async function encryptSecret(value) {
  if (typeof value !== "string" || !value) {
    throw new Error("A non-empty secret is required.");
  }
  const key = await getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SECRET_VERSION, iv, tag, ciphertext]
    .map((part) => (Buffer.isBuffer(part) ? part.toString("base64url") : part))
    .join(".");
}

export async function decryptSecret(payload) {
  if (!payload) return "";
  const [version, ivValue, tagValue, ciphertextValue] = String(payload).split(".");
  if (version !== SECRET_VERSION || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("The stored Gmail app password has an invalid encrypted format.");
  }
  const key = await getEncryptionKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
