import "reflect-metadata";
import { config } from "dotenv";
import { join } from "path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import compression = require("compression");
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { Express } from "express";
import { createStreamRouter } from "./stream.router";

// Resolve relative to the built server directory (server/dist) up to the repo
// root so local `npm run server:start` picks up the root .env.
config({ path: join(__dirname, "..", "..", ".env") });

/**
 * Build (but do not listen on) the fully-configured Nest app. Used by both the
 * local bootstrap() below and the Vercel serverless function (api/index.js).
 */
export async function createApp(): Promise<Express> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  app.use(compression());
  app.use(helmet());

  const defaultOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost", // Capacitor Android
    "capacitor://localhost", // Capacitor iOS
    "https://streamlyvercelin.vercel.app", // Vercel production
  ];
  const frontendUrl = configService.get<string>("FRONTEND_URL");

  // Sanitize FRONTEND_URL to ensure missing "https://" in a dashboard env doesn't block
  const envOrigins = frontendUrl
    ? frontendUrl
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url) => (url.startsWith("http") ? url : `https://${url}`))
    : [];

  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

  // Keep browser access scoped to this application's frontend.
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    methods: "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    exposedHeaders: ["Cache-Control"],
  });

  // Initialize all Nest modules/routes before mounting the raw Express router.
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set("trust proxy", true);

  // Mount the pure-HTTP stream endpoints (proxy/netmirror/thumbnails/health)
  // BEFORE app.init() registers Nest's router as the final middleware — anything
  // mounted after init would sit behind Nest's 404 handler and never respond.
  // Paths are disjoint from the Nest @Controller("api/movies") routes.
  expressApp.use(createStreamRouter());

  await app.init();

  return expressApp;
}

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port, "0.0.0.0");
  console.log(`🚀 NestJS Backend running on port: ${port}`);
}

// Run the listener only when executed as a real process (node server/dist/main.js),
// not when imported by the Vercel serverless function. The VERCEL env check is
// bundler-proof — Vercel's esbuild/nft bundling can rewrite `require.main ===
// module` inside the single lambda, but never touches process.env.VERCEL.
if (process.env.VERCEL !== "1" && require.main === module) {
  bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}