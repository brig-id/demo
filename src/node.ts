/**
 * The site on Node: for development, and for the end-to-end tests.
 *
 *   ISSUER=http://localhost:8080 CLIENT_ID=… CLIENT_SECRET=… \
 *   PUBLIC_CLIENT_ID=… SESSION_SECRET=… node src/node.ts
 */
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { type Env, handle } from "./app.ts";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function file(pathname: string): Promise<Response | null> {
  const type = TYPES[extname(pathname)];
  if (!type) return null;
  const path = normalize(join(PUBLIC, pathname));
  if (!path.startsWith(PUBLIC)) return null;
  try {
    return new Response(await readFile(path), {
      headers: { "content-type": type },
    });
  } catch {
    return null;
  }
}

/** Starts the site. `origin` is how browsers reach it. */
export function serve(
  env: Env,
  port: number,
  origin = `http://localhost:${port}`,
): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", origin);
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(name, value);
      }
      const request = new Request(url, { method: req.method, headers });
      const response =
        (await file(url.pathname)) ?? (await handle(request, env));
      res.statusCode = response.status;
      for (const [name, value] of response.headers) {
        if (name !== "set-cookie") res.setHeader(name, value);
      }
      res.setHeader("set-cookie", response.headers.getSetCookie());
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve(server)),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8788);
  await serve(process.env as Env, port);
  console.log(`brig·id demo on http://localhost:${port}`);
}
