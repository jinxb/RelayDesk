import type { DingTalkMediaType } from "./card-payload.js";

const DINGTALK_OPENAPI_BASE = "https://api.dingtalk.com";
const DINGTALK_OAPI_BASE = "https://oapi.dingtalk.com";

export interface DingTalkDownloadedMessageFile {
  buffer: Buffer;
  contentType?: string;
  filename?: string;
}

export interface DingTalkUploadedMedia {
  mediaId: string;
  type: DingTalkMediaType;
}

function errorMessage(body: Record<string, unknown>, fallback: string) {
  if (typeof body.errmsg === "string") return body.errmsg;
  if (typeof body.errormsg === "string") return body.errormsg;
  if (typeof body.message === "string") return body.message;
  return fallback;
}

async function readText(response: Response, prefix: string) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${prefix}: ${response.status} ${text}`);
  }
  return text;
}

async function parseJson(text: string, fallbackPrefix: string) {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${fallbackPrefix}: ${text}`);
  }
}

export async function sendByWebhook(
  sessionWebhook: string,
  accessToken: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(sessionWebhook, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-acs-dingtalk-access-token": accessToken,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await readText(response, "DingTalk reply failed");

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function callOpenApi(
  accessToken: string,
  path: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${DINGTALK_OPENAPI_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-acs-dingtalk-access-token": accessToken,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  const text = await readText(response, "DingTalk OpenAPI failed");
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const errorCode = parsed.errorcode ?? parsed.errcode;
    const success = parsed.success;
    if (
      errorCode === 0 ||
      errorCode === "0" ||
      success === true ||
      (errorCode === undefined && success === undefined)
    ) {
      return parsed;
    }
    throw new Error(
      `DingTalk OpenAPI business error: ${String(errorCode)} ${errorMessage(parsed, text)}`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("DingTalk OpenAPI business error")) {
      throw error;
    }
    return text;
  }
}

export async function callOpenApiWithMethod(
  accessToken: string,
  method: string,
  path: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${DINGTALK_OPENAPI_BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-acs-dingtalk-access-token": accessToken,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  const text = await readText(response, "DingTalk OpenAPI failed");
  const parsed = await parseJson(text, "DingTalk OpenAPI returned non-JSON response");
  const errorCode = parsed.errorcode ?? parsed.errcode;
  const success = parsed.success;
  if (
    errorCode === 0 ||
    errorCode === "0" ||
    success === true ||
    (errorCode === undefined && success === undefined)
  ) {
    return parsed;
  }

  throw new Error(
    `DingTalk OpenAPI business error: ${String(errorCode)} ${errorMessage(parsed, text)}`,
  );
}

export async function callOapi(
  accessToken: string,
  path: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(
    `${DINGTALK_OAPI_BASE}${path}?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    },
  );

  const text = await readText(response, "DingTalk OAPI failed");
  const parsed = await parseJson(text, "DingTalk OAPI returned non-JSON response");
  const errorCode = parsed.errcode;
  if (errorCode === 0 || errorCode === "0" || errorCode === undefined) {
    return parsed;
  }
  throw new Error(
    `DingTalk OAPI business error: ${String(errorCode)} ${errorMessage(parsed, text)}`,
  );
}

export async function downloadRobotMessageFileWithAccessToken(
  accessToken: string,
  downloadCode: string,
  robotCode: string,
): Promise<DingTalkDownloadedMessageFile> {
  const response = await fetch(`${DINGTALK_OPENAPI_BASE}/v1.0/robot/messageFiles/download`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-acs-dingtalk-access-token": accessToken,
    },
    body: JSON.stringify({ downloadCode, robotCode }),
    signal: AbortSignal.timeout(30000),
  });

  const contentType = response.headers.get("content-type") ?? undefined;
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const filenameMatch =
    /filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i.exec(contentDisposition);
  const filename = filenameMatch?.[1] ?? filenameMatch?.[2];
  if (!contentType?.includes("application/json")) {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DingTalk message file download failed: ${response.status} ${text}`);
    }
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType,
      filename,
    };
  }

  const text = await readText(response, "DingTalk message file download failed");
  const parsed = await parseJson(text, "DingTalk message file download returned invalid JSON");
  const errorCode = parsed.code ?? parsed.errcode ?? parsed.errorcode;
  if (errorCode !== undefined && errorCode !== 0 && errorCode !== "0") {
    throw new Error(
      `DingTalk message file download business error: ${String(errorCode)} ${errorMessage(parsed, text)}`,
    );
  }

  const downloadUrl =
    typeof parsed.downloadUrl === "string"
      ? parsed.downloadUrl
      : typeof parsed.download_url === "string"
        ? parsed.download_url
        : typeof parsed.url === "string"
          ? parsed.url
          : undefined;
  if (!downloadUrl) {
    throw new Error("DingTalk message file download returned JSON without binary payload or download URL");
  }

  const redirected = await fetch(downloadUrl, {
    signal: AbortSignal.timeout(30000),
  });
  if (!redirected.ok) {
    const redirectedText = await redirected.text();
    throw new Error(
      `DingTalk redirected file download failed: ${redirected.status} ${redirectedText}`,
    );
  }

  return {
    buffer: Buffer.from(await redirected.arrayBuffer()),
    contentType: redirected.headers.get("content-type") ?? undefined,
    filename,
  };
}

export async function uploadRobotMediaWithAccessToken(
  accessToken: string,
  mediaType: DingTalkMediaType,
  fileName: string,
  buffer: Buffer,
): Promise<DingTalkUploadedMedia> {
  const form = new FormData();
  form.append("media", new Blob([buffer]), fileName);
  form.append("type", mediaType);

  const response = await fetch(
    `${DINGTALK_OAPI_BASE}/media/upload?access_token=${encodeURIComponent(accessToken)}&type=${encodeURIComponent(mediaType)}`,
    {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
    },
  );

  const text = await readText(response, "DingTalk media upload failed");
  const parsed = await parseJson(text, "DingTalk media upload returned invalid JSON");
  const errorCode = parsed.errcode ?? parsed.errorcode ?? parsed.code;
  if (errorCode !== undefined && errorCode !== 0 && errorCode !== "0") {
    throw new Error(
      `DingTalk media upload business error: ${String(errorCode)} ${errorMessage(parsed, text)}`,
    );
  }

  const mediaId =
    typeof parsed.media_id === "string"
      ? parsed.media_id
      : typeof parsed.mediaId === "string"
        ? parsed.mediaId
        : undefined;
  if (!mediaId) {
    throw new Error("DingTalk media upload did not return media_id");
  }

  return { mediaId, type: mediaType };
}
