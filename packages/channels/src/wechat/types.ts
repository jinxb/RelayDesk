export type WeChatMessageType =
  | "text"
  | "image"
  | "voice"
  | "video"
  | "file"
  | "location"
  | "link";

export interface WeChatInboundMedia {
  encrypt_query_param?: string;
  aes_key?: string;
  aeskey_hex?: string;
  file_name?: string;
  file_size?: number;
  duration?: number;
  mime_type?: string;
}

export interface WeChatIncomingMessage {
  msg_id: string;
  msg_type: WeChatMessageType;
  from_user_id: string;
  from_user_name: string;
  to_user_id: string;
  content: string;
  create_time: number;
  context_token?: string;
  image_url?: string;
  file_url?: string;
  filename?: string;
  file_name?: string;
  mime_type?: string;
  mimeType?: string;
  file_size?: number;
  size?: number;
  duration?: number;
  voice_text?: string;
  voice_item?: {
    text?: string;
  };
  location?: { latitude: number; longitude: number; label: string };
  raw_media?: WeChatInboundMedia;
}

export type WeChatChannelState = "disconnected" | "connecting" | "connected" | "error";

export type MessageStatus = "thinking" | "streaming" | "done" | "error";
