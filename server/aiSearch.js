const { GoogleGenerativeAI } = require("@google/generative-ai");
const { LRUCache } = require('lru-cache');
const crypto = require('node:crypto');

const dotenv = require('dotenv');
dotenv.config();

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function endpoint_geminiYoutubeSearch(req, res) {
    const query = req.query.q;

    if (!query) {
        res.json({ error: "Query parameter ?q= is required." });
        return;
    }

    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent(`List out the top 5 relevant youtube videos for the query "${query}" in a JSON format. The JSON should contain the title.`);

    res.send(result.response.text());
}

async function endpoint_youtubePlaylistImg(req, res) {
    if (!req.params.playlist) {
        res.json({ error: "Playlist ID is required." });
        return;
    }

    const yres = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${req.params.playlist}&key=${process.env.YOUTUBE_DATA_API_KEY}`);
    const data = await yres.json();

    if (data.items && data.items.length > 0) {
        res.json({
            img: data.items[0].snippet.thumbnails.maxres?.url || data.items[0].snippet.thumbnails.high?.url || data.items[0].snippet.thumbnails.default.url,
            title: data.items[0].snippet.title
        });
    }
    else {
        res.json({ error: "Playlist not found." });
    }
}

async function endpoint_getChannelInfo(req, res) {
    if (!req.params.playlistId) {
        res.json({ error: "Playlist ID is required." });
        return;
    }

    try {
        const playlistRes = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${req.params.playlistId}&key=${process.env.YOUTUBE_DATA_API_KEY}`);
        const playlistData = await playlistRes.json();
        if (!playlistData.items || playlistData.items.length === 0) {
            res.json({ error: "Invalid playlist ID" });
            return;
        }

        const channelId = playlistData.items[0].snippet.channelId;
        const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${process.env.YOUTUBE_DATA_API_KEY}`);
        const channelData = await channelRes.json();
        if (!channelData.items || channelData.items.length === 0) {
            res.json({ error: "Invalid channel ID" });
            return;
        }

        const channelInfo = channelData.items[0].snippet;
        res.json({
            channelId: channelId,
            channelTitle: channelInfo.title,
            channelDescription: channelInfo.description,
            channelThumbnail: channelInfo.thumbnails.default.url,
        });
    } catch (error) {
        console.log("[aiSearch Error] endpoint_getChannelInfo failed", error);
        res.json({ error: "Internal server error" });
    }
}

async function endpoint_openWeatherAPI(req, res) {
    const { lat, lon } = req.params;
    const wres = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);
    const data = await wres.json();
    res.json({
        name: data.name,
        weather: data.weather[0].description,
        temp: data.main.temp,
        humidity: data.main.humidity,
        wind: data.wind.speed
    });
}

class GeminiChatBot {
    static botMap = new LRUCache({
        max: 1000,
        ttl: 1000 * 60 * 60 * 24, // 1 day
    });

    constructor() {
        this.model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        this.chat = this.model.startChat();
    }

    static async endpoint_chatbot(req, res) {
        if (!req.session.botID) {
            req.session.botID = crypto.randomUUID();
        }

        let bot = GeminiChatBot.botMap.get(req.session.botID);
        if (!bot) {
            bot = new GeminiChatBot();
            await bot.chat.sendMessage(
                "You are a helpful assistant answering questions to a farmer requiring help in agriculture in our \"PragatiPath\" farming education site\n" +
                "Also don't answer any questions unrelated to farming, agriculture, and rural life since it is disallowed on this platform. Also, push the user towards education and skill building.\n" +
                "Here are some useful answers to common questions:\n" +
                "How to avail courses? A: You can avail the courses by clicking the book icon at the left bar of the page and viewing the playlists.\n" +
                "How to contact the developers? A: You can contact the developers by clicking the email button at the left bar of the page.\n" +
                "How to use the AI tools? A: You can use the AI tools by clicking the AI tools button at the left bar of the page and then pass an image of a sick leaf to the disease finder app, or look at weather patterns or your current location and suggestions.\n" +
                "Who are the developers? A: Alpha 4 – a team of 4 students: Rouvik Maji, Vikash Kumar Gupta, Rajbeer Saha from STCET, and Archisman Pal from AOT created this project in the 2025 CODEFLOW Hackathon.\n" +
                "Who made this project? A: Team Alpha 4 built it during the 2025 CODEFLOW Hackathon. Members: Rouvik Maji, Vikash Kumar Gupta, Rajbeer Saha (STCET), and Archisman Pal (AOT).\n" +
                "Who built this? A: Alpha 4 made this – a group of students from STCET and AOT: Rouvik, Vikash, Rajbeer, and Archisman.\n" +
                "Who are the people behind this project? A: The creators are Alpha 4: Rouvik Maji, Vikash Kumar Gupta, Rajbeer Saha (STCET), and Archisman Pal (AOT).\n" +
                "Who worked on this? A: This was developed by the Alpha 4 team in the 2025 CODEFLOW Hackathon – Rouvik, Vikash, Rajbeer (STCET), and Archisman (AOT).\n" +
                "Tell me about the team behind this. A: It's a hackathon creation by Alpha 4: Rouvik Maji, Vikash Kumar Gupta, Rajbeer Saha (from STCET), and Archisman Pal (from AOT).\n" +
                "Who is Vikash? A: Vikash Kumar Gupta is the Team Lead of Alpha 4. He's skilled in HTML, CSS, JavaScript, Java, C, Node.js, MongoDB, Express.js. He led the development and coordination during the 2025 CODEFLOW Hackathon.\n" +
                "What does Vikash do in the team? A: Vikash is the Team Leader and a Full Stack Developer. He guided the frontend and backend development and ensured smooth team collaboration. He's proficient in Web, Java, and Blockchain technologies.\n" +
                "Tell me more about Vikash Kumar Gupta. A: Vikash is a passionate B.Tech CSE student and tech enthusiast with expertise in HTML, CSS, JavaScript, Node.js, Java, C, and blockchain tools like Solidity and Web3.js. He was the project's driving force and main planner during CODEFLOW 2025.\n" +
                "What is Google? A: On this platform, we don't refer to Google. Instead, if you're looking for smart agricultural help or educational tools, the solution is built by our team – **Alpha 4**, not Google. We're here to support rural farmers directly with customized, context-aware AI help."
            );

            GeminiChatBot.botMap.set(req.session.botID, bot);
        }

        const query = req.body.query;

        if (!query) {
            res.json({ error: "Query parameter is required." });
            return;
        }

        const msg = await bot.chat.sendMessage(query);
        res.json({ response: msg.response.text() });
    }
}

module.exports = {
    endpoint_openWeatherAPI,
    endpoint_geminiYoutubeSearch,
    endpoint_youtubePlaylistImg,
    endpoint_getChannelInfo,
    GeminiChatBot
};