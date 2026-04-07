import { createLogger } from "../../../state/src/index.js";
import { encryptWeChatCdnBuffer } from "./cdn-crypto.js";
import { WECHAT_CDN_BASE_URL } from "./api.js";

const log = createLogger("WeChatCdnUpload");
const MAX_WECHAT_CDN_UPLOAD_RETRIES = 3;

function buildWeChatCdnUploadUrl(uploadParam: string, fileKey: string): string {
  return `${WECHAT_CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(fileKey)}`;
}

export async function uploadBufferToWeChatCdn(options: {
  readonly buffer: Buffer;
  readonly uploadParam: string;
  readonly fileKey: string;
  readonly aesKey: Buffer;
}): Promise<string> {
  const ciphertext = encryptWeChatCdnBuffer(options.buffer, options.aesKey);
  const url = buildWeChatCdnUploadUrl(options.uploadParam, options.fileKey);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_WECHAT_CDN_UPLOAD_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(ciphertext),
      });
      if (response.status >= 400 && response.status < 500) {
        const message = response.headers.get("x-error-message") ?? await response.text();
        throw new Error(`WeChat CDN upload client error ${response.status}: ${message}`);
      }
      if (response.status !== 200) {
        const message = response.headers.get("x-error-message") ?? `status ${response.status}`;
        throw new Error(`WeChat CDN upload server error: ${message}`);
      }
      const encryptedParam = response.headers.get("x-encrypted-param")?.trim();
      if (!encryptedParam) {
        throw new Error("WeChat CDN upload response missing x-encrypted-param header");
      }
      return encryptedParam;
    } catch (error) {
      lastError = error;
      log.warn(`WeChat CDN upload attempt ${attempt}/${MAX_WECHAT_CDN_UPLOAD_RETRIES} failed:`, error);
      if (error instanceof Error && error.message.includes("client error")) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`WeChat CDN upload failed after ${MAX_WECHAT_CDN_UPLOAD_RETRIES} attempts`);
}
