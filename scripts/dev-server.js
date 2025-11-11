import http from "http";
import { createReadStream, existsSync, statSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { MIME_TYPES } from "./mime-types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 5173);

function resolvePath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const clean = decoded === "/" ? "/index.html" : decoded;
  return path.join(ROOT, clean);
}

function respondWithError(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    respondWithError(res, 400, "Bad Request");
    return;
  }

  let targetPath = resolvePath(req.url);

  try {
    const stats = statSync(targetPath);
    if (stats.isDirectory()) {
      targetPath = path.join(targetPath, "index.html");
    }
  } catch {
    respondWithError(res, 404, "Not Found");
    return;
  }

  if (!existsSync(targetPath)) {
    respondWithError(res, 404, "Not Found");
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  res.writeHead(200, { "Content-Type": contentType });
  createReadStream(targetPath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Dev server ready at http://${HOST}:${PORT}/`);
});

