const TEXT_MSG_KEY = "sampleText";
const MEDIA_MSG_KEYS = {
  image: "sampleImageMsg",
  voice: "sampleAudio",
  video: "sampleVideo",
  file: "sampleFile",
} as const;

export type DingTalkMediaType = keyof typeof MEDIA_MSG_KEYS;

export function buildAiCardContent(
  templateId: string,
  cardData: Record<string, unknown>,
) {
  return JSON.stringify({
    templateId,
    cardData,
  });
}

export function buildTextPayload(content: string) {
  return {
    msgKey: TEXT_MSG_KEY,
    msgParam: JSON.stringify({ content }),
  };
}

function buildMediaMsgParam(
  mediaId: string,
  mediaType: DingTalkMediaType,
  fileName?: string,
) {
  switch (mediaType) {
    case "image":
      return JSON.stringify({ photoURL: mediaId });
    case "voice":
      return JSON.stringify({ mediaId, duration: "1000" });
    case "video":
      return JSON.stringify({
        videoMediaId: mediaId,
        videoType: "mp4",
        duration: "1000",
      });
    case "file":
      return JSON.stringify({
        mediaId,
        fileName: fileName ?? "file",
        fileType: "file",
      });
  }
}

export function buildMediaPayload(
  mediaId: string,
  mediaType: DingTalkMediaType,
  fileName?: string,
) {
  return {
    msgKey: MEDIA_MSG_KEYS[mediaType],
    msgParam: buildMediaMsgParam(mediaId, mediaType, fileName),
  };
}

export function buildCardParamMap(cardData: Record<string, unknown>) {
  const cardParamMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(cardData)) {
    if (value === undefined || value === null) continue;
    cardParamMap[key] =
      typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return cardParamMap;
}

export function buildStandardCardData(cardData: Record<string, unknown>) {
  const title = String(cardData.title ?? "AI");
  const content =
    String(cardData.content ?? cardData.displayText ?? "").trim() || "...";

  return JSON.stringify({
    config: { autoLayout: true, enableForward: true },
    header: {
      title: { type: "text", text: title },
      logo: "@lALPDfJ6V_FPDmvNAfTNAfQ",
    },
    contents: [
      { type: "text", text: title, id: "text_1693929551595" },
      { type: "divider", id: "divider_1693929551595" },
      { type: "markdown", text: content, id: "markdown_1693929674245" },
    ],
  });
}
