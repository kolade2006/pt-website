"use strict";

/*
 * YouTube videos endpoint
 * -----------------------
 * Returns the latest public uploads for the church channel so the homepage
 * "Latest Service" card and the Catch Up gallery update automatically.
 *
 * Primary source: YouTube Data API v3.
 *   1. channels.list           resolves the handle and uploads playlist.
 *   2. playlistItems.list      reads recent uploads newest first.
 *   3. videos.list             removes private/deleted/unprocessed videos.
 *
 * Resilience:
 *   - A 30-minute server cache avoids unnecessary API calls.
 *   - If the API is unavailable, a previously cached response is served.
 *   - If no cache exists, the public channel RSS feed is attempted.
 *   - If that also fails, the endpoint returns a clear error and the frontend
 *     keeps its curated video fallback.
 *
 * Secrets are read from environment variables only and never returned.
 */

const YOUTUBE_CHANNEL_HANDLE = (
    process.env.YOUTUBE_CHANNEL_HANDLE || "praisetabernacleogombo"
)
    .trim()
    .replace(/^@+/, "");
const YOUTUBE_CHANNEL_ID = (process.env.YOUTUBE_CHANNEL_ID || "").trim();
const YOUTUBE_API_KEY = (process.env.YOUTUBE_API_KEY || "").trim();

const API_BASE = "https://www.googleapis.com/youtube/v3/";
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_SECONDS = Math.floor(CACHE_TTL_MS / 1000);
const MAX_VIDEOS = 8;
const MAX_CANDIDATES = 25;

const cache = {
    fetchedAt: 0,
    channelId: "",
    channelTitle: "",
    uploadsPlaylistId: "",
    source: "",
    videos: []
};

function sendJson(res, statusCode, payload, maxAgeSeconds) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
        "Cache-Control",
        maxAgeSeconds
            ? "public, s-maxage=" +
              maxAgeSeconds +
              ", stale-while-revalidate=86400"
            : "no-store, max-age=0"
    );
    res.end(JSON.stringify(payload));
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
        controller.abort();
    }, timeoutMs || 12000);

    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
        .finally(function () {
            clearTimeout(timer);
        });
}

function decodeXml(value) {
    return value
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, function (_, code) {
            return String.fromCharCode(Number(code));
        })
        .replace(/&amp;/g, "&")
        .trim();
}

function extractChannelId(html) {
    const patterns = [
        /"channelId":"(UC[\w-]{20,})"/,
        /"externalId":"(UC[\w-]{20,})"/,
        /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{20,})"/,
        /channel_id=(UC[\w-]{20,})/
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);

        if (match) {
            return match[1];
        }
    }

    return "";
}

async function resolveChannelIdFromPage() {
    if (YOUTUBE_CHANNEL_ID) {
        return YOUTUBE_CHANNEL_ID;
    }

    if (cache.channelId) {
        return cache.channelId;
    }

    const response = await fetchWithTimeout(
        "https://www.youtube.com/@" +
            encodeURIComponent(YOUTUBE_CHANNEL_HANDLE) +
            "?hl=en&gl=US",
        {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+000"
            }
        }
    );

    if (!response.ok) {
        throw new Error("YouTube channel page returned " + response.status);
    }

    const html = await response.text();
    const channelId = extractChannelId(html);

    if (!channelId) {
        throw new Error(
            "Could not resolve the YouTube channel ID. " +
            "Set YOUTUBE_CHANNEL_ID in the environment."
        );
    }

    cache.channelId = channelId;

    return channelId;
}

async function callYouTubeApi(resource, params) {
    if (!YOUTUBE_API_KEY) {
        throw new Error("YOUTUBE_API_KEY is not configured.");
    }

    const url = new URL(API_BASE + resource);

    Object.keys(params).forEach(function (key) {
        const value = params[key];

        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    });

    url.searchParams.set("key", YOUTUBE_API_KEY);

    const response = await fetchWithTimeout(url.toString(), {
        headers: { Accept: "application/json" }
    });
    const text = await response.text();
    let data = null;

    try {
        data = JSON.parse(text);
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        const detail =
            data && data.error && data.error.message
                ? data.error.message
                : "HTTP " + response.status;

        throw new Error("YouTube Data API error: " + detail);
    }

    return data || {};
}

async function fetchChannelFromApi() {
    const params = {
        part: "snippet,contentDetails"
    };

    if (YOUTUBE_CHANNEL_ID) {
        params.id = YOUTUBE_CHANNEL_ID;
    } else {
        params.forHandle = YOUTUBE_CHANNEL_HANDLE;
    }

    const data = await callYouTubeApi("channels", params);
    const channel = Array.isArray(data.items) ? data.items[0] : null;

    if (!channel) {
        throw new Error(
            "The configured YouTube channel could not be found. " +
            "Check YOUTUBE_CHANNEL_HANDLE or YOUTUBE_CHANNEL_ID."
        );
    }

    const uploadsPlaylistId =
        channel.contentDetails &&
        channel.contentDetails.relatedPlaylists &&
        channel.contentDetails.relatedPlaylists.uploads;

    if (!uploadsPlaylistId) {
        throw new Error("The YouTube channel has no uploads playlist.");
    }

    return {
        channelId: channel.id,
        channelTitle:
            (channel.snippet && channel.snippet.title) || "YouTube channel",
        uploadsPlaylistId: uploadsPlaylistId
    };
}

function bestThumbnail(thumbnails) {
    const thumb =
        thumbnails.maxres ||
        thumbnails.standard ||
        thumbnails.high ||
        thumbnails.medium ||
        thumbnails.default;

    return thumb && thumb.url ? thumb.url : "";
}

function buildVideoRecord(id, title, published, thumbnails) {
    const best = bestThumbnail(thumbnails || {});
    const fallback = "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";

    return {
        id: id,
        title: title || "Praise Tabernacle service",
        published: published || "",
        url: "https://www.youtube.com/watch?v=" + id,
        thumbnail: best || "https://i.ytimg.com/vi/" + id + "/hq720.jpg",
        thumbnailFallback: fallback
    };
}

async function fetchPlaylistCandidates(uploadsPlaylistId) {
    const candidates = [];
    const seen = new Set();
    let pageToken = "";

    for (let page = 0; page < 3 && candidates.length < MAX_CANDIDATES; page += 1) {
        const params = {
            part: "snippet,contentDetails",
            playlistId: uploadsPlaylistId,
            maxResults: 25
        };

        if (pageToken) {
            params.pageToken = pageToken;
        }

        const data = await callYouTubeApi("playlistItems", params);
        const items = Array.isArray(data.items) ? data.items : [];

        for (const item of items) {
            const snippet = item.snippet || {};
            const videoId =
                (item.contentDetails && item.contentDetails.videoId) ||
                (snippet.resourceId && snippet.resourceId.videoId) ||
                "";

            if (!videoId || seen.has(videoId)) {
                continue;
            }

            seen.add(videoId);

            if (
                !snippet.title ||
                snippet.title === "Private video" ||
                snippet.title === "Deleted video"
            ) {
                continue;
            }

            // Do not treat an active or scheduled livestream as a finished
            // previous service.
            if (
                snippet.liveBroadcastContent === "live" ||
                snippet.liveBroadcastContent === "upcoming"
            ) {
                continue;
            }

            candidates.push({
                videoId: videoId,
                title: snippet.title,
                published: snippet.publishedAt || "",
                thumbnails: snippet.thumbnails || {}
            });

            if (candidates.length >= MAX_CANDIDATES) {
                break;
            }
        }

        pageToken = data.nextPageToken || "";

        if (!pageToken) {
            break;
        }
    }

    return candidates;
}

async function fetchVideoStatuses(videoIds) {
    const statuses = new Map();

    for (let index = 0; index < videoIds.length; index += 50) {
        const batch = videoIds.slice(index, index + 50);
        const data = await callYouTubeApi("videos", {
            part: "status",
            id: batch.join(",")
        });
        const items = Array.isArray(data.items) ? data.items : [];

        items.forEach(function (item) {
            statuses.set(item.id, item.status || {});
        });
    }

    return statuses;
}

async function fetchFromYouTubeApi() {
    const channel = await fetchChannelFromApi();
    const candidates = await fetchPlaylistCandidates(channel.uploadsPlaylistId);
    const statuses = await fetchVideoStatuses(
        candidates.map(function (candidate) {
            return candidate.videoId;
        })
    );

    const videos = [];

    for (const candidate of candidates) {
        const status = statuses.get(candidate.videoId);

        if (!status) {
            continue;
        }

        // Only public, fully processed videos are useful to website visitors.
        if (status.privacyStatus !== "public") {
            continue;
        }

        if (status.uploadStatus && status.uploadStatus !== "processed") {
            continue;
        }

        videos.push(
            buildVideoRecord(
                candidate.videoId,
                candidate.title,
                candidate.published,
                candidate.thumbnails
            )
        );

        if (videos.length >= MAX_VIDEOS) {
            break;
        }
    }

    if (videos.length === 0) {
        throw new Error("The YouTube API returned no public recent videos.");
    }

    cache.channelId = channel.channelId;
    cache.channelTitle = channel.channelTitle;
    cache.uploadsPlaylistId = channel.uploadsPlaylistId;

    return {
        videos: videos,
        source: "youtube-api",
        channelId: channel.channelId,
        channelTitle: channel.channelTitle
    };
}

async function fetchFromRss() {
    const channelId = await resolveChannelIdFromPage();
    const response = await fetchWithTimeout(
        "https://www.youtube.com/feeds/videos.xml?channel_id=" +
            encodeURIComponent(channelId),
        {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9"
            }
        }
    );

    if (!response.ok) {
        throw new Error("YouTube RSS feed returned " + response.status);
    }

    const xml = await response.text();
    const videos = [];
    const entryPattern = /<entry>([\s\S]*?)<\/entry>/g;

    let match = entryPattern.exec(xml);

    while (match && videos.length < MAX_VIDEOS) {
        const entry = match[1];
        const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
        const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
        const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);

        if (idMatch) {
            const videoId = idMatch[1].trim();
            const title = titleMatch ? decodeXml(titleMatch[1]) : "";

            if (
                title &&
                title !== "Private video" &&
                title !== "Deleted video"
            ) {
                videos.push(
                    buildVideoRecord(
                        videoId,
                        title,
                        publishedMatch ? publishedMatch[1].trim() : "",
                        {}
                    )
                );
            }
        }

        match = entryPattern.exec(xml);
    }

    if (videos.length === 0) {
        throw new Error("The YouTube RSS feed contained no public videos.");
    }

    cache.channelId = channelId;

    return {
        videos: videos,
        source: "rss-fallback",
        channelId: channelId,
        channelTitle: ""
    };
}

async function loadVideos() {
    let apiError = null;

    if (YOUTUBE_API_KEY) {
        try {
            return await fetchFromYouTubeApi();
        } catch (error) {
            apiError = error;
            console.warn("[youtube] Data API request failed:", error.message);
        }
    }

    try {
        return await fetchFromRss();
    } catch (error) {
        if (apiError) {
            throw new Error(
                apiError.message + " RSS fallback also failed: " + error.message
            );
        }

        throw error;
    }
}

module.exports = async function handler(req, res) {
    if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.setHeader("Allow", "GET, OPTIONS");
        res.end();
        return;
    }

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        sendJson(res, 405, {
            ok: false,
            message: "Method not allowed."
        });
        return;
    }

    const requestUrl = new URL(req.url, "http://localhost");
    const requestedLimit = Number(requestUrl.searchParams.get("limit"));
    const limit = Math.min(
        MAX_VIDEOS,
        Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : MAX_VIDEOS)
    );

    const now = Date.now();
    const isFresh =
        cache.videos.length > 0 && now - cache.fetchedAt < CACHE_TTL_MS;

    let videos = cache.videos;
    let source = cache.source;
    let stale = false;

    if (!isFresh) {
        try {
            const result = await loadVideos();

            if (result.videos.length > 0) {
                cache.videos = result.videos;
                cache.channelId = result.channelId || cache.channelId;
                cache.channelTitle =
                    result.channelTitle || cache.channelTitle;
                cache.source = result.source;
                cache.fetchedAt = now;
                videos = result.videos;
                source = result.source;
            }
        } catch (error) {
            console.error("[youtube] Unable to load videos:", error.message);

            if (cache.videos.length > 0) {
                videos = cache.videos;
                source = cache.source;
                stale = true;
            } else {
                sendJson(res, 502, {
                    ok: false,
                    code: "youtube_unavailable",
                    message:
                        "The YouTube feed could not be loaded. " +
                        "Configure YOUTUBE_API_KEY and verify the channel settings.",
                    videos: []
                });
                return;
            }
        }
    }

    sendJson(
        res,
        200,
        {
            ok: true,
            channelUrl: "https://youtube.com/@" + YOUTUBE_CHANNEL_HANDLE,
            channelId: cache.channelId,
            channelTitle: cache.channelTitle,
            source: source,
            stale: stale,
            cachedAt: cache.fetchedAt
                ? new Date(cache.fetchedAt).toISOString()
                : null,
            cacheTtlSeconds: CACHE_SECONDS,
            videos: videos.slice(0, limit)
        },
        stale ? 60 : CACHE_SECONDS
    );
};
