import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[smartcampus] API listening on http://localhost:${env.port}`);
  console.log(`[smartcampus] CORS origin: ${env.corsOrigin}`);
});

function shutdown(signal: string) {
  console.log(`[smartcampus] ${signal} received, shutting down...`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
