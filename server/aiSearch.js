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
        let text = result.response.text().trim();
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match) text = match[1].trim();
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
        // Run weather + reverse geocode in parallel — same API key, one extra call bundled here
        // so the client never needs to call geocode separately (mandi reuses state/district)
        const [wres, gres] = await Promise.all([
            fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`),
            fetch(`http://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${process.env.OPENWEATHER_API_KEY}`)
        ]);
        const data    = await wres.json();
        const geoData = await gres.json().catch(() => []);
        // Guard against API error responses (bad key, invalid coords, quota exceeded)
        if (!data.weather || !data.main) {
            return res.status(502).json({ error: data.message || "Weather data unavailable." });
        }
        const geo = Array.isArray(geoData) && geoData[0] ? geoData[0] : {};
        res.json({
            name:     data.name,
            weather:  data.weather[0].description,
            temp:     data.main.temp,
            humidity: data.main.humidity,
            wind:     data.wind.speed,
            state:    geo.state    || null,   // e.g. "West Bengal" — reused by mandi
            district: geo.name     || null    // e.g. "Bally"
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

// ── Phase 2: Agronomy Data Pipeline (SoilGrids + Open-Meteo) ─────────────────
async function endpoint_getAgronomyData(req, res) {
    const { lat, lon } = req.params;
    if (!lat || !lon) return res.status(400).json({ error: "Missing lat/lon parameters" });

    try {
        // 1. Fetch SoilGrids Data (0-5cm depth, mean values)
        // Properties: phh2o (pH), soc (Soil Organic Carbon), sand, silt, clay
        const soilUrl = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}&property=phh2o&property=soc&property=sand&property=silt&property=clay&depth=0-5cm&value=mean`;
        
        // 2. Fetch Open-Meteo Historical Data (Last 5 years for a quick snapshot average)
        const date = new Date();
        const endYear = date.getFullYear() - 1;
        const startYear = endYear - 5;
        const meteoUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=auto`;

        // Fetch concurrently, with a strict 15-second timeout so a dead API doesn't freeze the dashboard forever
        const [soilRes, meteoRes] = await Promise.all([
            fetch(soilUrl, { signal: AbortSignal.timeout(15000) }).catch(e => { console.warn("SoilGrids fetch failed:", e.message); return null; }),
            fetch(meteoUrl, { signal: AbortSignal.timeout(15000) }).catch(e => { console.warn("Open-Meteo fetch failed:", e.message); return null; })
        ]);

        // Safely parse JSON, handling potential API failures or empty responses
        let soilData = {};
        if (soilRes && soilRes.ok && soilRes.status !== 204) {
            const text = await soilRes.text();
            try { soilData = JSON.parse(text); } catch (e) {}
        }
        
        let meteoData = {};
        if (meteoRes && meteoRes.ok && meteoRes.status !== 204) {
            const text = await meteoRes.text();
            try { meteoData = JSON.parse(text); } catch (e) {}
        }

        // Extract and simplify soil data
        // Apply ISRIC-confirmed conversions deterministically here so Gemini receives
        // already-correct values — not raw scaled integers it must remember to divide.
        // Conversion table (ISRIC docs): phh2o ÷10 → pH, sand/silt/clay ÷10 → %, soc ÷10 → g/kg
        const SOILGRIDS_SCALE = { phh2o: 10, sand: 10, silt: 10, clay: 10, soc: 10 };
        const soilProps = {};
        if (soilData.properties && soilData.properties.layers) {
            soilData.properties.layers.forEach(layer => {
                const name = layer.name;
                const depthData = layer.depths && layer.depths[0]; // 0-5cm
                if (depthData && depthData.values && depthData.values.mean !== undefined) {
                    const raw = depthData.values.mean;
                    const divisor = SOILGRIDS_SCALE[name] || 1;
                    soilProps[name] = parseFloat((raw / divisor).toFixed(2));
                }
            });
        }

        // Extract and simplify weather data (calculate 5-year averages)
        let avgTemp = null;
        let avgYearlyPrecip = null;
        
        if (meteoData.daily && meteoData.daily.temperature_2m_mean) {
            const temps = meteoData.daily.temperature_2m_mean.filter(t => t !== null);
            avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null;
        }
        if (meteoData.daily && meteoData.daily.precipitation_sum) {
            const rain = meteoData.daily.precipitation_sum.filter(r => r !== null);
            const totalRain = rain.reduce((a, b) => a + b, 0);
            avgYearlyPrecip = rain.length ? (totalRain / 5).toFixed(0) : null; // total over 5 years / 5
        }

        const agronomyProfile = {
            coordinates: { lat: parseFloat(lat), lon: parseFloat(lon) },
            soil: soilProps,
            climate: {
                average_temp_celsius: avgTemp,
                average_yearly_rainfall_mm: avgYearlyPrecip
            }
        };

        res.json(agronomyProfile);

    } catch (err) {
        console.error("[AgronomyData] Error fetching data:", err);
        res.status(500).json({ error: "Failed to fetch agronomy data" });
    }
}

// ── Phase 3: Gemini Agronomy Intelligence Engine ─────────────────────────────
async function endpoint_geminiAgronomyIntelligence(req, res) {
    const key = req.headers['x-gemini-key'];
    if (!key) return res.status(400).json({ error: 'No Gemini API key provided.' });

    const { soilData, climateData, currentWeather, scannedCrop } = req.body;
    if (!soilData || !climateData) {
        return res.status(400).json({ error: 'Missing soil or climate data.' });
    }

    try {
        const ai = new GoogleGenerativeAI(key);
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `
You are an expert, highly conservative Indian agronomist. 
Analyze the following highly localized data for a farmer's plot:

1. Soil Data (0-5cm depth, already converted to human units — pH, %, g/kg): ${JSON.stringify(soilData)}
2. Historical Climate (5-year averages): ${JSON.stringify(climateData)}
3. Current Weather: ${JSON.stringify(currentWeather)}
4. Crop currently grown (if any): ${scannedCrop ? scannedCrop : 'Unknown / Not provided'}

Based on this data, provide a comprehensive, actionable agricultural plan.
CRITICAL RULE: DO NOT predict exact yield volumes or profits to avoid liability. Provide general market trends and scientific recommendations.

Respond ONLY with a valid JSON object matching this exact schema, no markdown formatting:
{
  "soil_health_summary": "1-2 sentence analysis of their soil",
  "climate_weather_risks": "1-2 sentences on risks based on historical climate + current weather",
  "recommended_crops": [
    { "name": "Crop Name", "reason": "Why it fits the soil/climate" }
  ],
  "not_recommended_crops": [
    { "name": "Crop Name", "reason": "Why it would fail here" }
  ],
  "active_crop_advice": "If they provided a scanned crop, give specific advice for it based on this soil/weather. If none, say 'No active crop scanned.'",
  "fertilizer_recommendations": "Specific composition advice (e.g., NPK ratios, organic matter) based on the soil data",
  "pesticide_insecticide_advice": "Common regional pests for the recommended/active crops and safe chemical/organic interventions",
  "market_trends": "Expected general market demand and price trends for the recommended crops in India"
}
`;

        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match) text = match[1].trim();
        
        const parsed = JSON.parse(text);
        res.json(parsed);
    } catch (err) {
        console.error("[Gemini Agronomy] Error:", err.message);
        res.status(500).json({ error: friendlyGeminiError(err) });
    }
}

// ── Phase 4: Live Mandi Prices (data.gov.in) ────────────────────────────────────
async function endpoint_getMandiPrices(req, res) {
    const { lat, lon } = req.params;
    if (!lat || !lon) return res.status(400).json({ error: "Missing lat/lon parameters" });

    try {
        let state    = req.query.state    || null;
        let district = req.query.district || null;

        // Only call OpenWeather geocode if the client didn't pass state (avoids duplicate call)
        if (!state) {
            const geoUrl = `http://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${process.env.OPENWEATHER_API_KEY}`;
            const geoRes = await fetch(geoUrl);
            const geoData = await geoRes.json();
            if (!Array.isArray(geoData) || geoData.length === 0) {
                return res.status(404).json({ error: "Could not determine state from coordinates." });
            }
            state    = geoData[0].state;
            district = geoData[0].name;
        }

        // 2. Fetch Mandi Prices from data.gov.in
        const govKey = process.env.GOV_DATA_API_KEY;
        if (!govKey) {
            return res.status(500).json({ error: "GOV_DATA_API_KEY is not configured on the server." });
        }

        // data.gov.in dataset for Current Daily Price of Various Commodities from Various Markets (Mandi)
        // Dataset ID: 9ef84268-d588-465a-a308-a864a43d0070
        const mandiUrl = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=${govKey}&format=json&filters[state]=${encodeURIComponent(state)}&limit=15`;
        
        const mandiRes  = await fetch(mandiUrl);
        const mandiData = await mandiRes.json();

        if (!mandiData || !mandiData.records) {
            return res.json({ state, district, records: [] });
        }

        res.json({ state, district, records: mandiData.records });

    } catch (err) {
        console.error("[Mandi API] Error:", err);
        res.status(500).json({ error: "Failed to fetch Mandi prices." });
    }
}

// ── Phase 5: Government Schemes & Subsidies Tracker ──────────────────────────
const GOVT_SCHEMES = [
    {
        id: 'pm-kisan',
        name: 'PM-KISAN',
        fullName: 'Pradhan Mantri Kisan Samman Nidhi',
        emoji: '💰',
        category: 'Income Support',
        benefit: '₹6,000/year (3 installments of ₹2,000)',
        cycle: 'April–July · August–November · December–March',
        eligibility: 'All landholding farmer families. Aadhaar + e-KYC mandatory.',
        exclusions: 'Income tax payers, Govt employees (above Group D), pensioners >₹10k/month, MPs/MLAs.',
        howToApply: 'Visit Farmers Corner on pmkisan.gov.in or nearest CSC. Registration is FREE.',
        applyUrl: 'https://pmkisan.gov.in',
        helpline: '155261',
        tags: ['all', 'income', 'national']
    },
    {
        id: 'pmfby',
        name: 'PMFBY',
        fullName: 'Pradhan Mantri Fasal Bima Yojana',
        emoji: '🛡️',
        category: 'Crop Insurance',
        benefit: 'Full coverage for crop loss due to natural calamities, pests, or disease. Premium as low as 1.5–2% for Kharif and 2% for Rabi.',
        cycle: 'Kharif (sow by July) · Rabi (sow by December) · Check state portal for exact deadlines.',
        eligibility: 'All farmers including sharecroppers and tenant farmers growing notified crops. Voluntary since 2021.',
        exclusions: 'Non-notified crops in your area. Check your district notification.',
        howToApply: 'Enroll at pmfby.gov.in, nearest bank branch, CSC, or via Crop Insurance App. Report crop loss within 72 hrs via KrishiRakshak helpline.',
        applyUrl: 'https://pmfby.gov.in',
        helpline: '14447',
        tags: ['all', 'insurance', 'kharif', 'rabi', 'national']
    },
    {
        id: 'kcc',
        name: 'Kisan Credit Card',
        fullName: 'Kisan Credit Card (KCC) Scheme',
        emoji: '💳',
        category: 'Agricultural Credit',
        benefit: 'Short-term crop loans up to ₹5 lakh at 7% p.a. Effective rate drops to 4% p.a. with prompt repayment. Collateral-free up to ₹2 lakh.',
        cycle: 'Valid for 5 years with annual review. Apply anytime.',
        eligibility: 'Owner-cultivators, tenant farmers, oral lessees, sharecroppers. SHGs/JLGs also eligible. Age 18–75 years.',
        exclusions: 'No land records or Aadhaar make application difficult.',
        howToApply: 'Apply at nearest bank branch (SBI, PNB, Cooperative Bank etc.), JanSamarth portal, or CSC. Digital KCC available via some bank apps.',
        applyUrl: 'https://jansamarth.in',
        helpline: '1800-180-1551',
        tags: ['all', 'credit', 'loan', 'national']
    },
    {
        id: 'pmksy',
        name: 'PMKSY (PDMC)',
        fullName: 'PM Krishi Sinchayee Yojana – Per Drop More Crop',
        emoji: '💧',
        category: 'Irrigation Subsidy',
        benefit: '55% subsidy on drip/sprinkler systems for Small & Marginal Farmers. 45% for others. State top-ups additional.',
        cycle: 'Rolling applications via state agriculture/horticulture department.',
        eligibility: 'All farmers owning land who wish to install micro-irrigation. SHGs, cooperatives, Water User Associations (WUAs) also eligible.',
        exclusions: 'Rented/leased land without ownership proof typically ineligible.',
        howToApply: 'Visit nearest Krishi Vigyan Kendra (KVK) or Block/District Agriculture Office. Apply online via state agriculture portal.',
        applyUrl: 'https://pmksy.gov.in',
        helpline: '1800-180-1551',
        tags: ['all', 'irrigation', 'subsidy', 'national']
    },
    {
        id: 'enam',
        name: 'eNAM',
        fullName: 'National Agriculture Market (eNAM)',
        emoji: '🏪',
        category: 'Market Access',
        benefit: 'Sell produce online to buyers across India via transparent bidding. Free quality assaying (testing) at mandis. Direct bank payment.',
        cycle: 'Ongoing. Register once and sell anytime.',
        eligibility: 'All farmers growing any agricultural commodity. Registration is completely FREE.',
        exclusions: 'Available only in districts/states with eNAM-integrated mandis.',
        howToApply: 'Register at enam.gov.in or via the eNAM mobile app. Choose your nearest mandi and complete KYC with Aadhaar and bank details.',
        applyUrl: 'https://www.enam.gov.in',
        helpline: '1800-270-0224',
        tags: ['all', 'market', 'selling', 'national']
    },
    {
        id: 'shc',
        name: 'Soil Health Card',
        fullName: 'Soil Health Card (SHC) Scheme',
        emoji: '🌱',
        category: 'Soil Testing',
        benefit: 'Free soil testing for 12 parameters (pH, N, P, K, micronutrients). Crop-specific fertilizer recommendations. Reduces input costs.',
        cycle: 'Soil samples collected every 3 years. Request anytime at local office.',
        eligibility: 'All farmers across India. No restrictions.',
        exclusions: 'None.',
        howToApply: 'Visit soilhealth.dac.gov.in to find nearest soil testing lab. Request sample collection through local agriculture department.',
        applyUrl: 'https://soilhealth.dac.gov.in',
        helpline: '1800-180-1551',
        tags: ['all', 'soil', 'free', 'national']
    },
    {
        id: 'pm-kusum',
        name: 'PM-KUSUM',
        fullName: 'Pradhan Mantri Kisan Urja Suraksha evam Utthaan Mahabhiyan',
        emoji: '☀️',
        category: 'Solar Energy',
        benefit: '60% subsidy (30% central + 30% state) on solar pumps for irrigation. Farmers can also sell surplus solar energy to DISCOM.',
        cycle: 'Applications via state nodal agencies. Check your state energy department.',
        eligibility: 'All farmers with agricultural land and a need for irrigation. Individual and SHG applications allowed.',
        exclusions: 'Varies by state. Some states have waiting lists due to high demand.',
        howToApply: 'Apply via your State Nodal Agency (e.g., MNRE-designated body). Visit mnre.gov.in for state-wise contacts.',
        applyUrl: 'https://mnre.gov.in/pm-kusum',
        helpline: '1800-180-3333',
        tags: ['all', 'solar', 'irrigation', 'subsidy', 'national']
    }
];

async function endpoint_getSchemes(req, res) {
    // Returns the full static scheme list. No external API needed.
    res.json({ schemes: GOVT_SCHEMES });
}

async function endpoint_checkSchemeEligibility(req, res) {
    const key = req.headers['x-gemini-key'];
    if (!key) return res.status(400).json({ error: 'No Gemini API key provided. Set your key in the dashboard to use AI eligibility check.' });

    const { state, crops, landOwnership, isLoanee } = req.body;
    if (!state) return res.status(400).json({ error: 'State is required for eligibility check.' });

    try {
        const ai = new GoogleGenerativeAI(key);
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `You are an expert on Indian government agricultural schemes. A farmer has the following profile:
- State: ${state}
- Crops grown: ${crops || 'Unknown'}
- Land ownership: ${landOwnership || 'Owner'}
- Has crop loan / KCC: ${isLoanee ? 'Yes' : 'No'}

Available schemes: PM-KISAN (income support), PMFBY (crop insurance), Kisan Credit Card (credit), PMKSY-PDMC (irrigation subsidy), eNAM (market access), Soil Health Card (free soil test), PM-KUSUM (solar pump subsidy).

For each scheme, give a SHORT, practical recommendation. Be specific to their state and crop situation.
Respond ONLY as a valid JSON array (no markdown). Each item must match this schema exactly:
{
  "schemeId": "pm-kisan",
  "priority": "High" | "Medium" | "Low",
  "verdict": "one sentence on if they should apply",
  "tip": "one actionable state-specific tip"
}
Return all 7 schemes in the array.`;

        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match) text = match[1].trim();
        const eligibility = JSON.parse(text);
        res.json({ eligibility });
    } catch (err) {
        console.error('[Schemes] Eligibility check failed:', err.message);
        res.status(500).json({ error: friendlyGeminiError(err) });
    }
}

module.exports = {
    endpoint_getChannelInfo,
    endpoint_youtubePlaylistImg,
    endpoint_geminiYoutubeSearch,
    endpoint_openWeatherAPI,
    endpoint_chatbot,
    endpoint_getAgronomyData,
    endpoint_geminiAgronomyIntelligence,
    endpoint_getMandiPrices,
    endpoint_getSchemes,
    endpoint_checkSchemeEligibility
};