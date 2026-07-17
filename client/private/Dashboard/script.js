window.addEventListener('error', (e) => {
    console.error('[PragatiPath UI Error]:', e.error || e.message);
});

window.addEventListener('unhandledrejection', (e) => {
    console.warn('[PragatiPath Async Error]:', e.reason);
});

const logoutBtn = document.querySelector(".logout-btn");
const logoutIcon = document.querySelector("#logout-icon");
const logoutIconDock = document.querySelector("#logout-icon-dock");

// ── Always send session cookies so Clerk auth works on every API call ──────────
// Without this, protected routes return an HTML sign-in redirect
// and JSON.parse fails with "Unexpected token '<'".
const _nativeFetch = window.fetch;
window.fetch = function(url, opts = {}) {
    if (typeof url === 'string' && url.startsWith('/api')) {
        opts = { credentials: 'same-origin', ...opts };
    }
    return _nativeFetch(url, opts);
};

let userData = null;
let _lastScannedCrop = null;
let _lastWeatherData = null; // populated after each weather fetch, used by getWeather() button
let _lastScanResult = null;  // last plant scan result object (Gemini or offline)
let _lastScanFile   = null;  // last image File object used for scan (for Web Share API)

// ── Pinned Crops Logic (multi-pin) ──────────────────────────────────────────────
const PINNED_KEY = 'pragati_pinned_crops_v2';

function getPinnedCrops() {
    try { return JSON.parse(localStorage.getItem(PINNED_KEY)) || []; }
    catch { return []; }
}

window.pinCrop = function(commodity, minPrice, maxPrice, market) {
    const pins = getPinnedCrops();
    const alreadyPinned = pins.findIndex(p => p.commodity === commodity && p.market === market);
    if (alreadyPinned !== -1) {
        alert(`ℹ️ ${commodity} from ${market} is already pinned.`);
        return;
    }
    pins.push({ commodity, minPrice, maxPrice, market, timestamp: Date.now() });
    localStorage.setItem(PINNED_KEY, JSON.stringify(pins));
    renderPinnedCrop();
    // Brief toast instead of blocking alert
    showToast(`📌 ${commodity} pinned to Farm Dashboard!`);
};

window.unpinCrop = function(index) {
    const pins = getPinnedCrops();
    pins.splice(index, 1);
    localStorage.setItem(PINNED_KEY, JSON.stringify(pins));
    renderPinnedCrop();
};

window.renderPinnedCrop = function() {
    const pinnedDiv = document.getElementById('pinnedCropResult');
    if (!pinnedDiv) return;

    const pins = getPinnedCrops();
    if (pins.length === 0) {
        pinnedDiv.innerHTML = '<p style="color:#888;font-size:0.9rem">📌 No crops pinned yet. Go to Market section and pin from Mandi prices.</p>';
        return;
    }

    pinnedDiv.innerHTML = pins.map((data, i) => `
        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.6); padding:10px 14px; border-radius:10px; border:1px solid #c8e6c9; margin-bottom:8px;">
            <div>
                <strong style="color:#2e7d32; font-size:0.95rem;">${escapeHtml(data.commodity)}</strong>
                <p style="margin:2px 0 0; font-size:0.78rem; color:#888;">&#128205; ${escapeHtml(data.market)}</p>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.85rem;"><span style="color:#2e7d32; font-weight:700;">&#8377;${data.minPrice}</span> – <span style="color:#c00; font-weight:700;">&#8377;${data.maxPrice}</span> /kg</div>
                <button onclick="unpinCrop(${i})" style="margin-top:5px; padding:2px 10px; font-size:0.75rem; border:none; background:#ffcdd2; color:#c62828; border-radius:20px; cursor:pointer;">✕ Unpin</button>
            </div>
        </div>
    `).join('');
};

// Non-blocking toast notification
function showToast(msg) {
    let toast = document.getElementById('pragati-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'pragati-toast';
        toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#2e7d32;color:#fff;padding:10px 22px;border-radius:30px;font-size:0.9rem;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.2);transition:opacity 0.4s;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// Call on initial load
document.addEventListener('DOMContentLoaded', () => {
    renderPinnedCrop();
});

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
    if (logoutIconDock) logoutIconDock.setAttribute('fill', 'red');
});

logoutBtn.addEventListener('mouseleave', () => {
    logoutIcon.setAttribute('fill', '#fefae0');
    if (logoutIconDock) logoutIconDock.setAttribute('fill', '#fefae0');
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

// ── Crop Seasonal Calendar (month → crop sowing/harvest advice) ──────────────
// Indexed by month (0=Jan ... 11=Dec). Shows sowing/harvest advice for common crops.
const CROP_CALENDAR = {
    'Rice':    ['🌱 Prepare nursery beds','🌱 Transplant seedlings','🌾 Growing season','🌾 Growing season','🌾 Growing season','🌾 Growing season','🌱 Kharif sowing','🌿 Transplant seedlings','🌿 Growing season','🌿 Growing season','🌾 Kharif harvest','🌱 Rabi sowing'],
    'Wheat':   ['🌱 Rabi growing','🌱 Growing season','🌾 Harvesting time','🌾 Threshing','⏸ Land prep','⏸ Land prep','⏸ Land prep','⏸ Land prep','⏸ Land prep','🌱 Sowing begins','🌱 Sowing continues','🌿 Growing season'],
    'Cotton':  ['⏸ Off season','⏸ Land prep','⏸ Irrigation','🌱 Sowing month','🌱 Germination','🌿 Growing season','🌿 Growing season','🌿 Boll formation','🌿 Boll formation','🌾 Harvest begins','🌾 Peak harvest','🌾 Final picking'],
    'Maize':   ['⏸ Land prep','⏸ Land prep','🌱 Rabi harvest','🌾 Rabi harvest','⏸ Land prep','🌱 Kharif sowing','🌿 Growing season','🌿 Tasseling','🌾 Kharif harvest','⏸ Land prep','🌱 Rabi sowing','🌿 Rabi growing'],
    'Potato':  ['🌾 Harvesting','🌾 Post-harvest','⏸ Storage','⏸ Off season','⏸ Off season','⏸ Land prep','⏸ Land prep','⏸ Land prep','⏸ Land prep','🌱 Sowing begins','🌱 Growing season','🌿 Growing season'],
    'Onion':   ['🌾 Harvest Kharif','🌱 Rabi transplant','🌿 Rabi growing','🌿 Rabi growing','🌾 Rabi harvest','⏸ Curing','🌱 Kharif nursery','🌱 Kharif transplant','🌿 Kharif growing','🌿 Kharif growing','🌾 Late Kharif harvest','⏸ Storage'],
    'Tomato':  ['🌱 Winter sowing','🌿 Growing','🌾 Harvest','🌾 Harvest','🌱 Summer sowing','🌿 Growing','🌿 Growing','🌱 Kharif sowing','🌿 Growing','🌾 Harvest','🌾 Harvest','🌱 Winter sowing'],
    'Sugarcane':['🌿 Growing','🌿 Growing','🌿 Growing','🌾 Harvest peak','🌾 Harvest','🌱 Sowing','🌱 Sowing','🌿 Early growth','🌿 Growing','🌿 Growing','🌿 Grand growth','🌾 Pre-harvest'],
    'Soybean': ['⏸ Off season','⏸ Land prep','⏸ Land prep','⏸ Land prep','⏸ Land prep','🌱 Kharif sowing','🌿 Growing','🌿 Pod filling','🌿 Maturation','🌾 Harvest','⏸ Off season','⏸ Off season'],
    'Mustard': ['🌿 Growing','🌾 Harvest','🌾 Threshing','⏸ Land prep','⏸ Off season','⏸ Off season','⏸ Off season','⏸ Off season','⏸ Off season','🌱 Sowing','🌿 Growing','🌿 Flowering'],
};

function getCropCalendarHint(month) {
    const pins = getPinnedCrops();
    if (!pins.length) return '';
    const lines = pins.map(p => {
        const crop = p.commodity;
        // Try exact match, then case-insensitive partial match
        const key = Object.keys(CROP_CALENDAR).find(k => k.toLowerCase() === crop.toLowerCase())
                 || Object.keys(CROP_CALENDAR).find(k => crop.toLowerCase().includes(k.toLowerCase()));
        if (!key) return null;
        return `<span style="display:block; font-size:0.8rem; color:#2e7d32;">🌾 <strong>${escapeHtml(crop)}:</strong> ${CROP_CALENDAR[key][month]}</span>`;
    }).filter(Boolean);
    if (!lines.length) return '';
    return `<div style="margin-top:10px; padding:8px 10px; background:#f0fdf4; border-radius:8px; border:1px solid #c8e6c9;">
        <div style="font-size:0.75rem; color:#555; font-weight:600; margin-bottom:4px;">📅 Your Pinned Crops This Month:</div>
        ${lines.join('')}
    </div>`;
}

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

            const cropHint = getCropCalendarHint(currentMonth);
            taskBox.innerHTML = `
                🎓 <strong>Learning for ${day} ${months[currentMonth]}:</strong><br>${task}
                ${cropHint}
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
    const map = {
        'hi': '🌍 आपकी भाषा पहचानी गई: हिंदी',
        'bn': '🌍 আপনার ভাষা: বাংলা',
        'ta': '🌍 உங்கள் மொழி: தமிழ்'
    };
    languageInfo.textContent = map[lang.slice(0, 2)] || `🌍 Detected Language: ${lang}`;
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
                credentials: 'same-origin',
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
            credentials: 'same-origin',
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
        const req = await fetch('/api/userinfo', { credentials: 'same-origin' });
        
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
            // Use createElement to avoid XSS risk from raw innerHTML injection
            const img = document.createElement('img');
            img.src = userData.imgUrl;
            img.alt = 'Profile Picture';
            document.getElementById("profilePic").innerHTML = '';
            document.getElementById("profilePic").appendChild(img);
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

            const courseRes  = await fetch(`/api/getcourse/name/${courseName}`, { credentials: 'same-origin' });
            const courseCT   = courseRes.headers.get('content-type');
            if (!courseCT || !courseCT.includes('application/json')) continue; // session expired mid-render
            const courseData = await courseRes.json();
            if (courseData.error) continue;

            let imgSrc = '';
            try {
                const imgRes  = await fetch(window.location.origin + `/api/youtubethumb/${courseData.playlist}`, { credentials: 'same-origin' });
                const imgCT   = imgRes.headers.get('content-type');
                if (imgCT && imgCT.includes('application/json')) {
                    const imgData = await imgRes.json();
                    imgSrc = imgData.img || '';
                }
            } catch (_) {} // thumbnail is cosmetic — never block course render

            const courseCard = document.createElement('div');
            courseCard.classList.add('dashboard-course-card');
            // Escape text content to prevent XSS from malicious DB data
            const escapedName = courseName.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            const escapedDesc = (courseData.description || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            courseCard.innerHTML = `
                <img src="${imgSrc}" alt="${escapedName}" />
                <h2>${escapedName}</h2>
                <p>${escapedDesc}</p>
                <div class="course-progress">
                    <div class="course-progress-bar" style="width:${Math.min(progress, 100)}%"></div>
                </div>
                <span class="progress-label">${Math.min(Math.round(progress), 100)}% complete</span>
                <button onclick="courseShortHandler(this);" data-coursename="${escapedName}" data-courseplaylist="${courseData.playlist}" data-courseid="${courseData._id}">▶ Watch</button>
                <button onclick="unenrollCourse(this);" data-coursename="${escapedName}">Unenroll</button>
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

    // Reset scroll position when switching sections
    const container = document.querySelector('.container');
    if (container) container.scrollTop = 0;

    // Lazy-init the Leaflet map the first time ai-toolkit section is shown
    if (targetId === 'ai-toolkit') {
        getLocationAndStart();
    }
    // Load forum posts when navigating to community
    if (targetId === 'community') {
        _forumLoaded = false; // always re-fetch on navigation so new posts appear
        loadForumPosts();
    }
}

// ── Community: Tab switcher ───────────────────────────────────────────────────
window.showCommTab = function(tab) {
    document.getElementById('comm-mandi').style.display   = tab === 'mandi'   ? 'block' : 'none';
    document.getElementById('comm-forum').style.display   = tab === 'forum'   ? 'block' : 'none';
    document.getElementById('comm-schemes').style.display = tab === 'schemes' ? 'block' : 'none';
    document.querySelectorAll('.comm-tab').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    if (tab === 'forum')   loadForumPosts();
    if (tab === 'schemes') loadSchemes();
};

// ── Krishi Charcha Forum ──────────────────────────────────────────────────────
let _forumLoaded = false;

async function loadForumPosts(force = false) {
    const feed = document.getElementById('forum-feed');
    if (!feed) return;
    if (_forumLoaded && !force) return; // don't re-fetch unless forced
    feed.innerHTML = '<p style="color:#888; text-align:center;">⏳ Loading discussions...</p>';
    try {
        const res = await fetch('/api/forum/posts', { credentials: 'same-origin' });
        
        // Prevent JSON parse crash if Clerk redirects to the HTML login page
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            window.location.href = window.location.origin + '/public/Accounts/signin.html';
            return;
        }

        const posts = await res.json();
        if (!Array.isArray(posts) || posts.length === 0) {
            feed.innerHTML = '<p style="color:#888; text-align:center;">🌱 No discussions yet. Be the first to post!</p>';
            _forumLoaded = true;
            return;
        }
        feed.innerHTML = posts.map(p => renderForumPost(p)).join('');
        _forumLoaded = true;
    } catch (err) {
        feed.innerHTML = `<p style="color:#c00; text-align:center;">Failed to load posts: ${err.message}</p>`;
    }
}

function renderForumPost(p) {
    const timeAgo = formatTimeAgo(new Date(p.createdAt));
    const likeCount = (p.likes || []).length;
    const avatar = p.authorImg
        ? `<img src="${p.authorImg}" alt="" class="forum-post-avatar">`
        : `<div class="forum-post-avatar" style="display:flex;align-items:center;justify-content:center;font-size:1.1rem;background:#c8e6c9;">🌾</div>`;
    return `
    <div class="forum-post" id="post-${p._id}">
        <div class="forum-post-header">
            ${avatar}
            <div>
                <strong style="font-size:0.9rem; color:#2e7d32;">${escapeHtml(p.authorName || '')}</strong>
                <span style="color:#aaa; font-size:0.78rem; margin-left:8px;">${timeAgo}</span>
            </div>
            <span class="forum-tag ${p.tag}">${p.tag || ''}</span>
        </div>
        <p class="forum-post-title">${escapeHtml(p.title || '')}</p>
        <p class="forum-post-body">${escapeHtml(p.body || '')}</p>
        <div class="forum-post-meta">
            <button class="forum-like-btn" onclick="likePost('${p._id}', this)">❤️ ${likeCount}</button>
        </div>
    </div>`;
}

function escapeHtml(text) {
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
function formatTimeAgo(date) {
    const diff = (Date.now() - date) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return rtf.format(-Math.floor(diff/60), 'minute');
    if (diff < 86400) return rtf.format(-Math.floor(diff/3600), 'hour');
    return rtf.format(-Math.floor(diff/86400), 'day');
}

window.submitForumPost = async function() {
    const tag   = document.getElementById('forum-tag').value;
    const title = document.getElementById('forum-title').value.trim();
    const body  = document.getElementById('forum-body').value.trim();
    if (!title || !body) return alert('Please fill in both the title and body.');
    try {
        const res = await fetch('/api/forum/posts', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag, title, body })
        });
        const post = await res.json();
        if (post.error) return alert('Error: ' + post.error);
        document.getElementById('forum-title').value = '';
        document.getElementById('forum-body').value  = '';
        // Prepend new post to feed
        const feed = document.getElementById('forum-feed');
        if (feed.querySelector('p')) feed.innerHTML = '';
        feed.insertAdjacentHTML('afterbegin', renderForumPost(post));
        _forumLoaded = true; // mark loaded so next tab switch doesn't wipe the new post
    } catch (err) {
        alert('Failed to post: ' + err.message);
    }
};

window.likePost = async function(postId, btn) {
    if (btn.disabled) return; // prevent double-click spam
    btn.disabled = true;
    try {
        const res = await fetch(`/api/forum/posts/${postId}/like`, { method: 'POST', credentials: 'same-origin' });
        const data = await res.json();
        if (data.error) return;
        btn.classList.toggle('liked', data.liked);
        btn.innerHTML = `❤️ ${data.likes}`;
    } catch (err) {
        console.error('Like failed:', err);
    } finally {
        btn.disabled = false;
    }
};

const navLinks = document.querySelectorAll('.nav-anchor');
navLinks.forEach(link => {
    link.parentElement.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('data-target');

        // Clear all active states in both navs
        document.querySelectorAll('.link-dock').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.links').forEach(item => item.classList.remove('active'));

        // Activate the clicked item
        link.parentElement.classList.add('active');

        // Sync the counterpart nav (sidebar ↔ dock) so both stay in step
        document.querySelectorAll('.nav-anchor').forEach(otherLink => {
            if (otherLink !== link && otherLink.getAttribute('data-target') === targetId) {
                otherLink.parentElement.classList.add('active');
            }
        });

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
            <button onclick="shareResultToWhatsApp()" style="margin-top:10px; padding:7px 16px; background:#25D366; color:#fff; border:none; border-radius:8px; font-size:0.82rem; font-weight:600; cursor:pointer;">📤 Share on WhatsApp</button>
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
            <button onclick="shareResultToWhatsApp()" style="margin-top:10px; padding:7px 16px; background:#25D366; color:#fff; border:none; border-radius:8px; font-size:0.82rem; font-weight:600; cursor:pointer;">📤 Share on WhatsApp</button>
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
            const response = await fetch('/api/gemini/analyze-plant', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'x-gemini-key': getGeminiKey() || '' },
                body: JSON.stringify({ imageBase64: base64, mimeType: file.type })
            });
            // Safe parse: if server returns HTML error page, show a clear message
            const rawText = await response.text();
            let data;
            try {
                data = JSON.parse(rawText);
            } catch {
                throw new Error(`Server returned HTTP ${response.status}. Check your Gemini API key or try again.`);
            }
            
            if (data.error) throw new Error(data.error);

            _lastScannedCrop = data.crop;
            _lastScanResult  = data;   // store for WhatsApp share
            _lastScanFile    = file;   // store image for Web Share API

            // Use the proper structured renderer (not inline HTML)
            renderGeminiResult(data);

            // Auto-search videos for the disease
            if (data.disease && data.disease !== 'Healthy' && data.disease !== 'Unknown' && data.crop) {
                document.getElementById('yt-search-input').value = `how to treat ${data.disease} in ${data.crop}`;
                searchYouTube();
            } else if (data.crop && data.crop !== 'Unknown') {
                document.getElementById('yt-search-input').value = `how to grow ${data.crop}`;
                searchYouTube();
            }
            
            // Automatically removed unnecessary background weather re-trigger here
            
        } catch (err) {
            predictionText.innerHTML = `<p style="color:#c00">❌ Gemini error: ${err.message}</p>`;
        }
    } else {
        // ── Offline ViT path ──
        try {
            // Clear any previous Gemini scan state so share produces correct output
            _lastScanFile    = file;
            _lastScanResult  = null;
            _lastScannedCrop = null;

            // Wait for image to fully render so canvas can draw it
            await new Promise((resolve, reject) => {
                if (plantImg.complete) resolve();
                else {
                    plantImg.onload = resolve;
                    plantImg.onerror = () => reject(new Error("Failed to load image for scanning."));
                }
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

// ── Phase 3: Agronomy Intelligence Pipeline ───────────────────────────────────
async function getWeatherByCoords(lat, lon) {
    const weatherDiv = document.getElementById('weatherResult');
    const soilDiv = document.getElementById('soilResult');
    const cropsDiv = document.getElementById('cropsResult');
    const fertDiv = document.getElementById('fertilizerResult');
    const trendsDiv = document.getElementById('trendsResult');
    const mandiDiv = document.getElementById('mandiResult');

    if (!weatherDiv) return;

    // Set loading states
    weatherDiv.innerHTML = '<p style="color:#888;font-size:0.9rem">⏳ Fetching weather...</p>';
    if (soilDiv) soilDiv.innerHTML = '<p style="color:#888;font-size:0.9rem">⏳ Fetching Soil & Climate data...</p>';
    if (cropsDiv) cropsDiv.innerHTML = '<p style="color:#888;font-size:0.9rem">⏳ Analyzing...</p>';
    if (fertDiv) fertDiv.innerHTML = '<p style="color:#888;font-size:0.9rem">⏳ Analyzing...</p>';
    if (trendsDiv) trendsDiv.innerHTML = '<p style="color:#888;font-size:0.9rem">⏳ Analyzing...</p>';
    if (mandiDiv) mandiDiv.innerHTML = '<p style="color:#888;font-size:0.9rem">⏳ Fetching local APMC prices...</p>';

    try {
        // 1. Fetch current weather from OpenWeather
        const wRes = await fetch(`/api/openweather/${lat}/${lon}`, { credentials: 'same-origin' });
        const currentData = await wRes.json();
        if (currentData.error) throw new Error(currentData.error);
        
        const currentWeather = {
            temp: currentData.temp,
            humidity: currentData.humidity,
            condition: currentData.weather,
            location: currentData.name,
            state: currentData.state,
            district: currentData.district
        };

        // Render Weather
        weatherDiv.innerHTML = `<div style="font-size:0.95rem; line-height:1.6; color:#333;">
            <p style="margin:0;"><strong>${currentWeather.temp}°C</strong>, ${currentWeather.humidity}% Humidity.</p>
            <p style="margin:0; text-transform:capitalize">${currentWeather.condition}</p>
            <p style="margin:0; font-size:0.8rem; color:#888;">📍 ${currentWeather.location}</p>
        </div>`;

        // Store for getWeather() button
        _lastWeatherData = { temp: currentWeather.temp, humidity: currentWeather.humidity, weather: currentWeather.condition, name: currentWeather.location };
        // Expose the location name for the Schemes eligibility checker (state-level approximation)
        window._userState = currentWeather.location;
        // Zero-request weather-aware greeting tip (uses already-fetched data, no extra API call)
        updateWeatherGreeting();
        fetchFarmingTips(_lastWeatherData);

        // 2. Check Cache or Send to Gemini
        const cacheKey = 'pragati_agronomy_cache';
        const roundedLat = Number(lat).toFixed(2);
        const roundedLon = Number(lon).toFixed(2);
        const cachedStr = localStorage.getItem(cacheKey);
        
        let gData = null;
        if (cachedStr) {
            try {
                const cache = JSON.parse(cachedStr);
                // Valid if same location (within ~1.1km), < 24 hours old, and same scanned crop
                if (cache.lat === roundedLat && cache.lon === roundedLon && (Date.now() - cache.timestamp < 24 * 60 * 60 * 1000) && cache.scannedCrop === _lastScannedCrop) {
                    gData = cache.gData;
                    console.log("Using cached Gemini Agronomy data, bypassing SoilGrids fetch");
                }
            } catch(e) {}
        }

        if (!gData) {
            if (soilDiv) soilDiv.innerHTML = '<p style="color:#888;font-size:0.9rem">⏳ Fetching Soil & Climate data...</p>';
            const aRes = await fetch(`/api/agronomy/${lat}/${lon}`, { credentials: 'same-origin' });
            const agronomyData = await aRes.json();
            if (agronomyData.error) throw new Error(agronomyData.error);

            if (soilDiv) soilDiv.innerHTML = '<p style="color:#888;font-size:0.9rem">⏳ Asking Gemini to analyze soil and weather...</p>';

            const geminiRes = await fetch('/api/gemini/agronomy', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'x-gemini-key': getGeminiKey() || '' },
                body: JSON.stringify({
                    soilData: agronomyData.soil,
                    climateData: agronomyData.climate,
                    currentWeather: currentWeather,
                    scannedCrop: _lastScannedCrop
                })
            });
            gData = await geminiRes.json();
            
            if (!gData.error) {
                localStorage.setItem(cacheKey, JSON.stringify({
                    lat: roundedLat,
                    lon: roundedLon,
                    gData: gData,
                    timestamp: Date.now(),
                    scannedCrop: _lastScannedCrop
                }));
            }
        }

        if (gData.error) {
            const errHtml = `<p style="color:#c00">Gemini Error: ${escapeHtml(gData.error)}. Set API key.</p>`;
            if (soilDiv) soilDiv.innerHTML = errHtml;
            if (cropsDiv) cropsDiv.innerHTML = errHtml;
            if (fertDiv) fertDiv.innerHTML = errHtml;
            if (trendsDiv) trendsDiv.innerHTML = errHtml;
        } else {
            // Render beautiful individual dashboard cards
            let cropsHtml = gData.recommended_crops.map(c => `<li style="margin-bottom:8px"><strong>${escapeHtml(c.name)}:</strong> ${escapeHtml(c.reason)}</li>`).join('');
            let badCropsHtml = gData.not_recommended_crops.map(c => `<li style="margin-bottom:8px; color:#555;"><strong>${escapeHtml(c.name)}:</strong> ${escapeHtml(c.reason)}</li>`).join('');

            // Sanitize all Gemini markdown output before injection (consistent with chatbot)
            const sp = (txt) => DOMPurify.sanitize(marked.parse(txt || ''));

            if (soilDiv) soilDiv.innerHTML = `<div style="font-size:0.9rem; line-height:1.6; color:#333;">
                <div style="margin:0;">${sp(gData.soil_health_summary)}</div>
                <div style="margin:0; padding-top:8px; margin-top:8px; border-top:1px solid #eee;"><strong>⚠️ Risks:</strong> ${sp(gData.climate_weather_risks)}</div>
            </div>`;

            if (cropsDiv) cropsDiv.innerHTML = `<div style="font-size:0.9rem; line-height:1.6; color:#333;">
                <ul style="margin:0; padding-left:20px;">${cropsHtml}</ul>
                <h4 style="color:#d32f2f; margin:15px 0 5px; font-size:1rem;">🚫 Not Recommended</h4>
                <ul style="margin:0; padding-left:20px;">${badCropsHtml}</ul>
            </div>`;

            if (fertDiv) fertDiv.innerHTML = `<div style="font-size:0.9rem; line-height:1.6; color:#333; overflow-y:auto;">
                <div style="margin:0;"><strong>Fertilizer:</strong> ${sp(gData.fertilizer_recommendations)}</div>
                <div style="margin:0; padding-top:8px; margin-top:8px; border-top:1px solid #eee;"><strong>Pest Control:</strong> ${sp(gData.pesticide_insecticide_advice)}</div>
            </div>`;

            if (trendsDiv) trendsDiv.innerHTML = `<div style="font-size:0.9rem; line-height:1.6; color:#333;">
                <div style="margin:0;">${sp(gData.market_trends || gData.marketTrends || 'Market trend analysis is currently unavailable.')}</div>
            </div>`;

            // Auto-search videos for the top recommended crop (if no crop was scanned)
            if (!_lastScannedCrop && gData.recommended_crops && gData.recommended_crops.length > 0) {
                const topCrop = gData.recommended_crops[0].name;
                document.getElementById('yt-search-input').value = `how to farm ${topCrop} in India`;
                searchYouTube();
            }
        }

        // 4. Fetch Mandi Prices concurrently (independent of Gemini)
        if (mandiDiv) {
            try {
                const qParams = new URLSearchParams();
                if (currentWeather.state) qParams.append('state', currentWeather.state);
                if (currentWeather.district) qParams.append('district', currentWeather.district);
                
                const mRes = await fetch(`/api/mandi/${lat}/${lon}?${qParams.toString()}`, { credentials: 'same-origin' });
                const mandiData = await mRes.json();
                
                if (mandiData.error) throw new Error(mandiData.error);
                
                if (!mandiData.records || mandiData.records.length === 0) {
                    mandiDiv.innerHTML = `<p style="color:#888; font-size:0.9rem;">No recent mandi data found for ${escapeHtml(mandiData.district)}, ${escapeHtml(mandiData.state)}.</p>`;
                } else {
                    let mandiHtml = `<p style="margin:0 0 10px; color:#2e7d32; font-size:0.9rem;"><strong>Market:</strong> ${escapeHtml(mandiData.records[0].market)}, ${escapeHtml(mandiData.district)}</p>
                    <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">
                        <tr style="border-bottom:2px solid #ccc;">
                            <th style="padding:6px 0;">Commodity</th>
                            <th style="padding:6px 0;">Min</th>
                            <th style="padding:6px 0;">Max</th>
                        </tr>`;
                    
                    mandiData.records.forEach(r => {
                        const minKg = (r.min_price / 100).toFixed(1);
                        const maxKg = (r.max_price / 100).toFixed(1);
                        // Use data-attributes instead of inline onclick to prevent quote-injection XSS
                        mandiHtml += `<tr style="border-bottom:1px solid #eee;">
                            <td style="padding:8px 0; color:#333;">${escapeHtml(r.commodity)} <span style="color:#888;font-size:0.75rem">(${escapeHtml(r.variety)})</span></td>
                            <td style="padding:8px 0; color:#2e7d32; font-weight:bold;">&#8377;${minKg}/kg</td>
                            <td style="padding:8px 0; color:#c00;">&#8377;${maxKg}/kg</td>
                            <td style="padding:8px 0; text-align:right;">
                                <button class="pin-crop-btn" data-commodity="${escapeHtml(r.commodity)}" data-min="${minKg}" data-max="${maxKg}" data-market="${escapeHtml(r.market)}" style="background:none; border:none; cursor:pointer; font-size:1.1rem; padding:0;" title="Pin to Farm Dashboard">&#128204;</button>
                            </td>
                        </tr>`;
                    });
                    mandiHtml += `</table>`;
                    mandiDiv.innerHTML = mandiHtml;
                    // Event delegation — safer than inline onclick; reads data-attributes set above
                    mandiDiv.querySelectorAll('.pin-crop-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            pinCrop(btn.dataset.commodity, btn.dataset.min, btn.dataset.max, btn.dataset.market);
                        });
                    });
                    renderPinnedCrop(); // Refresh pinned view
                }
            } catch (err) {
                mandiDiv.innerHTML = `<p style="color:#c00">Failed to load market data: ${err.message}</p>`;
            }
        }

    } catch (err) {
        const weatherDivErr = document.getElementById('weatherResult');
        if (weatherDivErr) weatherDivErr.innerHTML = `<p style="color:#c00">Failed to load agronomy data: ${err.message}</p>`;
        
        // Ensure other loading states are cleared if a fatal error occurs
        const errHtml = `<p style="color:#c00">Error: ${err.message}</p>`;
        const soilDiv = document.getElementById('soilResult');
        const cropsDiv = document.getElementById('cropsResult');
        const fertDiv = document.getElementById('fertilizerResult');
        const trendsDiv = document.getElementById('trendsResult');
        if (soilDiv) soilDiv.innerHTML = errHtml;
        if (cropsDiv) cropsDiv.innerHTML = errHtml;
        if (fertDiv) fertDiv.innerHTML = errHtml;
        if (trendsDiv) trendsDiv.innerHTML = errHtml;
        const mandiErrDiv = document.getElementById('mandiResult');
        if (mandiErrDiv && mandiErrDiv.innerHTML.includes('⏳')) mandiErrDiv.innerHTML = errHtml;
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
            credentials: 'same-origin',
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
let mapInstance = null;
let farmMarker = null;
let selectedLat = null;
let selectedLng = null;

function initMap(lat, lon) {
    if (mapInstance) {
        mapInstance.setView([lat, lon], 10);
        if (farmMarker) {
            farmMarker.setLatLng([lat, lon]);
        }
        return;
    }

    mapInstance = L.map('map', { zoomControl: true }).setView([lat, lon], 10);
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
        keepBuffer: 8,
    }).addTo(mapInstance);
    
    farmMarker = L.marker([lat, lon]).addTo(mapInstance).bindPopup('Farm Location').openPopup();

    // Allow user to click to drop a new pin
    mapInstance.on('click', function(e) {
        selectedLat = e.latlng.lat;
        selectedLng = e.latlng.lng;
        farmMarker.setLatLng(e.latlng).bindPopup('New Farm Location').openPopup();
        
        document.getElementById('map-status').textContent = `Selected: ${selectedLat.toFixed(4)}, ${selectedLng.toFixed(4)}`;
        document.getElementById('save-location-btn').style.display = 'inline-block';
    });
}

document.getElementById('save-location-btn').addEventListener('click', async () => {
    if (!selectedLat || !selectedLng) return;
    
    const btn = document.getElementById('save-location-btn');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/user/location', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: selectedLat, lng: selectedLng })
        });
        
        const data = await res.json();
        if (data.success) {
            document.getElementById('map-status').textContent = '✅ Location saved to your profile.';
            // Also update weather for new location immediately
            getWeatherByCoords(selectedLat, selectedLng);
            if (userData) userData.location = { lat: selectedLat, lng: selectedLng };
        } else {
            document.getElementById('map-status').textContent = '❌ Failed to save location.';
        }
    } catch (err) {
        document.getElementById('map-status').textContent = '❌ Error saving location.';
    }
    
    btn.textContent = 'Save Location';
    btn.disabled = false;
    btn.style.display = 'none';
});

// Map is lazy-initialized only when ai-toolkit section is shown
let mapInitialized = false;
function getLocationAndStart() {
    if (mapInitialized) return;
    
    if (userData && userData.location && userData.location.lat) {
        // User has a saved location in DB
        const lat = userData.location.lat;
        const lon = userData.location.lng;
        mapInitialized = true;
        initMap(lat, lon);
        getWeatherByCoords(lat, lon);
        document.getElementById('map-status').textContent = `Farm loaded: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } else if (navigator.geolocation) {
        // Fallback to current GPS if no saved location
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            mapInitialized = true;
            initMap(lat, lon);
            getWeatherByCoords(lat, lon);
        }, () => {
            document.getElementById('map-status').textContent = 'Unable to fetch location. Please click the map to set farm manually.';
            const wRes = document.getElementById('weatherResult');
            if (wRes) wRes.innerHTML = '<p>Click map to fetch location.</p>';
            // Show a default map over India so they can still click
            mapInitialized = true;
            initMap(20.5937, 78.9629); 
        });
    } else {
        document.getElementById('map-status').textContent = 'Geolocation not supported. Click the map to set farm manually.';
        const wRes = document.getElementById('weatherResult');
        if (wRes) wRes.innerHTML = '<p>Click map to fetch location.</p>';
        mapInitialized = true;
        initMap(20.5937, 78.9629);
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
        // Append language suffix from the Google Translate widget selection (zero extra requests)
        const { suffix } = getYouTubeSearchLang();
        // Only append if not already present and if a language other than English is active
        const langQuery = (suffix && suffix !== 'in English')
            ? `${query} ${suffix}`
            : query;
        const res  = await fetch(`/api/gemini/youtube?q=${encodeURIComponent(langQuery)}`, {
            credentials: 'same-origin',
            headers: geminiHeaders()
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
            <a class="yt-card" href="${encodeURI(v.url || v.link || '#')}" target="_blank" rel="noopener">
                <img class="yt-thumb" src="${v.thumbnail || v.thumb || ''}" alt="${escapeHtml(v.title || '')}"
                     onerror="this.style.display='none'">
                <div class="yt-card-info">
                    <p class="yt-card-title">${escapeHtml(v.title || 'Untitled')}</p>
                    <p class="yt-card-channel">${escapeHtml(v.channel || v.channelTitle || '')}</p>
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
    // Only call one revocation method to avoid double-session-revoke
    window.location.href = window.location.origin + '/private/logout';
}

// course js @Rouvik Maji
async function listCourses() {
    const res = await fetch('/api/getcourses', { credentials: 'same-origin' });
    const ct  = res.headers.get('content-type');
    if (!ct || !ct.includes('application/json')) return; // session expired — silently bail
    const data = await res.json();
    if (data.error) return;
    const courseList = document.querySelector('.courses-grid');
    courseList.innerHTML = '';

    const uniqueCourses = [];
    const seenPlaylists = new Set();
    for (const c of data) {
        if (!seenPlaylists.has(c.playlist)) {
            seenPlaylists.add(c.playlist);
            uniqueCourses.push(c);
        }
    }

    for (const course of uniqueCourses) {
        const card = document.createElement('div');
        card.classList.add('course-card');

        // fetch thumbnail (YouTube API) — gracefully degrade if unavailable
        let imgSrc = '';
        try {
            const imgres = await fetch(window.location.origin + `/api/youtubethumb/${course.playlist}`, { credentials: 'same-origin' });
            const imgdata = await imgres.json();
            imgSrc = imgdata.img || '';
        } catch (_) {}

        card.innerHTML = `
            ${imgSrc ? `<img src="${imgSrc}" alt="${escapeHtml(course.name)}" />` : '<div class="no-thumb">📚</div>'}
            <h3>${escapeHtml(course.name)}</h3>
            <p>${escapeHtml(course.description)}</p>
            <p><b>Medium</b>: ${escapeHtml(course.medium || 'Hindi')}</p>
            <button class="enroll-btn" data-coursename="${escapeHtml(course.name)}" data-courseplaylist="${escapeHtml(course.playlist)}" data-courseid="${course._id}" onclick="courseHandler(this);">▶ Watch</button>
        `;
        courseList.appendChild(card);
    }
}

listCourses().catch(e => console.warn('[listCourses] Failed to fetch:', e.message));

async function courseHandler(button) {
    localStorage.setItem('courseName', button.dataset.coursename);
    localStorage.setItem('coursePlaylist', button.dataset.courseplaylist);
    localStorage.setItem('courseId', button.dataset.courseid);

    try {
        const res = await fetch('/api/addcourse', {
            method: 'POST',
            credentials: 'same-origin',
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

// ── Phase 5: Government Schemes & Subsidies Tracker ──────────────────────────
let _schemesLoaded = false;

async function loadSchemes() {
    if (_schemesLoaded) return;
    const feed = document.getElementById('schemes-feed');
    if (!feed) return;
    feed.innerHTML = '<p style="color:#888; text-align:center; grid-column:1/-1;">⏳ Loading schemes...</p>';
    try {
        const res = await fetch('/api/schemes', { credentials: 'same-origin' });
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            window.location.href = window.location.origin + '/public/Accounts/signin.html'; return;
        }
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        feed.innerHTML = data.schemes.map(s => renderSchemeCard(s)).join('');
        _schemesLoaded = true;

        // Inject PMFBY deadline banner above the cards
        injectSchemesDeadlineBanner();
    } catch (err) {
        if (feed) feed.innerHTML = `<p style="color:#c00; grid-column:1/-1;">Failed to load schemes: ${err.message}</p>`;
    }
}

function injectSchemesDeadlineBanner() {
    const feed = document.getElementById('schemes-feed');
    if (!feed) return;
    const month = new Date().getMonth(); // 0=Jan
    let deadline = null, urgency = 'info';

    // Kharif enrollment: roughly June-July. Rabi: Oct-Nov.
    if (month >= 5 && month <= 6) {
        deadline = { label: '🛡️ PMFBY Kharif Enrollment', date: 'Deadline: ~31 July', msg: 'Enroll now to insure your Kharif crops. Deadline is typically end of July.', color: '#e65100' };
        urgency = 'urgent';
    } else if (month >= 9 && month <= 10) {
        deadline = { label: '🛡️ PMFBY Rabi Enrollment', date: 'Deadline: ~31 December', msg: 'Rabi crop insurance enrollment is open. Apply before year-end.', color: '#1565c0' };
    } else if (month === 3 || month === 4) {
        // April–May: PM-KISAN installment (April-July cycle)
        deadline = { label: '💰 PM-KISAN Installment', date: 'Current cycle: April–July', msg: 'Check your PM-KISAN payment status. If not received, verify e-KYC at pmkisan.gov.in.', color: '#2e7d32' };
    }

    if (!deadline) return;
    const banner = document.createElement('div');
    banner.style.cssText = `grid-column:1/-1; padding:12px 18px; background:#fff8e1; border:2px solid ${deadline.color}; border-radius:12px; display:flex; align-items:center; gap:14px;`;
    banner.innerHTML = `
        <div style="font-size:1.8rem;">⚠️</div>
        <div>
            <div style="font-weight:700; font-size:0.95rem; color:${deadline.color};">${escapeHtml(deadline.label)} — ${escapeHtml(deadline.date)}</div>
            <div style="font-size:0.82rem; color:#555; margin-top:2px;">${escapeHtml(deadline.msg)}</div>
        </div>`;
    feed.insertBefore(banner, feed.firstChild);
}

function renderSchemeCard(s) {
    const categoryColors = {
        'Income Support':   { bg: '#e8f5e9', border: '#4caf50', badge: '#2e7d32' },
        'Crop Insurance':   { bg: '#e3f2fd', border: '#1976d2', badge: '#0d47a1' },
        'Agricultural Credit': { bg: '#fff8e1', border: '#f9a825', badge: '#e65100' },
        'Irrigation Subsidy': { bg: '#e0f7fa', border: '#00838f', badge: '#006064' },
        'Market Access':    { bg: '#f3e5f5', border: '#7b1fa2', badge: '#4a148c' },
        'Soil Testing':     { bg: '#f1f8e9', border: '#558b2f', badge: '#33691e' },
        'Solar Energy':     { bg: '#fff3e0', border: '#ef6c00', badge: '#bf360c' }
    };
    const c = categoryColors[s.category] || { bg: '#fafafa', border: '#ccc', badge: '#555' };
    return `
    <div style="background:${c.bg}; border:1.5px solid ${c.border}; border-radius:14px; padding:20px; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:1.8rem;">${escapeHtml(s.emoji)}</span>
                <div>
                    <div style="font-weight:700; font-size:1rem; color:#1a1a1a;">${escapeHtml(s.name)}</div>
                    <div style="font-size:0.75rem; color:#555;">${escapeHtml(s.fullName)}</div>
                </div>
            </div>
            <span style="background:${c.badge}; color:#fff; border-radius:20px; padding:3px 10px; font-size:0.72rem; font-weight:600; white-space:nowrap;">${escapeHtml(s.category)}</span>
        </div>
        <div style="font-size:0.85rem; color:#333;">
            <div style="margin-bottom:6px;"><strong>💰 Benefit:</strong> ${escapeHtml(s.benefit)}</div>
            <div style="margin-bottom:6px;"><strong>📅 Cycle:</strong> ${escapeHtml(s.cycle)}</div>
            <div style="margin-bottom:6px;"><strong>✅ Who qualifies:</strong> ${escapeHtml(s.eligibility)}</div>
            ${s.exclusions !== 'None.' ? `<div style="margin-bottom:6px; color:#b71c1c;"><strong>⛔ Excludes:</strong> ${escapeHtml(s.exclusions)}</div>` : ''}
            <div style="margin-bottom:6px;"><strong>📋 How to apply:</strong> ${escapeHtml(s.howToApply)}</div>
            <div><strong>📞 Helpline:</strong> <a href="tel:${escapeHtml(s.helpline)}" style="color:#2e7d32; font-weight:600;">${escapeHtml(s.helpline)}</a></div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:4px;">
            <a href="${encodeURI(s.applyUrl)}" target="_blank" rel="noopener noreferrer"
                style="flex:1; min-width:120px; text-align:center; padding:8px 16px; background:#2e7d32; color:white; border-radius:8px; font-size:0.85rem; font-weight:600; text-decoration:none;">
                🌐 Apply Now
            </a>
            <span class="scheme-ai-badge" data-id="${escapeHtml(s.id)}" style="flex:1; min-width:120px; text-align:center; padding:8px 16px; background:#fff; border:1.5px solid ${c.border}; color:${c.badge}; border-radius:8px; font-size:0.8rem; font-weight:600; cursor:default;">
                ⏳ Run AI Check
            </span>
        </div>
    </div>`;
}

window.checkSchemeEligibility = async function() {
    const btn = document.getElementById('scheme-check-btn');
    const resultDiv = document.getElementById('scheme-eligibility-result');
    if (!btn || !resultDiv) return;

    if (!getGeminiKey()) {
        resultDiv.innerHTML = '<p style="color:#c00; font-size:0.85rem;">⚠️ Please set your Gemini API Key first (click the dot at the top-right of the dashboard).</p>';
        return;
    }

    // Get the state from saved user location via userData
    const state = window._userState || 'India';
    const crops = document.getElementById('scheme-crops').value.trim() || 'Unknown';
    const landOwnership = document.getElementById('scheme-land').value;
    const isLoanee = document.getElementById('scheme-loanee').value === 'yes';

    btn.disabled = true;
    btn.textContent = '⏳ Analyzing...';
    resultDiv.innerHTML = '<p style="color:#888; font-size:0.85rem;">Gemini is analyzing your profile against all 7 schemes...</p>';

    try {
        const res = await fetch('/api/schemes/eligibility', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'x-gemini-key': getGeminiKey() },
            body: JSON.stringify({ state, crops, landOwnership, isLoanee })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        renderEligibilityResult(data.eligibility);

        // Also update the AI badges on the scheme cards
        data.eligibility.forEach(e => {
            const badge = document.querySelector(`.scheme-ai-badge[data-id="${e.schemeId}"]`);
            if (badge) {
                const colors = { High: '#2e7d32', Medium: '#e65100', Low: '#757575' };
                const icons  = { High: '🟢', Medium: '🟡', Low: '⚪' };
                badge.textContent = `${icons[e.priority] || '•'} ${e.priority} Priority`;
                badge.style.background = '#fff';
                badge.style.color = colors[e.priority] || '#555';
                badge.title = e.verdict;
            }
        });
    } catch (err) {
        resultDiv.innerHTML = `<p style="color:#c00; font-size:0.85rem;">❌ ${err.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '🤖 Check My Eligibility';
    }
};

function renderEligibilityResult(eligibility) {
    const resultDiv = document.getElementById('scheme-eligibility-result');
    if (!resultDiv || !Array.isArray(eligibility)) return;

    const priorityOrder = { High: 0, Medium: 1, Low: 2 };
    const sorted = [...eligibility].sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

    const rows = sorted.map(e => {
        const icons  = { High: '🟢', Medium: '🟡', Low: '⚪' };
        const colors = { High: '#1b5e20', Medium: '#bf360c', Low: '#555' };
        return `<div style="padding:10px 0; border-bottom:1px solid #e0e0e0; display:flex; gap:12px; align-items:flex-start;">
            <span style="font-size:1.2rem; margin-top:2px;">${icons[e.priority] || '•'}</span>
            <div>
                <div style="font-weight:600; font-size:0.9rem; color:${colors[e.priority] || '#333'}; text-transform:uppercase; letter-spacing:0.5px;">${escapeHtml(e.schemeId)} — ${escapeHtml(e.priority)} Priority</div>
                <div style="font-size:0.85rem; color:#333; margin-top:2px;">${escapeHtml(e.verdict)}</div>
                <div style="font-size:0.8rem; color:#555; margin-top:4px;">💡 ${escapeHtml(e.tip)}</div>
            </div>
        </div>`;
    }).join('');

    resultDiv.innerHTML = `
        <div style="background:#fff; border-radius:10px; padding:12px 16px; border:1px solid #e0e0e0; margin-top:8px;">
            <div style="font-weight:700; color:#1b5e20; margin-bottom:10px; font-size:0.9rem;">📊 Your Personalized Scheme Priority List</div>
            ${rows}
            <p style="font-size:0.72rem; color:#aaa; margin:10px 0 0;">Powered by Gemini · Based on your stated profile. Always verify eligibility at official portals.</p>
        </div>`;
}

// ── WhatsApp Share ────────────────────────────────────────────────────────────
window.shareResultToWhatsApp = async function() {
    const r = _lastScanResult;
    // Build a clean, readable message from the result data (not raw DOM text)
    let msg;
    if (r) {
        const status = r.isHealthy ? '✅ Healthy' : `🔴 ${r.disease || 'Disease detected'}`;
        const lines = [
            '🌾 *PragatiPath Plant Scan Result*',
            '',
            `🌱 *Crop:* ${r.crop || 'Unknown'}`,
            `📋 *Condition:* ${status}`,
            `⚡ *Severity:* ${r.severity || 'N/A'}`,
            `🎯 *Confidence:* ${r.confidence || 'N/A'}`,
        ];
        if (!r.isHealthy && r.treatment) {
            lines.push('', `💊 *Treatment:* ${r.treatment}`);
        }
        if (r.prevention) {
            lines.push('', `🛡️ *Prevention:* ${r.prevention}`);
        }
        lines.push('', '_Scanned using PragatiPath · pragatipath.onrender.com_');
        msg = lines.join('\n');
    } else {
        msg = '🌾 *PragatiPath Plant Scan*\n\nScan your crops at pragatipath.onrender.com';
    }

    // Try Web Share API first — supports image + text and opens WhatsApp on mobile
    if (_lastScanFile && navigator.canShare && navigator.canShare({ files: [_lastScanFile] })) {
        try {
            await navigator.share({
                title: 'PragatiPath Plant Scan',
                text: msg,
                files: [_lastScanFile]
            });
            return; // done — native share sheet opened
        } catch (err) {
            if (err.name === 'AbortError') return; // user cancelled — do nothing
            // any other error → fall through to WhatsApp URL
        }
    }

    // Fallback: open WhatsApp web with text-only (desktop / unsupported browsers)
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
};

// ── Language-Aware YouTube Search ─────────────────────────────────────────────
// Reads the Google Translate cookie to detect the selected language.
// Returns a localised search query and lang code for YouTube.
function getYouTubeSearchLang() {
    // Google Translate sets a cookie: googtrans=/en/hi  (source/target)
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('googtrans='));
    if (!cookie) return { lang: 'en', suffix: 'in English' };

    const parts = cookie.trim().replace('googtrans=', '').split('/').filter(Boolean);
    const target = parts[1] || 'en'; // e.g. 'hi', 'bn', 'ta', 'te', 'mr'

    const langMap = {
        'hi': { suffix: 'in Hindi',   yt: 'hi' },
        'bn': { suffix: 'in Bengali', yt: 'bn' },
        'ta': { suffix: 'in Tamil',   yt: 'ta' },
        'te': { suffix: 'in Telugu',  yt: 'te' },
        'mr': { suffix: 'in Marathi', yt: 'mr' },
        'gu': { suffix: 'in Gujarati',yt: 'gu' },
        'kn': { suffix: 'in Kannada', yt: 'kn' },
        'ml': { suffix: 'in Malayalam', yt: 'ml' },
        'pa': { suffix: 'in Punjabi', yt: 'pa' },
    };
    return langMap[target] || { suffix: 'for Indian farmers', yt: 'en' };
}


// ── Weather-Aware Greeting (zero extra requests) ──────────────────────────────
// Called after _lastWeatherData is populated by the weather fetch.
// Replaces static "Welcome" with a contextual one-line tip.
function updateWeatherGreeting() {
    if (!_lastWeatherData) return;
    const h1 = document.querySelector('#dashboard .dashboard-header h1');
    if (!h1) return;

    const { weather, temp } = _lastWeatherData;
    const cond = (weather || '').toLowerCase();
    let tip = null;

    if (cond.includes('rain') || cond.includes('drizzle') || cond.includes('thunder')) {
        tip = '🌧️ Rain today — delay pesticide/fertilizer application';
    } else if (temp > 38) {
        tip = '🌡️ Heat alert — water your crops early morning or evening';
    } else if (temp < 12) {
        tip = '🥶 Cold night ahead — protect tender seedlings from frost';
    } else if (cond.includes('mist') || cond.includes('fog') || cond.includes('haze')) {
        tip = '🌫️ Low visibility — check for fungal risk on stored produce';
    }

    if (!tip) return;
    // Insert tip as a small subtitle below h1, only if not already added
    if (document.getElementById('weather-greeting-tip')) return;
    const tipEl = document.createElement('p');
    tipEl.id = 'weather-greeting-tip';
    tipEl.style.cssText = 'margin:4px 0 0; font-size:0.82rem; color:#e65100; font-weight:600;';
    tipEl.textContent = tip;
    h1.insertAdjacentElement('afterend', tipEl);
}