import { beforeEach, describe, expect, it, vi } from "vitest";

const createReadStreamMock = vi.fn((path: string) => ({ path }));
const fileCreateMock = vi.fn(async () => ({ file_key: "file-key-1" }));
const messageCreateMock = vi.fn(async () => ({ data: { message_id: "msg-1" } }));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    createReadStream: createReadStreamMock,
    readFileSync: vi.fn(() => Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  };
});

vi.mock("./client.js", () => ({
  getClient: () => ({
    appId: "cli_a",
    appSecret: "secret",
    auth: {
      tenantAccessToken: {
        internal: vi.fn(async () => ({
          code: 0,
          data: { tenant_access_token: "tenant-token" },
        })),
      },
    },
    im: {
      v1: {
        file: {
          create: fileCreateMock,
        },
      },
      message: {
        create: messageCreateMock,
      },
    },
  }),
}));

describe("Feishu message sender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileCreateMock.mockResolvedValue({ file_key: "file-key-1" });
    messageCreateMock.mockResolvedValue({ data: { message_id: "msg-1" } });
  });

  it("uploads generated files and sends them as native Feishu file messages", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendFileReply("chat-1", "C:\\files\\report.pdf");

    expect(fileCreateMock).toHaveBeenCalledWith({
      data: {
        file_type: "pdf",
        file_name: "report.pdf",
        file: { path: "C:\\files\\report.pdf" },
      },
    });
    expect(messageCreateMock).toHaveBeenCalledWith({
      data: {
        receive_id: "chat-1",
        msg_type: "file",
        content: JSON.stringify({ file_key: "file-key-1" }),
      },
      params: { receive_id_type: "chat_id" },
    });
  });
});
