import type { AgentKey, ChannelKey } from "../lib/models";
import type { StudioViewKey } from "./types";

export const agentChoices: AgentKey[] = ["claude", "codex", "codebuddy"];
export const inheritDefaultAgent = "__inherit__";
export const logLevels = ["DEBUG", "INFO", "WARN", "ERROR"] as const;

export interface StudioViewDefinition {
  readonly key: StudioViewKey;
  readonly navLabel: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
}

export interface ChannelCredentialDefinition {
  readonly key: string;
  readonly label: string;
  readonly secret?: boolean;
  readonly placeholder?: string;
  readonly placement?: "primary" | "advanced";
}

export interface ChannelDefinition {
  readonly key: ChannelKey;
  readonly title: string;
  readonly summary: string;
  readonly mode: string;
  readonly credentials: readonly ChannelCredentialDefinition[];
}

export const studioViews: readonly StudioViewDefinition[] = [
  {
    key: "console",
    navLabel: "控制台",
    eyebrow: "日常主控",
    title: "控制台",
    summary: "快速查看 RelayDesk 运行状态及连接摘要。",
  },
  {
    key: "connection",
    navLabel: "连接",
    eyebrow: "聊天平台",
    title: "平台连接",
    summary: "配置各类即时通讯入口并测试连通性。",
  },
  {
    key: "ai",
    navLabel: "AI",
    eyebrow: "本机助手",
    title: "本地 AI 配置",
    summary: "设置默认 AI 助手、工作目录与本地代理。",
  },
  {
    key: "diagnosis",
    navLabel: "诊断",
    eyebrow: "系统修复",
    title: "系统诊断",
    summary: "全面检测各系统组件的健康度，定位故障根源。",
  },
];

export const channelDefinitions: readonly ChannelDefinition[] = [
  {
    key: "telegram",
    title: "Telegram",
    summary: "低延迟极速响应的 Bot 对接，原生支持流式文本、文件、语音与视频回传。",
    mode: "实时流 + 原生媒体",
    credentials: [
      { key: "botToken", label: "机器人 Token (Bot token)", secret: true },
      { key: "proxy", label: "代理地址 (Proxy)", placeholder: "http://127.0.0.1:7890", placement: "advanced" },
    ],
  },
  {
    key: "feishu",
    title: "飞书",
    summary: "面向高频协作的富文本流式卡片通道，已支持原生图片与文件回传。",
    mode: "卡片流 + 原生文件",
    credentials: [
      { key: "appId", label: "应用 ID (App ID)" },
      { key: "appSecret", label: "应用秘钥 (App secret)", secret: true },
    ],
  },
  {
    key: "qq",
    title: "QQ",
    summary: "私聊与群聊支持原生图片/文件回传，频道媒体继续保持显式文本回退。",
    mode: "私群原生 + 频道回退",
    credentials: [
      { key: "appId", label: "应用 ID (App ID)" },
      { key: "secret", label: "应用秘钥 (Secret)", secret: true },
    ],
  },
  {
    key: "wework",
    title: "企业微信",
    summary: "面向企业内部工作区的高稳定长连接通道，原生支持图片、文件、语音与视频回传。",
    mode: "持久化 Socket + 全媒体",
    credentials: [
      { key: "corpId", label: "企业/机器人 ID (Bot ID)" },
      { key: "secret", label: "应用秘钥 (Secret)", secret: true },
      { key: "wsUrl", label: "Socket 连接地址" },
    ],
  },
  {
    key: "dingtalk",
    title: "钉钉",
    summary: "支持互动卡片渐进渲染，并已补齐原生图片与文件回传。",
    mode: "混合卡片 + 原生文件",
    credentials: [
      { key: "clientId", label: "客户端 ID (Client ID)" },
      { key: "clientSecret", label: "客户端秘钥 (Client secret)", secret: true },
      { key: "cardTemplateId", label: "卡片模板 ID (Card template ID)" },
    ],
  },
  {
    key: "wechat",
    title: "微信",
    summary: "基于 ilink/getupdates 的微信 transport，支持文本、typing 与原生图片/文件/视频回传。",
    mode: "长轮询 + 原生媒体",
    credentials: [
      { key: "token", label: "通信 Token", secret: true },
      {
        key: "baseUrl",
        label: "基础地址 (Base URL)",
        placeholder: "https://ilinkai.weixin.qq.com",
      },
    ],
  },
];
