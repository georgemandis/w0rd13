import index from "./client/index.html";
import { handleApi } from "./api";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": index,
    "/api/*": async (req) => (await handleApi(req)) ?? Response.json({ error: "not found" }, { status: 404 }),
  },
});

console.log(`w0rd13 running at ${server.url}`);
