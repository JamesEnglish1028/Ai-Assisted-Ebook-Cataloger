import express from 'express';
import dotenv from 'dotenv';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

dotenv.config();

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

type PendingRequest = {
  resolve: (value: JsonRpcResponse) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

const BRIDGE_PORT = parseInt(process.env.OPEN_LIBRARY_BRIDGE_PORT || '3003', 10);
const BRIDGE_PATH = process.env.OPEN_LIBRARY_BRIDGE_PATH || '/mcp';
const BRIDGE_TIMEOUT_MS = Math.max(
  2000,
  parseInt(process.env.OPEN_LIBRARY_BRIDGE_REQUEST_TIMEOUT_MS || '15000', 10),
);
const STDIO_COMMAND = (process.env.OPEN_LIBRARY_STDIO_COMMAND || 'mcp-open-library').trim();
const STDIO_ARGS_RAW = process.env.OPEN_LIBRARY_STDIO_ARGS || '';

const splitArgs = (raw: string): string[] => {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry));
      }
    } catch {
      // Fall back to tokenization.
    }
  }

  const tokens = trimmed.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return tokens.map((token) => token.replace(/^['"]|['"]$/g, ''));
};

const STDIO_ARGS = splitArgs(STDIO_ARGS_RAW);

class McpStdioClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = Buffer.alloc(0);
  private pending = new Map<string, PendingRequest>();
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  private startupError: string | null = null;

  private getRequestKey(id: string | number | null | undefined): string {
    return String(id ?? 'null');
  }

  private start(): void {
    if (this.proc) return;

    this.startupError = null;
    this.proc = spawn(STDIO_COMMAND, STDIO_ARGS, {
      stdio: 'pipe',
      env: process.env,
    });

    this.proc.stdout.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drainMessages();
    });

    this.proc.stderr.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8').trim();
      if (message) {
        console.warn(`[openlib-mcp-bridge] mcp-open-library stderr: ${message}`);
      }
    });

    this.proc.on('error', (error) => {
      this.startupError = error.message;
      this.rejectAllPending(error);
    });

    this.proc.on('exit', (code, signal) => {
      const reason = `mcp-open-library exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
      this.startupError = reason;
      this.rejectAllPending(new Error(reason));
      this.proc = null;
      this.initialized = false;
      this.initializationPromise = null;
      this.buffer = Buffer.alloc(0);
    });
  }

  private rejectAllPending(error: unknown): void {
    for (const [key, pending] of this.pending.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
      this.pending.delete(key);
    }
  }

  private drainMessages(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const headerText = this.buffer.subarray(0, headerEnd).toString('utf8');
      const lengthMatch = headerText.match(/content-length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(lengthMatch[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (this.buffer.length < bodyEnd) return;

      const bodyText = this.buffer.subarray(bodyStart, bodyEnd).toString('utf8');
      this.buffer = this.buffer.subarray(bodyEnd);

      let payload: JsonRpcResponse | null = null;
      try {
        payload = JSON.parse(bodyText) as JsonRpcResponse;
      } catch {
        continue;
      }

      if (payload && Object.prototype.hasOwnProperty.call(payload, 'id')) {
        const key = this.getRequestKey(payload.id);
        const pending = this.pending.get(key);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pending.resolve(payload);
          this.pending.delete(key);
        }
      }
    }
  }

  private send(message: unknown): void {
    if (!this.proc) {
      throw new Error('mcp-open-library process is not running');
    }
    const body = JSON.stringify(message);
    const contentLength = Buffer.byteLength(body, 'utf8');
    const framed = `Content-Length: ${contentLength}\r\n\r\n${body}`;
    this.proc.stdin.write(framed);
  }

  public async call(request: JsonRpcRequest, timeoutMs = BRIDGE_TIMEOUT_MS): Promise<JsonRpcResponse> {
    this.start();

    if (!this.proc) {
      throw new Error('Unable to start mcp-open-library process');
    }
    if (this.startupError) {
      throw new Error(this.startupError);
    }

    const requestId = request.id ?? `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const requestWithId: JsonRpcRequest = { ...request, id: requestId, jsonrpc: '2.0' };
    const key = this.getRequestKey(requestId);

    return await new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(`MCP request timeout after ${timeoutMs}ms for method ${request.method}`));
      }, timeoutMs);

      this.pending.set(key, { resolve, reject, timeoutId });
      try {
        this.send(requestWithId);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pending.delete(key);
        reject(error);
      }
    });
  }

  private sendInitializedNotification(): void {
    this.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });
  }

  public async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const response = await this.call({
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'ai-assisted-ebook-cataloger-open-library-bridge',
            version: '1.0.0',
          },
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'MCP initialize failed');
      }

      this.sendInitializedNotification();
      this.initialized = true;
    })();

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  public shutdown(): void {
    if (!this.proc) return;
    this.proc.kill('SIGTERM');
    this.proc = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.buffer = Buffer.alloc(0);
  }
}

const client = new McpStdioClient();
const app = express();

app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  res.json({
    status: 'ok',
    bridge: 'open-library-mcp-stdio',
    mcpCommand: STDIO_COMMAND,
    mcpArgs: STDIO_ARGS,
    endpoint: BRIDGE_PATH,
  });
});

app.post(BRIDGE_PATH, async (req, res) => {
  try {
    const body = req.body as JsonRpcRequest;
    if (!body || typeof body.method !== 'string') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: body?.id ?? null,
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC request payload',
        },
      });
    }

    if (body.method !== 'initialize' && body.method !== 'notifications/initialized') {
      await client.ensureInitialized();
    }

    if (body.method === 'notifications/initialized') {
      return res.json({ jsonrpc: '2.0', id: body.id ?? null, result: { ok: true } });
    }

    const response = await client.call(body, BRIDGE_TIMEOUT_MS);
    return res.json(response);
  } catch (error: any) {
    return res.status(502).json({
      jsonrpc: '2.0',
      id: (req.body as JsonRpcRequest | undefined)?.id ?? null,
      error: {
        code: -32000,
        message: error?.message || 'Bridge request failed',
      },
    });
  }
});

const server = app.listen(BRIDGE_PORT, '0.0.0.0', () => {
  console.log(`Open Library MCP bridge listening on http://localhost:${BRIDGE_PORT}${BRIDGE_PATH}`);
  console.log(`Spawning stdio MCP command: ${STDIO_COMMAND} ${STDIO_ARGS.join(' ')}`.trim());
});

const shutdown = () => {
  server.close(() => {
    client.shutdown();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
