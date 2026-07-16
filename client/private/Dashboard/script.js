const logoutBtn = document.querySelector(".logout-btn");
const logoutIcon = document.querySelector("#logout-icon");

let userData = null;

// ── BYOK: Gemini API Key Management ──────────────────────────────────────────
function getGeminiKey() {
    return localStorage.getItem('gemini_api_key') || '';
}

function geminiHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-gemini-key': getGeminiKey()
    };
}

function updateKeyStatusDot() {
    const dot = document.getElementById('key-status-dot');
    if (!dot) return;
    if (getGeminiKey()) {
        dot.classList.add('active');
        dot.title = 'Gemini key is set';
    } else {
        dot.classList.remove('active');
        dot.title = 'No Gemini key — click to set';
    }
}

function saveGeminiKey() {
    const val = document.getElementById('key-input').value.trim();
    if (!val) {
        document.getElementById('key-modal-status').style.color = '#c00';
        document.getElementById('key-modal-status').textContent = 'Key cannot be empty.';
        return;
    }
    localStorage.setItem('gemini_api_key', val);
    updateKeyStatusDot();
    document.getElementById('key-modal-status').style.color = '#4CAF50';
    document.getElementById('key-modal-status').textContent = '✅ Key saved!';
    setTimeout(() => {
        document.getElementById('key-modal').close();
        document.getElementById('key-modal-status').textContent = '';
    }, 900);
}

function clearGeminiKey() {
    localStorage.removeItem('gemini_api_key');
    document.getElementById('key-input').value = '';
    document.getElementById('key-modal-status').style.color = '#666';
    document.getElementById('key-modal-status').textContent = 'Key cleared.';
    updateKeyStatusDot();
}
// ─────────────────────────────────────────────────────────────────────────────


logoutBtn.addEventListener('mouseenter', () => {
    logoutIcon.setAttribute('fill', 'red');
});

logoutBtn.addEventListener('mouseleave', () => {
    logoutIcon.setAttribute('fill', '#fefae0');
});

const taskBox = document.getElementById("task-box");
const calendar = document.getElementById("calendar");
const monthLabel = document.getElementById("month-label");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const resetBtn = document.getElementById("reset-progress");
const languageInfo = document.getElementById("language-info");
const notesList = document.getElementById('notes-list');
const newNoteInput = document.getElementById('new-note');
const addNoteBtn = document.getElementById('add-note');

const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();

const learningSchedule = {
    1: "📘 Organic Farming Basics",
    2: "💻 Using Smartphones for Agriculture",
    3: "🌱 Seed Selection Techniques",
    4: "🌐 Internet Basics for Farmers",
    5: "📊 Entrepreneurship 101",
    6: "📷 Pest Detection via Mobile",
    7: "🏪 Setting Up Local Farm Stall",
    8: "🛰️ Weather Apps for Farming",
    9: "💼 Govt Schemes & Online Applications",
    10: "🚀 Leadership Training",
    15: "📦 Packaging and Branding",
    20: "🧪 Soil Testing Techniques",
    30: "🎓 Final Quiz & Practice"
};

function getStorageKey(month, year) {
    return `completed-${month + 1}-${year}`;
}

function getCompletedDays() {
    const key = getStorageKey(currentMonth, currentYear);
    return JSON.parse(localStorage.getItem(key)) || [];
}

function saveCompletedDays(days) {
    const key = getStorageKey(currentMonth, currentYear);
    localStorage.setItem(key, JSON.stringify(days));
}

function updateMonthLabel() {
    monthLabel.textContent = `${months[currentMonth]} ${currentYear}`;
}

function updateProgress(totalDays, completedDays) {
    const percent = Math.round((completedDays.length / totalDays) * 100);
    progressBar.value = percent;
    progressText.textContent = `${percent}%`;
}

function generateCalendar() {
    const completedDays = getCompletedDays();
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    let tableHTML = "<tr>";
    for (let i = 0; i < firstDay; i++) {
        tableHTML += "<td></td>";
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const isCompleted = completedDays.includes(day);
        const className = isCompleted ? "calendar-day completed" : "calendar-day";
        tableHTML += `<td class="${className}" data-day="${day}">${day}</td>`;
        if ((day + firstDay) % 7 === 0) tableHTML += "</tr><tr>";
    }

    tableHTML += "</tr>";
    calendar.innerHTML = tableHTML;
    updateMonthLabel();
    updateProgress(daysInMonth, completedDays);

    document.querySelectorAll(".calendar-day").forEach(dayCell => {
        dayCell.addEventListener("click", () => {
            const day = parseInt(dayCell.getAttribute("data-day"));
            const task = learningSchedule[day] || "📝 No specific task. Use this day to review!";
            const isCompleted = completedDays.includes(day);

            taskBox.innerHTML = `
                🎓 <strong>Learning for ${day} ${months[currentMonth]}:</strong><br>${task}
                <br><br>
                <button id="done-btn">${isCompleted ? "✅ Completed" : "✅ Mark as Done"}</button>
            `;

            document.getElementById("done-btn").onclick = () => {
                if (!completedDays.includes(day)) {
                    completedDays.push(day);
                    saveCompletedDays(completedDays);
                    generateCalendar();
                    taskBox.innerHTML = `🎉 Great job! You've completed ${day} ${months[currentMonth]}.`;
                }
            };
        });
    });
}

function detectLanguage() {
    const lang = navigator.language || navigator.userLanguage;
    let message = "";

    if (lang.startsWith("hi")) message = "🌍 आपकी भाषा पहचानी गई: हिंदी";
    else if (lang.startsWith("bn")) message = "🌍 আপনার ভাষা: বাংলা";
    else if (lang.startsWith("ta")) message = "🌍 உங்கள் மொழி: தமிழ்";
    else message = `🌍 Detected Language: ${lang}`;

    languageInfo.textContent = message;
}

function loadNotes() {
    const savedNotes = JSON.parse(localStorage.getItem('quickNotes')) || [];
    renderNotes(savedNotes);
}

function saveNotes(notes) {
    localStorage.setItem('quickNotes', JSON.stringify(notes));
}

function renderNotes(notes) {
    notesList.innerHTML = '';
    notes.forEach((note, index) => {
        const noteElement = document.createElement('div');
        noteElement.className = 'note-item';
        // Use textContent to prevent XSS from user-supplied note content
        const span = document.createElement('span');
        span.className = 'note-text';
        span.textContent = note;
        const btn = document.createElement('button');
        btn.className = 'delete-note';
        btn.textContent = '×';
        btn.dataset.index = index;
        btn.addEventListener('click', () => deleteNote(index));
        noteElement.appendChild(span);
        noteElement.appendChild(btn);
        notesList.appendChild(noteElement);
    });
}

function addNote() {
    const noteText = newNoteInput.value.trim();
    if (noteText) {
        const savedNotes = JSON.parse(localStorage.getItem('quickNotes')) || [];
        savedNotes.push(noteText);
        saveNotes(savedNotes);
        renderNotes(savedNotes);
        newNoteInput.value = '';
    }
}

function deleteNote(index) {
    const savedNotes = JSON.parse(localStorage.getItem('quickNotes')) || [];
    savedNotes.splice(index, 1);
    saveNotes(savedNotes);
    renderNotes(savedNotes);
}

function setupChat() {
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const chatBox = document.getElementById('chat-box');

    // Sanitise helper — use DOMPurify if available, else strip tags as fallback
    function safeMarkdown(text) {
        const html = marked.parse(text);
        return (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(html) : html;
    }

    function addMessage(message, isUser) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add(isUser ? 'user-message' : 'bot-message');
        // User messages shown as plain text; bot responses sanitised markdown
        if (isUser) {
            messageDiv.textContent = message;
        } else {
            messageDiv.innerHTML = safeMarkdown(message);
        }
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        return messageDiv;
    }

    async function processMessage() {
        const message = chatInput.value.trim();
        if (message === '') return;

        addMessage(message, true);
        chatInput.value = '';
        const msgDiv = addMessage('...', false);

        try {
            const res  = await fetch('/api/gemini/chat', {
                method: 'POST',
                headers: geminiHeaders(),
                body: JSON.stringify({ query: message })
            });
            const data = await res.json();
            if (data.error) {
                const errMsg = data.error.includes('No Gemini API key')
                    ? 'No API key set. Click 🔑 API Key in the header to add yours.'
                    : 'Error: ' + data.error;
                msgDiv.textContent = errMsg;
            } else {
                msgDiv.innerHTML = safeMarkdown(data.response);
            }
        } catch (err) {
            msgDiv.textContent = 'Network error — check your connection and try again.';
        }
    }

    sendButton.addEventListener('click', processMessage);
    chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            processMessage();
        }
    });
}

// @author Rouvik Maji
async function unenrollCourse(button) {
    try {
        const res = await fetch('/api/removecourse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseName: button.dataset.coursename })
        });
        const ct = res.headers.get('content-type');
        if (!ct || !ct.includes('application/json')) {
            // Session expired — redirect rather than crash
            window.location.href = window.location.origin + '/public/Accounts/signin.html';
            return;
        }
        const data = await res.json();
        if (data.error) console.error('Error unenrolling course:', data.error);
    } catch (err) {
        console.warn('unenrollCourse failed:', err);
    }
    location.reload();
}

// @author Rouvik Maji
async function courseShortHandler(button) {
    localStorage.setItem('courseName', button.dataset.coursename);
    localStorage.setItem('coursePlaylist', button.dataset.courseplaylist);
    localStorage.setItem('courseId', button.dataset.courseid);

    window.location.href = window.location.origin + '/private/Player/player.html';
}

// Initialize everything when the page loads
window.addEventListener('load', async () => {
    try {
        const req = await fetch('/api/userinfo');
        
        const contentType = req.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            console.warn("Session expired or invalid response. Redirecting to sign-in.");
            window.location.href = window.location.origin + '/public/Accounts/signin.html';
            return;
        }

        const res = await req.json();
        userData = res;

        // fullName may be empty for older accounts, fall back to name
        document.getElementById("username").innerText = userData.fullName || userData.name || "Farmer";
        if (userData.imgUrl) {
            document.getElementById("profilePic").innerHTML = `<img src="${userData.imgUrl}" alt="Profile Picture" />`;
        }

        const mycoursesContainer = document.querySelector('.course-cards-container');
        const rawEnrolled = userData.enrolledCourses || [];
        const rawCompleted = userData.completedCourses || [];

        // Normalize both lists into a single array of {name, progress} objects
        const allMyCourses = [
            ...rawEnrolled.map(c => typeof c === 'object' ? { name: c.name || c.courseName, progress: c.progress || 0 } : { name: c, progress: 0 }),
            ...rawCompleted.map(c => ({ name: c, progress: 100 }))
        ].filter(c => c.name && c.name !== 'undefined');

        if (allMyCourses.length === 0) {
            mycoursesContainer.innerHTML = '<p style="color:#888">No courses enrolled yet. Browse courses below!</p>';
        }

        let shown = 0;
        for (const enrollment of allMyCourses) {
            if (shown++ >= 3) break; // show only first 3

            let courseName = enrollment.name;
            const progress = enrollment.progress;

            const courseRes  = await fetch(`/api/getcourse/name/${courseName}`);
            const courseCT   = courseRes.headers.get('content-type');
            if (!courseCT || !courseCT.includes('application/json')) continue; // session expired mid-render
            const courseData = await courseRes.json();
            if (courseData.error) continue;

            let imgSrc = '';
            try {
                const imgRes  = await fetch(window.location.origin + `/api/youtubethumb/${courseData.playlist}`);
                const imgCT   = imgRes.headers.get('content-type');
                if (imgCT && imgCT.includes('application/json')) {
                    const imgData = await imgRes.json();
                    imgSrc = imgData.img || '';
                }
            } catch (_) {} // thumbnail is cosmetic — never block course render

            const courseCard = document.createElement('div');
            courseCard.classList.add('dashboard-course-card');
            courseCard.innerHTML = `
                <img src="${imgSrc}" alt="${courseName}" />
                <h2>${courseName}</h2>
                <p>${courseData.description}</p>
                <div class="course-progress">
                    <div class="course-progress-bar" style="width:${Math.min(progress, 100)}%"></div>
                </div>
                <span class="progress-label">${Math.min(Math.round(progress), 100)}% complete</span>
                <button onclick="courseShortHandler(this);" data-coursename="${courseName}" data-courseplaylist="${courseData.playlist}" data-courseid="${courseData._id}">▶ Watch</button>
                <button onclick="unenrollCourse(this);" data-coursename="${courseName}">Unenroll</button>
            `;
            mycoursesContainer.appendChild(courseCard);
        }
    } catch (error) {
        console.error('Failed to fetch user data:', error);
    }

    // Setup event listeners
    document.getElementById("prev-month").addEventListener("click", () => {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        generateCalendar();
    });

    document.getElementById("next-month").addEventListener("click", () => {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        generateCalendar();
    });

    resetBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to reset progress for this month?")) {
            localStorage.removeItem(getStorageKey(currentMonth, currentYear));
            generateCalendar();
            taskBox.innerHTML = "🗓️ Calendar progress reset. Click a day to start learning!";
        }
    });

    addNoteBtn.addEventListener('click', addNote);
    newNoteInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addNote();
        }
    });

    // Initialize components
    detectLanguage();
    generateCalendar();
    loadNotes();
    setupChat();
    updateKeyStatusDot();
});


function showSection(targetId) {
    document.querySelectorAll('section').forEach(section => {
        section.style.display = 'none';
    });
    document.getElementById(targetId).style.display = 'block';

    // Lazy-init the Leaflet map the first time ai-toolkit section is shown
    if (targetId === 'ai-toolkit') {
        getLocationAndStart();
    }
}

const navLinks = document.querySelectorAll('.nav-anchor');
navLinks.forEach(link => {
    link.parentElement.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.link-dock').forEach(item => {
            item.classList.remove('active');
        })
        document.querySelectorAll('.links').forEach(item => {
            item.classList.remove('active');
        })
        link.parentElement.classList.add('active');
        const targetId = link.getAttribute('data-target');
        showSection(targetId);
    });
});


//ai-toolkit js ── Plant Disease Detection
// Primary:  Gemini Vision  (when X-Gemini-Key is set)
// Fallback: MobileNetV3-Large (94-class, LiteRT WebGPU)
// ─────────────────────────────────────────────────────

const plantUpload       = document.getElementById('upload');
const plantUploadCamera = document.getElementById('upload-camera');
const plantImg          = document.getElementById('image');
const predictionText    = document.getElementById('prediction');
const plantSpinner      = document.getElementById('plant-spinner');
const plantModeBadge    = document.getElementById('plant-mode-badge');

function setPlantModeBadge() {
    if (!plantModeBadge) return;
    if (getGeminiKey()) {
        plantModeBadge.textContent = '✨ Gemini Vision';
        plantModeBadge.className = 'plant-mode-badge gemini';
    } else {
        plantModeBadge.textContent = '📴 Offline MobileNet';
        plantModeBadge.className = 'plant-mode-badge offline';
    }
}

function renderGeminiResult(data) {
    const severityColor = { None: '#4CAF50', Low: '#FFC107', Medium: '#FF9800', High: '#F44336' };
    const col = severityColor[data.severity] || '#888';
    const healthIcon = data.isHealthy ? '✅' : '🔴';
    predictionText.innerHTML = `
        <div class="plant-result">
            <div class="plant-result-row">
                <span class="plant-label">Crop</span>
                <span class="plant-value">${data.crop}</span>
            </div>
            <div class="plant-result-row">
                <span class="plant-label">Condition</span>
                <span class="plant-value">${healthIcon} ${data.disease}</span>
            </div>
            <div class="plant-result-row">
                <span class="plant-label">Severity</span>
                <span class="plant-severity-badge" style="background:${col}">${data.severity}</span>
            </div>
            <div class="plant-result-row">
                <span class="plant-label">Confidence</span>
                <span class="plant-value">${data.confidence}</span>
            </div>
            ${!data.isHealthy ? `
            <div class="plant-result-section">
                <strong>💊 Treatment</strong>
                <p>${data.treatment}</p>
            </div>
            <div class="plant-result-section">
                <strong>🛡️ Prevention</strong>
                <p>${data.prevention}</p>
            </div>` : `
            <div class="plant-result-section">
                <p style="color:#4CAF50">Your plant looks healthy! ${data.prevention}</p>
            </div>`}
            <p class="plant-result-source">Powered by Gemini Vision</p>
        </div>`;
}

function renderOfflineResult(top5, backend, inferMs) {
    if (!top5 || top5.length === 0) {
        predictionText.innerHTML = `<div class="plant-result"><p style="color:#888">Could not identify the plant. Try a clearer close-up of a single leaf.</p></div>`;
        return;
    }

    const best       = top5[0];
    const confidence = (best.confidence * 100).toFixed(1);

    // Handle "Invalid" class — model explicitly signals non-leaf image
    if (best.label === 'Invalid' && best.confidence > 0.5) {
        predictionText.innerHTML = `
            <div class="plant-result">
                <p style="color:#888">Image doesn't appear to be a crop leaf.<br>
                Please take a close-up photo of a single leaf.</p>
                <p class="plant-result-source">Offline MobileNet</p>
            </div>`;
        return;
    }

    // Low confidence fallback
    if (best.confidence < 0.35) {
        predictionText.innerHTML = `
            <div class="plant-result">
                <p style="color:#888">Low confidence (${confidence}%) — try a clearer close-up in good lighting.</p>
                <p class="plant-result-source">Offline MobileNet · Set a Gemini key for smarter results</p>
            </div>`;
        return;
    }

    // The new 128-class Master Dictionary provides space-separated strings (e.g. "Apple Rust Leaf")
    const parseLabel = (raw) => {
        const full = (raw || 'Unknown').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
        const healthy = full.toLowerCase().includes('healthy') || full.toLowerCase().includes('normal');
        return { 
            crop: full, 
            disease: healthy ? 'Healthy' : 'Detected', 
            healthy 
        };
    };

    const { crop, disease, healthy } = parseLabel(best.label);

    // Top-2 alternatives (skip Invalid)
    const altRows = top5.slice(1, 4)
        .filter(t => t.label !== 'Invalid')
        .slice(0, 2)
        .map(t => {
            const { crop: c, disease: d } = parseLabel(t.label);
            return `<span class="plant-alt">${c} – ${d} <em>(${(t.confidence * 100).toFixed(0)}%)</em></span>`;
        }).join('');

    predictionText.innerHTML = `
        <div class="plant-result">
            <div class="plant-result-row">
                <span class="plant-label">Crop</span>
                <span class="plant-value">${crop}</span>
            </div>
            <div class="plant-result-row">
                <span class="plant-label">Condition</span>
                <span class="plant-value">${healthy ? '✅' : '🔴'} ${disease}</span>
            </div>
            <div class="plant-result-row">
                <span class="plant-label">Confidence</span>
                <span class="plant-value">${confidence}%</span>
            </div>
            ${altRows ? `<div class="plant-result-section"><strong>Other possibilities</strong><p>${altRows}</p></div>` : ''}
            <p class="plant-result-source">${{'litert-webgpu':'⚡ LiteRT WebGPU','litert-wasm':'🔵 LiteRT WASM'}[backend] || backend} · ${inferMs}ms · Set a Gemini key for detailed treatments</p>
        </div>`;
}

async function analyzeImage(file) {
    if (!file) return;

    plantImg.src = URL.createObjectURL(file);
    plantImg.style.display = 'block';
    plantSpinner.style.display = 'block';
    predictionText.innerHTML = '';
    setPlantModeBadge();

    const key = getGeminiKey();

    if (key) {
        // ── Gemini Vision path ──
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const res = await fetch('/api/gemini/analyze-plant', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Accept': 'application/json',
                    'x-gemini-key': key 
                },
                body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' })
            });
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Session expired. Please refresh the page to sign in again.");
            }
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            renderGeminiResult(data);
        } catch (err) {
            predictionText.innerHTML = `<p style="color:#c00">❌ Gemini error: ${err.message}</p>`;
        }
    } else {
        // ── Offline ViT path ──
        try {
            // Wait for image to fully render so canvas can draw it
            await new Promise(resolve => {
                if (plantImg.complete) resolve();
                else plantImg.onload = resolve;
            });

            const { top5, backend, inferMs } = await PlantAI.predict(plantImg, (msg) => {
                predictionText.innerHTML = `<p style="color:#888">⏳ ${msg}</p>`;
            });
            renderOfflineResult(top5, backend, inferMs);
        } catch (err) {
            predictionText.innerHTML = `<p style="color:#c00">❌ Offline model error: ${err.message}</p>`;
        }
    }

    plantSpinner.style.display = 'none';
}

plantUpload.addEventListener('change', (e) => analyzeImage(e.target.files[0]));
plantUploadCamera.addEventListener('change', (e) => analyzeImage(e.target.files[0]));

const weatherDiv = document.getElementById('weatherResult');
let _lastWeatherData = null; // store for farming tips refresh

// Weather by coordinates — fetches data then calls farming tips
async function getWeatherByCoords(lat, lon) {
    weatherDiv.innerHTML = '<p style="color:#888">⏳ Fetching weather...</p>';
    try {
        const wres = await fetch(window.location.origin + `/api/openweather/${lat}/${lon}`);
        
        const contentType = wres.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server did not return JSON. Your session may have expired.");
        }
        
        const data = await wres.json();
        _lastWeatherData = { ...data, lat, lon };

        weatherDiv.innerHTML = `
            <p><strong>${data.name}</strong></p>
            <p>🌡️ Temperature: <strong>${data.temp}°C</strong></p>
            <p>🌤️ Weather: ${data.weather}</p>
            <p>💧 Humidity: ${data.humidity}%</p>
            <p>💨 Wind: ${data.wind} m/s</p>
            <div id="farming-tips-box"><p style="color:#888;font-size:0.85rem">⏳ Loading farming tips...</p></div>`;

        fetchFarmingTips(data);
    } catch (error) {
        console.error(error);
        weatherDiv.innerHTML = '<p>Weather data not available!</p>';
    }
}

// Gemini-powered farming tips (falls back to static rules if no key)
async function fetchFarmingTips(data) {
    const tipsBox = document.getElementById('farming-tips-box');
    if (!tipsBox) return;

    const key = getGeminiKey();
    if (!key) {
        // Static fallback
        const tip = staticFarmingTip(data);
        tipsBox.innerHTML = `<p style="color:green"><strong>🌱 Farming Tip:</strong> ${tip}</p>
            <p style="font-size:0.75rem;color:#aaa">Set a Gemini API key for AI-powered tips</p>`;
        return;
    }

    try {
        const res = await fetch('/api/gemini/farming-tips', {
            method: 'POST',
            headers: geminiHeaders(),
            body: JSON.stringify({
                temp: data.temp, humidity: data.humidity,
                weather: data.weather, location: data.name
            })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        const tips = json.tips;
        tipsBox.innerHTML = `
            <div style="margin-top:10px">
                <strong style="color:#2e7d32">🌱 AI Farming Tips for ${data.name}:</strong>
                <ol style="margin:6px 0 0 16px;padding:0;color:#333;font-size:0.9rem">
                    ${tips.map(t => `<li style="margin-bottom:4px">${t}</li>`).join('')}
                </ol>
                <p style="font-size:0.7rem;color:#aaa;margin-top:4px">Powered by Gemini · Tap refresh to update</p>
            </div>`;
    } catch (err) {
        tipsBox.innerHTML = `<p style="color:green"><strong>🌱 Farming Tip:</strong> ${staticFarmingTip(data)}</p>`;
    }
}

function staticFarmingTip(data) {
    const { temp, humidity, weather = '' } = data;
    const w = weather.toLowerCase();
    if (temp > 32 && humidity < 40) return 'Consider drought-resistant crops like millet, sorghum, or chickpeas.';
    if (humidity > 75)              return 'High humidity detected. Monitor for fungal infections and use proper fungicides.';
    if (w.includes('rain'))         return 'Rains expected — ensure proper water drainage in your fields.';
    if (temp >= 20 && temp <= 25)   return 'Ideal conditions for tomatoes, peppers, and leafy vegetables.';
    return 'Weather looks normal. Continue regular farming practices.';
}

// Map Initialization
function initMap(lat, lon) {
    const map = L.map('map', { zoomControl: true }).setView([lat, lon], 10);
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
        keepBuffer: 8,
    }).addTo(map);
    L.marker([lat, lon]).addTo(map).bindPopup('You are here!').openPopup();
}

// Map is lazy-initialized only when ai-toolkit section is shown
// (Leaflet can't render in a hidden element)
let mapInitialized = false;
function getLocationAndStart() {
    if (mapInitialized) return;
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            mapInitialized = true;
            initMap(lat, lon);
            getWeatherByCoords(lat, lon);
        }, () => {
            weatherDiv.innerHTML = '<p>Unable to fetch location. Please allow location access.</p>';
        });
    } else {
        weatherDiv.innerHTML = '<p>Geolocation not supported by this browser.</p>';
    }
}

// "Get Weather" button — re-fetches without reinitialising the map
function getWeather() {
    if (_lastWeatherData) {
        fetchFarmingTips(_lastWeatherData);
    } else {
        getLocationAndStart();
    }
}

// ── YouTube Search (Gemini-powered) ──────────────────────────────────────────
async function searchYouTube() {
    const input   = document.getElementById('yt-search-input');
    const results = document.getElementById('yt-results');
    const query   = input?.value?.trim();
    if (!query) return;

    results.innerHTML = '<p style="color:#888;text-align:center">⏳ Searching...</p>';

    try {
        const res  = await fetch(`/api/gemini/youtube?q=${encodeURIComponent(query)}`, {
            headers: { 'x-gemini-key': getGeminiKey() || '' }
        });

        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            results.innerHTML = '<p style="color:#c00">Session expired. Please refresh the page and sign in again.</p>';
            return;
        }

        const data = await res.json();

        if (data.error) {
            results.innerHTML = `<p style="color:#c00">Error: ${data.error}</p>`;
            return;
        }

        const videos = data.videos || data.results || data;
        if (!Array.isArray(videos) || videos.length === 0) {
            results.innerHTML = '<p style="color:#888">No results found.</p>';
            return;
        }

        results.innerHTML = videos.map(v => `
            <a class="yt-card" href="${v.url || v.link || '#'}" target="_blank" rel="noopener">
                <img class="yt-thumb" src="${v.thumbnail || v.thumb || ''}" alt="${v.title || ''}"
                     onerror="this.style.display='none'">
                <div class="yt-card-info">
                    <p class="yt-card-title">${v.title || 'Untitled'}</p>
                    <p class="yt-card-channel">${v.channel || v.channelTitle || ''}</p>
                </div>
            </a>`).join('');
    } catch (err) {
        results.innerHTML = `<p style="color:#c00">Search failed: ${err.message}</p>`;
    }
}


// Email Validation and Sending
//   email 
function validate() {
    const name    = document.querySelector('.name');
    const email   = document.querySelector('.email');
    const msg     = document.querySelector('.message');
    const sendBtn = document.querySelector('.send-btn');
    if (!sendBtn) return; // guard: element may not exist on all pages
    sendBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!name.value || !email.value || !msg.value) {
            emptyerror();
        } else {
            try {
                await sendmail(name.value, email.value, msg.value);
                success(); // only fires if emailjs.send resolves
            } catch (err) {
                alert('Send Failed — Could not send email. Please try again.');
            }
        }
    });
}
validate();
function sendmail(name, email, msg) {
    return emailjs.send('service_zuh4atp', 'template_q2td4se', {
        from_name: name,   // sender's name
        to_name:   email,  // sender's email (used as reply-to)
        message:   msg,
    });
}
function emptyerror() {
    alert("Complete All The Sections — Fields can't be empty.");
}
function success() {
    alert("Email Sent Successfully! We will try to respond within 24 hours.");
}

async function logout() {
    await Clerk.signOut();
    window.location.href = window.location.origin + '/private/logout';
}

// course js @Rouvik Maji
async function listCourses() {
    const res = await fetch('/api/getcourses');
    const ct  = res.headers.get('content-type');
    if (!ct || !ct.includes('application/json')) return; // session expired — silently bail
    const data = await res.json();
    if (data.error) return;
    const courseList = document.querySelector('.courses-grid');
    courseList.innerHTML = '';

    for (const course of data) {
        const card = document.createElement('div');
        card.classList.add('course-card');

        // fetch thumbnail (YouTube API) — gracefully degrade if unavailable
        let imgSrc = '';
        try {
            const imgres = await fetch(window.location.origin + `/api/youtubethumb/${course.playlist}`);
            const imgdata = await imgres.json();
            imgSrc = imgdata.img || '';
        } catch (_) {}

        card.innerHTML = `
            ${imgSrc ? `<img src="${imgSrc}" alt="${course.name}" />` : '<div class="no-thumb">📚</div>'}
            <h3>${course.name}</h3>
            <p>${course.description}</p>
            <p><b>Medium</b>: ${course.medium || 'Hindi'}</p>
            <button class="enroll-btn" data-coursename="${course.name}" data-courseplaylist="${course.playlist}" data-courseid="${course._id}" onclick="courseHandler(this);">▶ Watch</button>
        `;
        courseList.appendChild(card);
    }
}

listCourses();

async function courseHandler(button) {
    localStorage.setItem('courseName', button.dataset.coursename);
    localStorage.setItem('coursePlaylist', button.dataset.courseplaylist);
    localStorage.setItem('courseId', button.dataset.courseid);

    try {
        const res = await fetch('/api/addcourse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseName: button.dataset.coursename })
        });
        
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (data.error) console.warn("Enroll note:", data.error);
        } else {
            console.warn("Enrollment failed: Server did not return JSON. You may need to sign in again.");
        }
    } catch (err) {
        console.warn("Could not enroll:", err);
    }

    window.location.href = window.location.origin + '/private/Player/player.html';
}
// Dead code removed — old listCourses() replaced by active version above