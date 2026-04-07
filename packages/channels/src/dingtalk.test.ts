import { beforeEach, describe, expect, it, vi } from "vitest";

const getDingTalkActiveTargetMock = vi.fn();
const sendProactiveTextMock = vi.fn(async () => {});

vi.mock("../../state/src/index.js", async () => {
  const actual = await vi.importActual("../../state/src/index.js");
  return {
    ...actual,
    getDingTalkActiveTarget: getDingTalkActiveTargetMock,
  };
});

vi.mock("./dingtalk/client.js", () => ({
  formatDingTalkInitError: vi.fn(),
  initDingTalk: vi.fn(),
  sendProactiveText: sendProactiveTextMock,
  stopDingTalk: vi.fn(),
}));

describe("DingTalk lifecycle notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends proactive lifecycle notices when an active target exists", async () => {
    getDingTalkActiveTargetMock.mockReturnValue({
      chatId: "cid-1",
      userId: "user-1",
      conversationType: "0",
      robotCode: "robot-1",
    });

    const { sendDingTalkLifecycleNotice } = await import("./dingtalk.js");
    await sendDingTalkLifecycleNotice("worker online");

    expect(sendProactiveTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "cid-1" }),
      "worker online",
    );
  });
});
