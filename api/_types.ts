import type { IncomingMessage, ServerResponse } from "node:http";

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
  method?: string;
}

export interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  send(body: unknown): void;
  json(body: unknown): void;
}
