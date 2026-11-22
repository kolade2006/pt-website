"use strict";

/*
 * Local development server
 * ------------------------
 * Serves the static website and the two serverless endpoints exactly as they
 * are shaped for Vercel. No dependencies are required.
 *
 *   npm run dev
 *   open http://localhost:5503
 *
 * The contact endpoint runs in development mode by default, so submissions are
 * validated and written to .dev/contact-messages.jsonl instead of being emailed.
 * Set CONTACT_DEV_MODE=false in .env to test the real delivery configuration.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 5503;

function loadEnvFile() {
    const envPath = path.join(ROOT, ".env");

    if (!fs.existsSync(envPath)) {
        return;
    }

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

    lines.forEach(function (line) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
            return;
        }

        const separator = trimmed.indexOf("=");

        if (separator === -1) {
            return;
        }

        const key = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (!(key in process.env)) {
            process.env[key] = value;
        }
    });
}

loadEnvFile();

if (process.env.CONTACT_DEV_MODE === undefined) {
    process.env.CONTACT_DEV_MODE = "true";
}

// Load the handlers after the environment has been prepared.
const contactHandler = require(path.join(ROOT, "api", "contact.js"));
const youtubeHandler = require(path.join(ROOT, "api", "youtube-videos.js"));

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8"
};

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(payload));
}

function serveStatic(req, res, pathname) {
    let requested = decodeURIComponent(pathname);

    if (requested === "/") {
        requested = "/homepage.html";
    }

    // Never serve dotfiles, environment files or backend source over HTTP.
    if (
        requested.split("/").some(function (part) {
            return part.startsWith(".");
        })
    ) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Not found");
        return;
    }

    // Allow extensionless URLs such as /about.
    if (!path.extname(requested)) {
        const htmlCandidate = path.join(ROOT, requested + ".html");

        if (fs.existsSync(htmlCandidate)) {
            requested += ".html";
        }
    }

    const filePath = path.resolve(ROOT, "." + requested);

    if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
    }

    let stat;

    try {
        stat = fs.statSync(filePath);
    } catch (error) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Not found");
        return;
    }

    if (stat.isDirectory()) {
        const indexFile = path.join(filePath, "index.html");

        if (fs.existsSync(indexFile)) {
            serveStatic(req, res, pathname.replace(/\/?$/, "/") + "index.html");
            return;
        }

        res.statusCode = 404;
        res.end("Not found");
        return;
    }

    const extension = path.extname(filePath).toLowerCase();

    res.statusCode = 200;
    res.setHeader("Content-Type", MIME_TYPES[extension] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(function (req, res) {
    const requestUrl = new URL(req.url, "http://localhost");
    const pathname = requestUrl.pathname;

    if (pathname === "/api/contact") {
        Promise.resolve(contactHandler(req, res)).catch(function (error) {
            console.error("[dev] contact handler error:", error);

            if (!res.headersSent) {
                sendJson(res, 500, {
                    ok: false,
                    message: "Unexpected server error."
                });
            }
        });
        return;
    }

    if (pathname === "/api/youtube-videos") {
        Promise.resolve(youtubeHandler(req, res)).catch(function (error) {
            console.error("[dev] youtube handler error:", error);

            if (!res.headersSent) {
                sendJson(res, 500, {
                    ok: false,
                    message: "Unexpected server error.",
                    videos: []
                });
            }
        });
        return;
    }

    if (pathname.startsWith("/api/")) {
        sendJson(res, 404, {
            ok: false,
            message: "API route not found."
        });
        return;
    }

    serveStatic(req, res, pathname);
});

server.listen(PORT, function () {
    console.log("Praise Tabernacle site running at http://localhost:" + PORT);
    console.log(
        "Contact form mode: " +
            (process.env.CONTACT_DEV_MODE === "true"
                ? "development (messages saved to .dev/contact-messages.jsonl)"
                : "live delivery")
    );
});
