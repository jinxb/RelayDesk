import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  clearQQApiCaches,
  sendQQGroupFileMessage,
  sendQQGroupImageMessage,
  sendQQPrivateFileMessage,
  sendQQPrivateTypingNotice,
  sendQQPrivateTextMessage,
} from "./api.js";

const tempDirs: string[] = [];

describe("QQ API helpers", () => {
  beforeEach(() => {
    clearQQApiCaches();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uploads group images and sends them as native QQ media messages", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-qq-image-"));
    tempDirs.push(dir);
    const imagePath = join(dir, "out.png");
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "qq-token", expires_in: 7200 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ file_info: "file-info-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "msg-1" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const messageId = await sendQQGroupImageMessage(
      {
        qqAppId: "qq-app",
        qqSecret: "qq-secret",
      } as never,
      "group-1",
      imagePath,
    );

    expect(messageId).toBe("msg-1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.sgroup.qq.com/v2/groups/group-1/files");
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          file_type: 1,
          srv_send_msg: false,
          file_data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
        }),
      }),
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://api.sgroup.qq.com/v2/groups/group-1/messages");
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          msg_type: 7,
          media: { file_info: "file-info-1" },
        }),
      }),
    );
  });

  it("retries passive private text sends when QQ rejects a duplicate msg_seq", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "qq-token", expires_in: 7200 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "消息被去重，请检查请求msgseq",
            code: 40054005,
            err_code: 40054005,
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "msg-2" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const messageId = await sendQQPrivateTextMessage(
      {
        qqAppId: "qq-app",
        qqSecret: "qq-secret",
      } as never,
      "user-1",
      "hello",
      "reply-1",
    );

    expect(messageId).toBe("msg-2");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(firstBody.msg_id).toBe("reply-1");
    expect(secondBody.msg_id).toBe("reply-1");
    expect(firstBody.msg_seq).toEqual(expect.any(Number));
    expect(secondBody.msg_seq).toEqual(expect.any(Number));
    expect(secondBody.msg_seq).not.toBe(firstBody.msg_seq);
  });

  it("sends private input_notify messages for QQ typing indicators", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "qq-token", expires_in: 7200 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "notify-1" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await sendQQPrivateTypingNotice(
      {
        qqAppId: "qq-app",
        qqSecret: "qq-secret",
      } as never,
      "user-1",
      "reply-1",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.sgroup.qq.com/v2/users/user-1/messages");
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"msg_type":6'),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(body.msg_id).toBe("reply-1");
    expect(body.input_notify.input_second).toBe(60);
    expect(body.msg_seq).toEqual(expect.any(Number));
  });

  it("uploads group files and sends them as native QQ media messages", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-qq-file-"));
    tempDirs.push(dir);
    const filePath = join(dir, "report.txt");
    writeFileSync(filePath, "hello file");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "qq-token", expires_in: 7200 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ file_info: "file-info-file-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "msg-file-1" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const messageId = await sendQQGroupFileMessage(
      {
        qqAppId: "qq-app",
        qqSecret: "qq-secret",
      } as never,
      "group-1",
      filePath,
    );

    expect(messageId).toBe("msg-file-1");
    const uploadBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(uploadBody.file_type).toBe(4);
    expect(uploadBody.file_name).toBe("report.txt");
    expect(uploadBody.file_data).toBe(Buffer.from("hello file").toString("base64"));
    const messageBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(messageBody).toEqual({
      msg_type: 7,
      media: { file_info: "file-info-file-1" },
    });
  });

  it("sanitizes QQ upload file names before sending native files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-qq-file-name-"));
    tempDirs.push(dir);
    const filePath = join(dir, "report.txt");
    writeFileSync(filePath, "hello file");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "qq-token", expires_in: 7200 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ file_info: "file-info-private-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "msg-private-1" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await sendQQPrivateFileMessage(
      {
        qqAppId: "qq-app",
        qqSecret: "qq-secret",
      } as never,
      "user-1",
      filePath,
      'bad:name?.txt',
    );

    const uploadBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(uploadBody.file_name).toBe("bad_name_.txt");
  });

  it("rejects oversized QQ file uploads before reading file data", async () => {
    const oversizedBytes = 100 * 1024 * 1024 + 1;
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-qq-large-file-"));
    tempDirs.push(dir);
    const filePath = join(dir, "large.bin");
    writeFileSync(filePath, "");
    truncateSync(filePath, oversizedBytes);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendQQGroupFileMessage(
        {
          qqAppId: "qq-app",
          qqSecret: "qq-secret",
        } as never,
        "group-1",
        filePath,
      ),
    ).rejects.toThrow("QQ upload exceeds");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
