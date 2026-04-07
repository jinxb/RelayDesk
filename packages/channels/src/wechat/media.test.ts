import { describe, expect, it } from "vitest";
import {
  buildWeChatMediaPrompt,
  extractWeChatVoiceTranscript,
  WECHAT_VOICE_TRANSCRIPT_REQUIRED_MESSAGE,
} from "./media.js";

describe("WeChat media helpers", () => {
  it("uses built-in voice transcription when available", async () => {
    const transcript = extractWeChatVoiceTranscript({
      msg_id: "voice-1",
      msg_type: "voice",
      from_user_id: "user-1",
      from_user_name: "user-1",
      to_user_id: "bot-1",
      content: "",
      create_time: Date.now(),
      voice_item: {
        text: "这是微信自带的语音转文字",
      },
    });

    expect(transcript).toBe("这是微信自带的语音转文字");
    await expect(
      buildWeChatMediaPrompt({
        msg_id: "voice-1",
        msg_type: "voice",
        from_user_id: "user-1",
        from_user_name: "user-1",
        to_user_id: "bot-1",
        content: "",
        create_time: Date.now(),
        voice_item: {
          text: "这是微信自带的语音转文字",
        },
      }),
    ).resolves.toBe("这是微信自带的语音转文字");
  });

  it("requires WeChat voice transcription instead of silently falling back", () => {
    expect(WECHAT_VOICE_TRANSCRIPT_REQUIRED_MESSAGE).toContain("语音转文字");
    expect(
      extractWeChatVoiceTranscript({
        msg_id: "voice-2",
        msg_type: "voice",
        from_user_id: "user-1",
        from_user_name: "user-1",
        to_user_id: "bot-1",
        content: "",
        create_time: Date.now(),
      }),
    ).toBeNull();
  });
});
