import { createLogger, getConfiguredAiCommands, type Config } from '../../../state/src/index.js';
import type { ToolAdapter } from './tool-adapter.interface.js';
import { CodexAdapter } from './codex-adapter.js';
import { CodeBuddyAdapter } from './codebuddy-adapter.js';

const log = createLogger('Registry');
const adapters = new Map<string, ToolAdapter>();
let destroyClaudeAdapter: (() => void) | null = null;

export async function initAdapters(config: Config): Promise<void> {
  adapters.clear();
  destroyClaudeAdapter = null;
  for (const aiCommand of getConfiguredAiCommands(config)) {
    if (aiCommand === 'claude') {
      let ClaudeSDKAdapter: typeof import('./claude-sdk-adapter.js').ClaudeSDKAdapter;
      try {
        ({ ClaudeSDKAdapter } = await import('./claude-sdk-adapter.js'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Claude route is enabled but @anthropic-ai/claude-agent-sdk is unavailable in this project. Reinstall dependencies after moving the repo. Original error: ${message}`,
        );
      }
      log.info('Claude Agent SDK adapter enabled');
      adapters.set('claude', new ClaudeSDKAdapter());
      destroyClaudeAdapter = ClaudeSDKAdapter.destroy;
      continue;
    }

    if (aiCommand === 'codex') {
      log.info('Codex CLI adapter enabled');
      adapters.set('codex', new CodexAdapter(config.codexCliPath));
      continue;
    }

    if (aiCommand === 'codebuddy') {
      log.info('CodeBuddy CLI adapter enabled');
      adapters.set('codebuddy', new CodeBuddyAdapter(config.codebuddyCliPath));
    }
  }
}

export function getAdapter(aiCommand: string): ToolAdapter | undefined {
  return adapters.get(aiCommand);
}

export function cleanupAdapters(): void {
  destroyClaudeAdapter?.();
  destroyClaudeAdapter = null;
  adapters.clear();
}
