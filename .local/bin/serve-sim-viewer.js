const http = require("http");

const upstreamUrl = "http://127.0.0.1:3100/stream.mjpeg";
const port = 3200;

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>CORA iOS Simulator</title>
    <style>
      html, body {
        margin: 0;
        height: 100%;
        overflow: hidden;
        background: #111;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      img {
        height: 100vh;
        max-width: 100vw;
        object-fit: contain;
        background: #000;
      }
    </style>
  </head>
  <body>
    <img src="/stream.mjpeg" alt="iOS Simulator">
  </body>
</html>`;

http
  .createServer((req, res) => {
    if (req.url && req.url.startsWith("/stream.mjpeg")) {
      const upstream = http.get(upstreamUrl, (streamRes) => {
        res.writeHead(streamRes.statusCode || 200, {
          "content-type":
            streamRes.headers["content-type"] ||
            "multipart/x-mixed-replace; boundary=frame",
          "cache-control": "no-cache, no-store",
          "access-control-allow-origin": "*",
        });
        streamRes.pipe(res);
      });

      upstream.on("error", (error) => {
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        }
        res.end(error.message);
      });

      req.on("close", () => upstream.destroy());

      return;
    }

    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(html);
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`serve-sim viewer listening on http://127.0.0.1:${port}`);
  });
