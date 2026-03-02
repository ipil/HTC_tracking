import { Pool } from "@neondatabase/serverless";
import { NextRequest } from "next/server";
import { getConnectionString } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();
  const connectionString = getConnectionString();
  const pool = new Pool({ connectionString });
  type PgNotification = { channel: string; payload?: string | null };

  let client: any = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (!closed) {
          controller.enqueue(encoder.encode(chunk));
        }
      };
      const onNotification = (msg: PgNotification) => {
        const payload = msg.payload ?? JSON.stringify({ type: "table_changed", at: Date.now() });
        write(`event: update\ndata: ${payload}\n\n`);
      };

      const cleanup = async () => {
        if (closed) {
          return;
        }
        closed = true;

        try {
          if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
          }
        } catch {
          // ignore timer cleanup errors
        }

        try {
          const c: any = client as any;
          if (c?.off) {
            c.off("notification", onNotification);
          } else if (c?.removeListener) {
            c.removeListener("notification", onNotification);
          } else if (c?.removeAllListeners) {
            c.removeAllListeners("notification");
          }
        } catch {}

        try {
          if (client) {
            await client.query("UNLISTEN *");
          }
        } catch {
          // ignore unlisten errors
        }

        try {
          client?.release();
        } catch {
          // ignore release errors
        }
        client = null;

        try {
          await pool.end();
        } catch {
          // ignore pool shutdown errors
        }

        try {
          controller.close();
        } catch {
          // stream may already be closed
        }
      };

      req.signal.addEventListener("abort", () => {
        void cleanup();
      });

      void (async () => {
        try {
          client = await pool.connect();
          await client.query("LISTEN htc_updates");

          // Vercel may reconnect SSE requests; EventSource retries automatically.
          write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

          (client as any).on("notification", onNotification);

          pingTimer = setInterval(() => {
            write(": ping\n\n");
          }, 15000);
        } catch {
          void cleanup();
        }
      })();
    },
    cancel() {
      try {
        req.signal.throwIfAborted?.();
      } catch {
        // ignore
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Connection": "keep-alive"
    }
  });
}
