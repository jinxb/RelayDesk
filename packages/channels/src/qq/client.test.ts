import { describe, expect, it } from "vitest";
import { normalizeInboundEvent } from "./client.js";

describe("QQ gateway event normalization", () => {
  it("maps C2C_MSG_RECEIVE to a private message event", () => {
    const normalized = normalizeInboundEvent({
      op: 0,
      t: "C2C_MSG_RECEIVE",
      d: {
        id: "evt-1",
        content: "hello",
        author: {
          user_openid: "user-1",
        },
      },
    });

    expect(normalized).toEqual({
      kind: "message",
      event: {
        type: "private",
        id: "evt-1",
        content: "hello",
        userOpenid: "user-1",
        attachments: undefined,
        raw: {
          id: "evt-1",
          content: "hello",
          author: {
            user_openid: "user-1",
          },
        },
      },
    });
  });

  it("maps GROUP_MSG_RECEIVE to a group message event", () => {
    const normalized = normalizeInboundEvent({
      op: 0,
      t: "GROUP_MSG_RECEIVE",
      d: {
        id: "evt-2",
        content: "group hello",
        group_openid: "group-1",
        author: {
          member_openid: "member-1",
        },
      },
    });

    expect(normalized).toEqual({
      kind: "message",
      event: {
        type: "group",
        id: "evt-2",
        content: "group hello",
        userOpenid: "member-1",
        groupOpenid: "group-1",
        attachments: undefined,
        raw: {
          id: "evt-2",
          content: "group hello",
          group_openid: "group-1",
          author: {
            member_openid: "member-1",
          },
        },
      },
    });
  });

  it("keeps FRIEND_ADD as a lifecycle event instead of dropping it", () => {
    const normalized = normalizeInboundEvent({
      op: 0,
      t: "FRIEND_ADD",
      d: {
        user_openid: "user-1",
      },
    });

    expect(normalized).toEqual({
      kind: "lifecycle",
      type: "friend_add",
      userOpenid: "user-1",
      groupOpenid: "",
      raw: {
        user_openid: "user-1",
      },
    });
  });
});
