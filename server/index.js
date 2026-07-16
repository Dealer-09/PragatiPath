const { connectDB, Users, Courses, middleware_userAuth, endpoint_userInfo, endpoint_addCourse, endpoint_removeCourse, endpoint_updateCourseProgress, endpoint_getCourseList, endpoint_getCourseByName, endpoint_getCourseById } = require('./DBHandler.js');
const { endpoint_getChannelInfo, endpoint_youtubePlaylistImg, endpoint_geminiYoutubeSearch, endpoint_openWeatherAPI, endpoint_chatbot } = require('./aiSearch.js');

// express
const express = require('express');
const app     = express();

// environment variables
// Bun natively loads .env files, no need for the dotenv package
process.env.PORT = process.env.PORT || '8080';

// Gemini (top-level require — not inside hot request handlers)
const { GoogleGenerativeAI } = require('@google/generative-ai');
const makeAI = (key) => new GoogleGenerativeAI(key);

// clerk
const clerk = require('@clerk/express');
app.use(clerk.clerkMiddleware());

// database connection — awaited so server only starts after DB is ready
connectDB(process.env.MONGO_URI);

// Instantiations removed as classes were flattened

// WASM headers — scoped to WASM asset paths only (global COEP breaks Clerk auth)
app.use(['/public/assets/litert-wasm', '/public/assets/plant-disease-mobilenet'], (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy',   'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});

// public static — serve .wasm with correct MIME type
app.use('/public', express.static('client/public', {
    setHeaders(res, filePath) {
        if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
    }
}));

app.get('/', (req, res) => res.redirect('/public/LandingPage/index.html'));

// private static (auth-gated)
app.use('/private',
    clerk.requireAuth({ signInUrl: process.env.CLERK_SIGN_IN_URL, signUpUrl: process.env.CLERK_SIGN_UP_URL }),
    middleware_userAuth,
    express.static('client/private')
);

app.get('/private/logout', clerk.requireAuth(), async (req, res) => {
    const sessionId = clerk.getAuth(req).sessionId;
    if (!sessionId) return res.json({ error: "No session ID found" });
    try {
        await clerk.clerkClient.sessions.revokeSession(sessionId);
        res.redirect('/public/Accounts/signin.html');
    } catch (error) {
        res.json({ error: "Failed to revoke session, please refresh the page" });
    }
});

// ── User API (all require auth) ───────────────────────────────────────────────
app.get('/api/userinfo',       clerk.requireAuth(), endpoint_userInfo);
app.post('/api/updcourseprog', clerk.requireAuth(), express.json(), endpoint_updateCourseProgress);
app.post('/api/addcourse',     clerk.requireAuth(), express.json(), endpoint_addCourse);
app.post('/api/removecourse',  clerk.requireAuth(), express.json(), endpoint_removeCourse);

// ── Course API (all require auth) ─────────────────────────────────────────────
app.get('/api/getcourses',                clerk.requireAuth(), endpoint_getCourseList);
app.get('/api/getcourse/name/:courseName', clerk.requireAuth(), endpoint_getCourseByName);
app.get('/api/getcourse/id/:courseId',     clerk.requireAuth(), endpoint_getCourseById);

// ── Gemini / AI API (all require auth) ───────────────────────────────────────
app.get('/api/gemini/youtube',  clerk.requireAuth(), endpoint_geminiYoutubeSearch);
app.post('/api/gemini/chat',    clerk.requireAuth(), express.json(), endpoint_chatbot);

app.post('/api/gemini/analyze-plant', clerk.requireAuth(), express.json({ limit: '10mb' }), async (req, res) => {
    const key = req.headers['x-gemini-key'];
    if (!key) return res.status(400).json({ error: 'No Gemini API key provided.' });

    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'No image provided.' });

    try {
        const ai    = makeAI(key);
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent([
            { inlineData: { data: imageBase64, mimeType } },
            `You are an expert agricultural plant pathologist. Analyze this leaf image.
Respond ONLY with a valid JSON object, no markdown, no explanation. Use this exact schema:
{
  "crop": "common crop name or Unknown",
  "disease": "disease name or Healthy or Unknown",
  "severity": "None|Low|Medium|High",
  "confidence": "Low|Medium|High",
  "isHealthy": true or false,
  "treatment": "1-2 sentence actionable treatment advice",
  "prevention": "1 sentence prevention tip"
}
If the image is not a plant leaf, set crop and disease to "Not a plant leaf" and confidence to "Low".`
        ]);
        let text = result.response.text().trim()
            .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        const parsed = JSON.parse(text);
        res.json(parsed);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/gemini/farming-tips', clerk.requireAuth(), express.json(), async (req, res) => {
    const key = req.headers['x-gemini-key'];
    if (!key) return res.status(400).json({ error: 'No Gemini API key provided.' });

    const { temp, humidity, weather, location } = req.body;
    // Sanitise location to prevent prompt injection
    const safeLocation = String(location || 'India').slice(0, 100).replace(/[`"\\]/g, '');

    try {
        const ai    = makeAI(key);
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(
            `You are an expert agricultural advisor for Indian farmers. Based on this weather:\n` +
            `Location: ${safeLocation}, Temp: ${Number(temp)}°C, Humidity: ${Number(humidity)}%, Condition: ${weather}\n` +
            `Give exactly 3 concise practical farming tips. Respond ONLY as a JSON array of 3 strings. No markdown.\n` +
            `Example: ["Tip one.", "Tip two.", "Tip three."]`
        );
        let text = result.response.text().trim()
            .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        const tips = JSON.parse(text);
        res.json({ tips });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Weather / YouTube (require auth to protect API keys) ─────────────────────
app.get('/api/openweather/:lat/:lon',        clerk.requireAuth(), endpoint_openWeatherAPI);
app.get('/api/youtubethumb/:playlist',        clerk.requireAuth(), endpoint_youtubePlaylistImg);
app.get('/api/youtubechannel/:playlistId',    clerk.requireAuth(), endpoint_getChannelInfo);

// ── Global Error Handler (Express 5 fallback) ────────────────────────────────
// If any async route throws an unhandled error, Express 5 catches it here.
// This ensures we ALWAYS return JSON to the client, preventing SyntaxErrors
// caused by default HTML error pages.
app.use((err, req, res, next) => {
    console.error('[Express Error]', err);
    res.status(err.status || 500).json({ 
        error: err.message || 'Internal Server Error' 
    });
});

app.listen(+process.env.PORT, () => {
    console.log(`Server is running on port http://localhost:${process.env.PORT}`);
});