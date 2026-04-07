export const wizardSteps = [
  { key: "platform", label: "选择平台", description: "确定主要聊天入口" },
  { key: "config", label: "平台配置", description: "填写凭证并测试" },
  { key: "ai", label: "选择 AI", description: "确认本机助手" },
  { key: "workdir", label: "工作区", description: "设置默认目录" },
  { key: "review", label: "确认启动", description: "保存并进入控制台" },
] as const;

export type WizardStep = (typeof wizardSteps)[number];

