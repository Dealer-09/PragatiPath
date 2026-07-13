const { GoogleGenerativeAI } = require("@google/generative-ai");
const { LRUCache } = require('lru-cache');
const crypto = require('node:crypto');

// BYOK — no server-side Gemini key.
// Every request must include the user's key in the X-Gemini-Key header.

function getAI(req) {
    const key = req.headers['x-gemini-key'];
    if (!key) return null;
    return new GoogleGenerativeAI(key);
}

// ── YouTube search (Gemini-powered) ──────────────────────────────────────────
async function endpoint_geminiYoutubeSearch(req, res) {
    const query = req.query.q;
    if (!query) return res.json({ error: "Query parameter ?q= is required." });

    const ai = getAI(req);
    if (!ai) return res.status(400).json({ error: "No Gemini API key provided. Set your key in the dashboard." });

    // Sanitise: cap length, strip characters used in prompt injection
    const safeQuery = String(query).slice(0, 200).replace(/[`"\\]/g, '');

    try {
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(
            `List the top 5 YouTube videos about agricultural farming related to "${safeQuery}". ` +
            `Respond ONLY as a JSON array. Each item must have: title (string), url (full YouTube search URL), channel (string). ` +
            `No markdown, no extra text. Example: [{"title":"...","url":"https://www.youtube.com/results?search_query=...","channel":"..."}]`
        );
        let text = result.response.text().trim()
            .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        const videos = JSON.parse(text);
        res.json({ videos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// ── YouTube playlist thumbnail ─────────────────────────────────────────────
async function endpoint_youtubePlaylistImg(req, res) {
    if (!req.params.playlist) return res.json({ error: "Playlist ID is required." });

    try {
        const yres = await fetch(
            `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${req.params.playlist}&key=${process.env.YOUTUBE_DATA_API_KEY}`
        );
        const data = await yres.json();
        if (data.items && data.items.length > 0) {
            const thumbs = data.items[0].snippet.thumbnails;
            res.json({
                img: thumbs.maxres?.url || thumbs.high?.url || thumbs.default?.url || '',
                title: data.items[0].snippet.title
            });
        } else {
            res.json({ error: "Playlist not found." });
        }
    } catch (err) {
        console.error("[aiSearch] endpoint_youtubePlaylistImg failed", err);
        res.status(500).json({ error: "Failed to fetch playlist info." });
    }
}

// ── YouTube channel info ───────────────────────────────────────────────────
async function endpoint_getChannelInfo(req, res) {
    if (!req.params.playlistId) return res.json({ error: "Playlist ID is required." });

    try {
        const playlistRes = await fetch(
            `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${req.params.playlistId}&key=${process.env.YOUTUBE_DATA_API_KEY}`
        );
        const playlistData = await playlistRes.json();
        if (!playlistData.items || playlistData.items.length === 0) return res.json({ error: "Invalid playlist ID" });

        const channelId = playlistData.items[0].snippet.channelId;
        const channelRes = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${process.env.YOUTUBE_DATA_API_KEY}`
        );
        const channelData = await channelRes.json();
        if (!channelData.items || channelData.items.length === 0) return res.json({ error: "Invalid channel ID" });

        const info = channelData.items[0].snippet;
        res.json({
            channelId,
            channelTitle: info.title,
            channelDescription: info.description,
            channelThumbnail: info.thumbnails?.default?.url || '',
        });
    } catch (error) {
        console.error("[aiSearch] endpoint_getChannelInfo failed", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

// ── OpenWeather API ────────────────────────────────────────────────────────
async function endpoint_openWeatherAPI(req, res) {
    const { lat, lon } = req.params;
    try {
        const wres = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
        );
        const data = await wres.json();
        // Guard against API error responses (bad key, invalid coords, quota exceeded)
        if (!data.weather || !data.main) {
            return res.status(502).json({ error: data.message || "Weather data unavailable." });
        }
        res.json({
            name: data.name,
            weather: data.weather[0].description,
            temp: data.main.temp,
            humidity: data.main.humidity,
            wind: data.wind.speed
        });
    } catch (err) {
        console.error("[aiSearch] endpoint_openWeatherAPI failed", err);
        res.status(500).json({ error: "Failed to fetch weather data." });
    }
}

const botMap = new LRUCache({ max: 1000, ttl: 1000 * 60 * 60 * 24 });

// Retry a Gemini call once if it's a transient 503 overload
async function withRetry(fn, retries = 1, delayMs = 2000) {
    try {
        return await fn();
    } catch (err) {
        if (retries > 0 && err.message && err.message.includes('503')) {
            await new Promise(r => setTimeout(r, delayMs));
            return withRetry(fn, retries - 1, delayMs * 2);
        }
        throw err;
    }
}

function friendlyGeminiError(err) {
    const msg = err.message || '';
    if (msg.includes('503') || msg.includes('high demand')) {
        return 'Gemini is temporarily overloaded. Please try again in a few seconds.';
    }
    if (msg.includes('API_KEY_INVALID') || msg.includes('400')) {
        return 'Your Gemini API key is invalid. Please re-enter it in the dashboard settings (🔑 API Key).';
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
        return 'Your API key does not have access to this Gemini model. Check your Google AI Studio permissions.';
    }
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        return 'Gemini rate limit hit. Please wait a moment and try again.';
    }
    return `Gemini error: ${msg}`;
}

async function endpoint_chatbot(req, res) {
    // Validate query FIRST before any expensive work
    const query = req.body?.query;
    if (!query) return res.json({ error: "Query parameter is required." });

    const ai = getAI(req);
    if (!ai) return res.status(400).json({ error: "No Gemini API key provided. Open the dashboard settings and enter your key." });

    const keyHash = crypto.createHash('sha256')
        .update(req.headers['x-gemini-key']).digest('hex').slice(0, 8);
    const cacheKey = `${req.auth.userId}-${keyHash}`;

    try {
        let bot = botMap.get(cacheKey);
        if (!bot) {
            const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
            bot = model.startChat();
            // System prompt — if this throws (bad key, rate limit, etc.)
            // the error is caught below and returned as JSON, not an HTML 500 page.
            await bot.sendMessage(
                "You are a helpful assistant answering questions to a farmer requiring help in agriculture in our \"PragatiPath\" farming education site\n" +
                "Also don't answer any questions unrelated to farming, agriculture, and rural life since it is disallowed on this platform. Also, push the user towards education and skill building.\n" +
                "Here are some useful answers to common questions:\n" +
                "How to avail courses? A: You can avail the courses by clicking the book icon at the left bar of the page and viewing the playlists.\n" +
                "How to contact the developers? A: You can contact the developers by clicking the email button at the left bar of the page.\n" +
                "How to use the AI tools? A: Click the AI tools button at the left bar — pass a sick leaf image to the disease finder, or check weather patterns.\n" +
                "Who are the developers? A: Alpha 4 – Rouvik Maji, Vikash Kumar Gupta, Rajbeer Saha (STCET), and Archisman Pal (AOT) — built this at the 2025 CODEFLOW Hackathon."
            );
            botMap.set(cacheKey, bot); // only cache after successful init
        }

        const msg = await withRetry(() => bot.sendMessage(query));
        res.json({ response: msg.response.text() });
    } catch (err) {
        botMap.delete(cacheKey); // evict broken session so next request retries fresh
        res.status(400).json({ error: friendlyGeminiError(err) });
    }
}

module.exports = { endpoint_openWeatherAPI, endpoint_geminiYoutubeSearch, endpoint_youtubePlaylistImg, endpoint_getChannelInfo, endpoint_chatbot };