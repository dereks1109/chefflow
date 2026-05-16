export type MultimodalPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ProxyRequestBody {
  systemPrompt: string;
  userPrompt?: string;
  userContent?: string | MultimodalPart[];
  /** When false, the worker sends response_format=text (vision model fallback). */
  jsonMode?: boolean;
}

export interface ProxyResponseBody {
  content: string;
}

export const TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
