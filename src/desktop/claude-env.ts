export const commonClaudeEnvKeys = [
  { key: "ANTHROPIC_API_KEY", label: "API Key", secret: true, placeholder: "sk-ant-..." },
  { key: "ANTHROPIC_AUTH_TOKEN", label: "Auth Token", secret: true, placeholder: "auth token" },
  { key: "CLAUDE_CODE_OAUTH_TOKEN", label: "Claude OAuth Token", secret: true, placeholder: "oauth token" },
  { key: "ANTHROPIC_BASE_URL", label: "Base URL", secret: false, placeholder: "https://..." },
] as const;

export function parseClaudeEnvRecord(source: string) {
  try {
    const parsed = JSON.parse(source.trim() || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return {} as Record<string, string>;
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {} as Record<string, string>;
  }
}

export function updateClaudeEnvRecord(source: string, key: string, value: string) {
  const current = parseClaudeEnvRecord(source);
  const next = { ...current };
  const normalized = value.trim();

  if (normalized) {
    next[key] = normalized;
  } else {
    delete next[key];
  }

  return JSON.stringify(next, null, 2);
}
