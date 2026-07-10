# 🌾 PRAGATI PATH — AI-Powered Agricultural Education Platform

PRAGATI PATH is a full-stack web platform designed to assist Indian farmers by leveraging **AI technology**, **multilingual support**, and **image recognition**. It provides crop suggestions, disease diagnosis, and educational content to improve agricultural outcomes.

## 💡 Key Features

- 🤖 **AI Chatbot** using **Google Gemini 2.5 Flash** for farming-related query resolution in local languages
- 🌱 **Crop Recommendation System** based on user location and weather data
- 🦠 **Plant Disease Detection** (Dual Mode)
  - **Primary:** Gemini Vision (Analyzes any crop, provides treatment/prevention)
  - **Fallback:** Offline ViT-tiny running natively in-browser via **LiteRT WebGPU** (Fast, private, works offline)
- 📺 **YouTube Learning Module** — fetches top relevant videos and allows tracking course progress
- 🔐 Secure login and protected routes using **Clerk** authentication
- 🔑 **BYOK Architecture (Bring Your Own Key)** — Gemini API keys are securely provided by users and stored only in their local browser storage, ensuring free hosting and no central API cost.

## 🌐 Live Preview

🔗 [https://pragatipath.onrender.com/](https://pragatipath.onrender.com/)

## 🛠 Tech Stack

- **Frontend:** HTML, Vanilla CSS, JavaScript
- **Backend:** Bun, Express.js
- **Database:** MongoDB (via Mongoose)
- **AI Integration:** Google Gemini (Generative AI), LiteRT.js (WebGPU WASM)
- **Auth:** Clerk

## 🏗 Architecture

```mermaid
flowchart TB
    subgraph Client ["Frontend Browser"]
        UI["Dashboard UI"]
        Storage["LocalStorage: BYOK Key"]
        OfflineAI["Offline Fallback AI: LiteRT WebGPU"]
    end

    subgraph Backend ["Bun Server"]
        API["Express API Routes"]
        AuthGuard["Clerk Middleware"]
        DBHandler["Mongoose Handlers"]
    end

    subgraph External ["External Services"]
        ClerkAuth["Clerk Identity"]
        Gemini["Primary AI: Google Gemini 2.5"]
        MongoDB[("MongoDB Atlas")]
        WeatherAPI["OpenWeather"]
        YouTubeAPI["YouTube Data V3"]
    end

    UI -->|"JSON over HTTP"| API
    API -->|"JSON Response"| UI
    
    UI -->|"Login / Tokens"| ClerkAuth
    UI -->|"Plant Disease (No Key)"| OfflineAI

    API --> AuthGuard
    AuthGuard -->|"Verify Session"| ClerkAuth
    
    API --> DBHandler
    DBHandler --> MongoDB
    MongoDB --> DBHandler

    API -->|"Plant Disease / Chat / Tips (Requires Key)"| Gemini
    API --> WeatherAPI
    API --> YouTubeAPI
```

## 📦 Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (Runtime and package manager)

### Installation

```bash
git clone https://github.com/vikashgupta16/PragatiPath.git
cd PragatiPath
bun install
```

### Environment Variables

Create a `.env` file in the root directory:
```env
CLERK_SECRET_KEY=your_secret_key
CLERK_PUBLISHABLE_KEY=your_publishable_key
CLERK_SIGN_IN_URL=/public/Accounts/signin.html
CLERK_SIGN_UP_URL=/public/Accounts/signup.html
MONGO_URI=your_mongodb_connection_string
YOUTUBE_API_KEY=your_youtube_api_key
OPENWEATHER_API_KEY=your_openweather_api_key
SESSION_SECRET=your_secure_random_string
```

### Run the App

```bash
bun run dev
```

The app will be running at `http://localhost:8080`.

## 📖 Documentation
- [How the Offline Plant AI Works](docs/plant-ai-how-it-works.md)

## 📂 Project Structure

```
/client               # Frontend (Public Landing, Private Dashboard)
/server               # Express API routes, Auth middleware, Database schemas
/docs                 # Technical documentation
/scripts              # AI Model conversion utilities
```

## 👨‍💻 Authors

- [**Rouvik Maji**](https://github.com/Rouvik) – *Backend Developer*
- [**Archis**](https://github.com/Dealer-09) – *Backend/Frontend Developer*
- [**Vikash Gupta**](https://github.com/vikashgupta16) – *Frontend Developer*
- [**Rajbeer Saha**](https://github.com/pixelpioneer404) – *Frontend Developer*

## 📄 License

MIT © 2025 Archisman Pal
