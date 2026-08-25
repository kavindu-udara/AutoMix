import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { trackRoutes } from "./routes/tracks";
import fastifyStatic from "@fastify/static";
import path from "path";

const app = Fastify({
  logger: true,
  bodyLimit: 50 * 1024 * 1024, // 50 MB
});

app.register(cors, {
  origin: [process.env.FRONTEND_URL || "http://localhost:3000"],
});

app.addContentTypeParser(/^audio\/(mpeg|mp3|wav|x-wav)$/i, { parseAs: "buffer" }, (_req, body, done) => {
  done(null, body);
});

app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => {
  done(null, body);
});

app.register(multipart, {
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB,
        files: 1
    }
});

const storageDriver = process.env.STORAGE_DRIVER ?? "local";

if(storageDriver === "local"){
  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

    app.register(fastifyStatic, {
        root: uploadDir,
        prefix: "/files/",
    });
}

app.register(trackRoutes);

const PORT = process.env.PORT || 4000;

app.listen({ port: Number(PORT), host: "localhost" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});
