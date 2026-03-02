import { Client } from "@neondatabase/serverless";
import { NextRequest } from "next/server";
import { getConnectionString } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();
  let client: Client | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let abortHandler: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (!closed) {
          controller.enqueue(encoder.encode(chunk));
        }
      };

      const cleanup = async () => {
        if (closed) {
          return;
        }
        closed = true;

        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }

        if (abortHandler) {
          request.signal.removeEventListener("abort", abortHandler);
          abortHandler = null;
        }

        if (client) {
          try {
            await client.end();
          } catch {
            // ignore shutdown errors
          }
          client = null;
        }

        try {
          controller.close();
        } catch {
          // stream may already be closed
        }
      };

      abortHandler = () => {
        void cleanup();
      };
      request.signal.addEventListener("abort", abortHandler);

      void (async () => {
        try {
          client = new Client({ connectionString: getConnectionString() });
          await client.connect();
          await client.query("LISTEN htc_updates");

          write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

          client.on("notification", (message) => {
            if (!message.payload) {
              return;
            }
            write(`event: update\ndata: ${message.payload}\n\n`);
          });

          pingTimer = setInterval(() => {
            write(": ping\n\n");
          }, 15000);
        } catch (error) {
          write(`event: error\ndata: ${JSON.stringify({ error: "stream_init_failed" })}\n\n`);
          void cleanup();
        }
      })();
    },
    cancel() {
      if (abortHandler) {
        abortHandler();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "Connection": "keep-alive"
    }
  });
}
