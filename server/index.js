// base modules -------------------
const crypto = require('crypto');
const session = require('cookie-session');

// custom modules ----------------
const { connectDB, UserDB, CourseDB } = require('./DBHandler.js');
const { endpoint_getChannelInfo, endpoint_youtubePlaylistImg, endpoint_geminiYoutubeSearch, endpoint_openWeatherAPI, GeminiChatBot } = require('./aiSearch.js');

// express ----------------------------
const express = require('express');
const app = express();

// environment variables ----------------
const dotenv = require('dotenv');
dotenv.config();
process.env.PORT = process.env.PORT || '8080';

// session handler ----------------
app.use(session({
    secret: process.env.SESSION_SECRET || 'pragatipath-dev-secret',
    maxAge: 24 * 60 * 60 * 1000     // 24 hour expiry
}));

// clerk ------------------------------
const clerk = require('@clerk/express');
app.use(clerk.clerkMiddleware());

// database connection --------------
connectDB(process.env.MONGO_URI);

const userDBHandler = new UserDB();
const courseDBHandler = new CourseDB();

// public server -------------------
app.use('/public', express.static('client/public'));

app.get('/', (req, res) => {
    res.redirect('/public/LandingPage/index.html');
});

// private server ------------------
app.use('/private', clerk.requireAuth({ signInUrl: process.env.CLERK_SIGN_IN_URL, signUpUrl: process.env.CLERK_SIGN_UP_URL }),
    userDBHandler.middleware_userAuth.bind(userDBHandler),
    express.static('client/private'));

app.get('/private/logout', async (req, res) => {
    const sessionId = clerk.getAuth(req).sessionId;
    if (!sessionId) {
        res.json({ error: "No session ID found" });
        return;
    }

    try {
        await clerk.clerkClient.sessions.revokeSession(sessionId);
        res.redirect('/public/Accounts/signin.html');
    } catch (error) {
        res.json({ error: "Failed to revoke session, please refresh the page" });
    }
});

app.get('/api/userinfo', clerk.requireAuth(), userDBHandler.endpoint_userInfo.bind(userDBHandler));
app.post('/api/updcourseprog', clerk.requireAuth(), express.json(), userDBHandler.endpoint_updateCourseProgress.bind(userDBHandler));

app.get('/api/getcourses', clerk.requireAuth(), courseDBHandler.endpoint_getCourseList.bind(courseDBHandler));
app.get('/api/getcourse/name/:courseName', clerk.requireAuth(), courseDBHandler.endpoint_getCourseByName.bind(courseDBHandler));
app.get('/api/getcourse/id/:courseId', clerk.requireAuth(), courseDBHandler.endpoint_getCourseById.bind(courseDBHandler));

app.post('/api/addcourse', clerk.requireAuth(), express.json(), userDBHandler.endpoint_addCourse.bind(userDBHandler));
app.post('/api/removecourse', clerk.requireAuth(), express.json(), userDBHandler.endpoint_removeCourse.bind(userDBHandler));

app.get('/api/gemini/youtube', endpoint_geminiYoutubeSearch);
app.post('/api/gemini/chat', express.json(), GeminiChatBot.endpoint_chatbot);
app.post('/api/gemini/analyze-plant', express.json(), async (req, res) => {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const key = req.headers['x-gemini-key'];
    if (!key) return res.status(400).json({ error: 'No Gemini API key provided.' });

    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'No image provided.' });

    try {
        const ai = new GoogleGenerativeAI(key);
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent([
            {
                inlineData: { data: imageBase64, mimeType }
            },
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

        let text = result.response.text().trim();
        // Strip markdown code fences if model wraps in them
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        const parsed = JSON.parse(text);
        res.json(parsed);
    } catch (err) {
        // If JSON parse failed, return raw text for debugging
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/openweather/:lat/:lon', endpoint_openWeatherAPI);

app.get('/api/youtubethumb/:playlist', endpoint_youtubePlaylistImg);

app.get('/api/youtubechannel/:playlistId', endpoint_getChannelInfo);

app.listen(+process.env.PORT, () => {
    console.log(`Server is running on port http://localhost:${process.env.PORT}`);
});