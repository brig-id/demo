/** The site on Cloudflare Workers. Static files (`public/`) are served by
 * the platform before this is called. */
import { type Env, handle } from "./app.ts";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
