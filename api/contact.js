"use strict";

/*
 * Contact form endpoint
 * ---------------------
 * Works as a Vercel Node.js serverless function (api/contact.js).
 *
 * Delivery channels:
 *   - Email through Resend (required for email notifications)
 *   - Message storage through Supabase REST (optional but recommended)
 *   - WhatsApp Cloud API notification (optional)
 *
 * A submission is only reported as successful when it was either emailed or
 * stored. Secrets are read from environment variables only.
 */

const fs = require("fs");
const path = require("path");

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
// CHURCH_EMAIL is the preferred name. CONTACT_TO_EMAIL remains supported
// for existing deployments.
const CONTACT_TO_EMAIL =
    process.env.CHURCH_EMAIL || process.env.CONTACT_TO_EMAIL || "";
const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || "";
const CONTACT_REPLY_TO = process.env.CONTACT_REPLY_TO || "";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_CONTACT_TABLE = /^[A-Za-z0-9_]+$/.test(
    process.env.SUPABASE_CONTACT_TABLE || ""
)
    ? process.env.SUPABASE_CONTACT_TABLE
    : "contact_messages";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_TO_NUMBER = process.env.WHATSAPP_TO_NUMBER || "";
const WHATSAPP_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || "";
const WHATSAPP_TEMPLATE_LANGUAGE =
    process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";

// Development mode is local-only. It must never run on a deployed Vercel
// instance, where it would report success without delivering anything.
const CONTACT_DEV_MODE =
    String(process.env.CONTACT_DEV_MODE || "").toLowerCase() === "true" &&
    !process.env.VERCEL &&
    process.env.NODE_ENV !== "production";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 3;
const MIN_FORM_TIME_MS = 1500;

const rateLimitStore = new Map();

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(JSON.stringify(payload));
}

function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];

    if (forwarded) {
        const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
        return value.split(",")[0].trim();
    }

    return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
    const now = Date.now();
    const record = rateLimitStore.get(ip);

    if (!record || now - record.startedAt > RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.set(ip, { startedAt: now, count: 1 });
        return false;
    }

    record.count += 1;

    if (record.count > RATE_LIMIT_MAX) {
        return true;
    }

    return false;
}

function cleanText(value, maxLength) {
    if (typeof value !== "string") {
        return "";
    }

    return value.replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function singleLine(value, maxLength) {
    return cleanText(value, maxLength).replace(/[\r\n]+/g, " ").trim();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function countDigits(value) {
    return (value.match(/\d/g) || []).length;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function readRequestBody(req) {
    if (req.body && typeof req.body === "object") {
        return req.body;
    }

    if (typeof req.body === "string" && req.body.length > 0) {
        return JSON.parse(req.body);
    }

    return new Promise(function (resolve, reject) {
        let raw = "";

        req.on("data", function (chunk) {
            raw += chunk;

            // Reject unexpectedly large payloads (about 32 KB).
            if (raw.length > 32768) {
                reject(new Error("Payload too large"));
                req.destroy();
            }
        });

        req.on("end", function () {
            if (!raw) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(new Error("Invalid JSON"));
            }
        });

        req.on("error", reject);
    });
}

function validatePayload(body) {
    const data = {
        fullName: singleLine(body.fullName || body["full-name"] || body.name, 120),
        email: singleLine(body.email, 180).toLowerCase(),
        phone: singleLine(body.phone, 30),
        subject: singleLine(body.subject, 160),
        message: cleanText(body.message, 5000),
        website: cleanText(body.website, 200),
        startedAt: Number(body.startedAt) || 0
    };

    const errors = {};

    if (data.fullName.length < 2) {
        errors.fullName = "Please enter your full name.";
    }

    if (!isValidEmail(data.email)) {
        errors.email = "Please enter a valid email address.";
    }

    if (data.phone) {
        const validCharacters = /^[+()\d\s-]+$/.test(data.phone);
        const digits = countDigits(data.phone);

        if (!validCharacters || digits < 7 || digits > 15) {
            errors.phone = "Please enter a valid phone number.";
        }
    }

    if (data.subject.length < 2) {
        errors.subject = "Please add a subject.";
    }

    if (data.message.length < 10) {
        errors.message = "Please write a message of at least 10 characters.";
    }

    if ((data.message.match(/https?:\/\//gi) || []).length > 4) {
        errors.message = "Please remove the extra links from your message.";
    }

    return { data, errors };
}

function buildEmailHtml(data) {
    const submittedAt = new Date().toLocaleString("en-GB", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Africa/Lagos"
    });

    return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#F7F6F2;">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:#252B33;">
    <div style="background:#172A45;color:#FFFFFF;padding:24px;border-bottom:4px solid #C6A15B;">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;color:#C6A15B;">PRAISE TABERNACLE</p>
      <h1 style="margin:0;font-size:22px;line-height:1.3;">New website enquiry</h1>
    </div>

    <div style="background:#FFFFFF;padding:24px;">
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">
        A visitor submitted the contact form on the church website.
      </p>

      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:9px 0;color:#6B6B6B;width:120px;">Name</td>
          <td style="padding:9px 0;font-weight:700;">${escapeHtml(data.fullName)}</td>
        </tr>
        <tr>
          <td style="padding:9px 0;color:#6B6B6B;">Email</td>
          <td style="padding:9px 0;">
            <a href="mailto:${escapeHtml(data.email)}" style="color:#8D6B2F;">${escapeHtml(data.email)}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:9px 0;color:#6B6B6B;">Phone</td>
          <td style="padding:9px 0;">${escapeHtml(data.phone || "Not provided")}</td>
        </tr>
        <tr>
          <td style="padding:9px 0;color:#6B6B6B;">Subject</td>
          <td style="padding:9px 0;font-weight:700;">${escapeHtml(data.subject)}</td>
        </tr>
        <tr>
          <td style="padding:9px 0;color:#6B6B6B;">Submitted</td>
          <td style="padding:9px 0;">${escapeHtml(submittedAt)} (Lagos time)</td>
        </tr>
      </table>

      <div style="margin-top:20px;padding:18px;background:#F7F6F2;border-left:3px solid #C6A15B;">
        <p style="margin:0 0 8px;color:#6B6B6B;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Message</p>
        <p style="margin:0;font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(data.message)}</p>
      </div>

      <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#6B6B6B;">
        Reply directly to this email to respond to ${escapeHtml(data.fullName)}.
      </p>
    </div>

    <p style="margin:16px 0 0;text-align:center;font-size:11px;color:#8A8A8A;">
      Sent automatically from the Praise Tabernacle website contact form.
    </p>
  </div>
</body>
</html>`;
}

function buildEmailText(data) {
    return [
        "PRAISE TABERNACLE - NEW WEBSITE ENQUIRY",
        "",
        "Name: " + data.fullName,
        "Email: " + data.email,
        "Phone: " + (data.phone || "Not provided"),
        "Subject: " + data.subject,
        "Submitted: " + new Date().toISOString(),
        "",
        "Message:",
        data.message
    ].join("\n");
}

async function sendEmailNotification(data) {
    const response = await fetchWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: "Bearer " + RESEND_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: CONTACT_FROM_EMAIL,
            to: [CONTACT_TO_EMAIL],
            reply_to: CONTACT_REPLY_TO || data.email,
            subject: "New website enquiry: " + data.subject,
            html: buildEmailHtml(data),
            text: buildEmailText(data)
        })
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(
            "Resend returned " + response.status + ": " + detail.slice(0, 300)
        );
    }

    return true;
}

async function storeMessageInSupabase(data) {
    const response = await fetchWithTimeout(
        SUPABASE_URL + "/rest/v1/" + SUPABASE_CONTACT_TABLE,
        {
            method: "POST",
            headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": "application/json",
                Prefer: "return=minimal"
            },
            body: JSON.stringify({
                full_name: data.fullName,
                email: data.email,
                phone: data.phone || null,
                subject: data.subject,
                message: data.message,
                status: "unread",
                source: "website"
            })
        }
    );

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(
            "Supabase returned " + response.status + ": " + detail.slice(0, 300)
        );
    }

    return true;
}

async function sendWhatsAppNotification(data) {
    const endpoint =
        "https://graph.facebook.com/v21.0/" +
        WHATSAPP_PHONE_NUMBER_ID +
        "/messages";

    let payload;

    if (WHATSAPP_TEMPLATE_NAME) {
        // The approved template should have three body parameters:
        // {{1}} visitor name, {{2}} subject, {{3}} email address.
        payload = {
            messaging_product: "whatsapp",
            to: WHATSAPP_TO_NUMBER,
            type: "template",
            template: {
                name: WHATSAPP_TEMPLATE_NAME,
                language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
                components: [
                    {
                        type: "body",
                        parameters: [
                            { type: "text", text: data.fullName },
                            { type: "text", text: data.subject },
                            { type: "text", text: data.email }
                        ]
                    }
                ]
            }
        };
    } else {
        // Free-form messages are only delivered inside the 24-hour customer
        // service window. Use a template for reliable notifications.
        payload = {
            messaging_product: "whatsapp",
            to: WHATSAPP_TO_NUMBER,
            type: "text",
            text: {
                preview_url: false,
                body:
                    "New website enquiry\n" +
                    "Name: " + data.fullName + "\n" +
                    "Email: " + data.email + "\n" +
                    "Phone: " + (data.phone || "Not provided") + "\n" +
                    "Subject: " + data.subject + "\n\n" +
                    data.message.slice(0, 900)
            }
        };
    }

    const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
            Authorization: "Bearer " + WHATSAPP_TOKEN,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(
            "WhatsApp returned " + response.status + ": " + detail.slice(0, 300)
        );
    }

    return true;
}

function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(
        function () {
            controller.abort();
        },
        timeoutMs || 10000
    );

    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
        .finally(function () {
            clearTimeout(timer);
        });
}

function saveDevMessage(data, outcome) {
    try {
        const directory = path.join(process.cwd(), ".dev");

        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        fs.appendFileSync(
            path.join(directory, "contact-messages.jsonl"),
            JSON.stringify({
                receivedAt: new Date().toISOString(),
                ...data,
                website: undefined,
                outcome: outcome
            }) + "\n",
            "utf8"
        );
    } catch (error) {
        // Local logging must never break the request.
    }
}

module.exports = async function handler(req, res) {
    if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.setHeader("Allow", "POST, OPTIONS");
        res.end();
        return;
    }

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        sendJson(res, 405, {
            ok: false,
            message: "Method not allowed."
        });
        return;
    }

    const ip = getClientIp(req);

    if (isRateLimited(ip)) {
        sendJson(res, 429, {
            ok: false,
            code: "rate_limited",
            message: "Too many messages were sent. Please wait a minute and try again."
        });
        return;
    }

    let body;

    try {
        body = await readRequestBody(req);
    } catch (error) {
        sendJson(res, 400, {
            ok: false,
            code: "invalid_request",
            message: "The request could not be read. Please try again."
        });
        return;
    }

    const { data, errors } = validatePayload(body);

    // Honeypot: genuine visitors never fill this hidden field.
    if (data.website) {
        sendJson(res, 400, {
            ok: false,
            code: "spam_detected",
            message: "Your message could not be sent. Please try again."
        });
        return;
    }

    // Reject submissions completed implausibly quickly by automated tools.
    if (data.startedAt && Date.now() - data.startedAt < MIN_FORM_TIME_MS) {
        sendJson(res, 400, {
            ok: false,
            code: "too_fast",
            message: "Please take a moment to complete the form and try again."
        });
        return;
    }

    const errorKeys = Object.keys(errors);

    if (errorKeys.length > 0) {
        sendJson(res, 400, {
            ok: false,
            code: "validation_failed",
            message: errors[errorKeys[0]],
            fields: errors
        });
        return;
    }

    if (CONTACT_DEV_MODE) {
        saveDevMessage(data, "dev-mode");

        sendJson(res, 200, {
            ok: true,
            devMode: true,
            message:
                "Development mode: your message was validated and logged locally. " +
                "No email or database delivery was attempted."
        });
        return;
    }

    // Never treat the placeholder values from .env.example as real addresses.
    const looksLikePlaceholder = function (value) {
        return /placeholder|example\.(com|org|net)|your-verified-domain/i.test(
            value
        );
    };

    const emailConfigured = Boolean(
        RESEND_API_KEY &&
            CONTACT_TO_EMAIL &&
            CONTACT_FROM_EMAIL &&
            !looksLikePlaceholder(CONTACT_TO_EMAIL) &&
            !looksLikePlaceholder(CONTACT_FROM_EMAIL)
    );
    const databaseConfigured = Boolean(
        SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    );
    const whatsappConfigured = Boolean(
        WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_TO_NUMBER
    );

    if (!emailConfigured && !databaseConfigured) {
        sendJson(res, 503, {
            ok: false,
            code: "not_configured",
            message:
                "The contact form is not configured yet. " +
                "Please reach us through our social media pages."
        });
        return;
    }

    const jobs = [];

    if (emailConfigured) {
        jobs.push({ name: "email", run: sendEmailNotification(data) });
    }

    if (databaseConfigured) {
        jobs.push({ name: "database", run: storeMessageInSupabase(data) });
    }

    if (whatsappConfigured) {
        jobs.push({ name: "whatsapp", run: sendWhatsAppNotification(data) });
    }

    const settled = await Promise.allSettled(
        jobs.map(function (job) {
            return job.run;
        })
    );

    const outcomes = {};

    settled.forEach(function (result, index) {
        const name = jobs[index].name;
        outcomes[name] = result.status === "fulfilled";

        if (result.status === "rejected") {
            console.error(
                "[contact] " + name + " delivery failed:",
                result.reason && result.reason.message
                    ? result.reason.message
                    : "unknown error"
            );
        }
    });

    const delivered = Boolean(outcomes.email || outcomes.database);

    if (!delivered) {
        sendJson(res, 502, {
            ok: false,
            code: "delivery_failed",
            message:
                "Your message could not be delivered right now. " +
                "Please try again in a moment or use our social media pages."
        });
        return;
    }

    sendJson(res, 200, {
        ok: true,
        emailed: Boolean(outcomes.email),
        stored: Boolean(outcomes.database),
        whatsappNotified: Boolean(outcomes.whatsapp),
        message: "Thank you. Your message has been received."
    });
};

