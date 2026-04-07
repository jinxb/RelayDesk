import type { WeWorkHttpResponseBody } from './types.js';

const VOICE_EXTENSIONS = new Set(['.aac', '.amr', '.m4a', '.mp3', '.ogg', '.opus', '.wav']);
const VIDEO_EXTENSIONS = new Set(['.avi', '.m4v', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.webm']);

export type NativeFileReplyKind = 'file' | 'voice' | 'video';

export function resolveGeneratedFileReply(filePath: string) {
  const fileName = filePath.split(/[\\/]/).pop() || 'file';
  const extensionIndex = fileName.lastIndexOf('.');
  const extension =
    extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : '';
  const mediaType = VOICE_EXTENSIONS.has(extension)
    ? 'voice'
    : VIDEO_EXTENSIONS.has(extension)
      ? 'video'
      : 'file';
  return { fileName, mediaType };
}

export function buildGeneratedFileLabel(
  mediaType: NativeFileReplyKind,
  fileName: string,
) {
  if (mediaType === 'voice') return `Generated voice: ${fileName}`;
  if (mediaType === 'video') return `Generated video: ${fileName}`;
  return `Generated file: ${fileName}`;
}

export function buildGeneratedFileFallback(
  mediaType: NativeFileReplyKind,
  filePath: string,
) {
  if (mediaType === 'voice') return `Generated voice saved at: ${filePath}`;
  if (mediaType === 'video') return `Generated video saved at: ${filePath}`;
  return `Generated file saved at: ${filePath}`;
}

export function buildNativeFileReplyBody(
  mediaType: NativeFileReplyKind,
  mediaId: string,
): WeWorkHttpResponseBody {
  if (mediaType === 'voice') {
    return { msgtype: 'voice', voice: { media_id: mediaId } };
  }
  if (mediaType === 'video') {
    return { msgtype: 'video', video: { media_id: mediaId } };
  }
  return { msgtype: 'file', file: { media_id: mediaId } };
}
