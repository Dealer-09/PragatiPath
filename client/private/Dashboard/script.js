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

function openKeyModal() {
    document.getElementById('key-modal-overlay').style.display = 'block';
    document.getElementById('key-modal').style.display = 'flex';
    const input = document.getElementById('key-input');
    input.value = getGeminiKey();
    document.getElementById('key-modal-status').textContent = '';
    setTimeout(() => input.focus(), 50);
}

function closeKeyModal() {
    document.getElementById('key-modal-overlay').style.display = 'none';
    document.getElementById('key-modal').style.display = 'none';
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
    setTimeout(closeKeyModal, 900);
}

function clearGeminiKey() {
    localStorage.removeItem('gemini_api_key');
    document.getElementById('key-input').value = '';
    updateKeyStatusDot();
    document.getElementById('key-modal-status').style.color = '#c00';
    document.getElementById('key-modal-status').textContent = 'Key cleared.';
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
        noteElement.innerHTML = `
            <span class="note-text">${note}</span>
            <button class="delete-note" data-index="${index}">×</button>
        `;
        notesList.appendChild(noteElement);
    });

    document.querySelectorAll('.delete-note').forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            deleteNote(index);
        });
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

    function addMessage(message, isUser) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add(isUser ? 'user-message' : 'bot-message');
        messageDiv.innerHTML = marked.parse(message);
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;

        return messageDiv;
    }

    async function processMessage() {
        const message = chatInput.value.trim();
        if (message === '') return;

        addMessage(message, true);
        chatInput.value = '';
        
        const msgDiv = addMessage("...", false);
        const res = await fetch('/api/gemini/chat', {
            method: 'POST',
            headers: geminiHeaders(),
            body: JSON.stringify({ query: message })
        });

        const data = await res.json();
        if (data.error) {
            const errMsg = data.error.includes('No Gemini API key')
                ? 'No API key set. Click 🔑 API Key in the header to add yours.'
                : 'Error: ' + data.error;
            msgDiv.innerHTML = errMsg;
        } else {
            msgDiv.innerHTML = marked.parse(data.response);
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
    const res = await fetch('/api/removecourse', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            courseName: button.dataset.coursename
        })
    });
    const data = await res.json();
    if (data.error) {
        console.error("Error unenrolling course:", data.error);
        location.reload();
    } else {
        location.reload();
    }
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
        const res = await req.json();
        userData = res;

        // fullName may be empty for older accounts, fall back to name
        document.getElementById("username").innerText = userData.fullName || userData.name || "Farmer";
        if (userData.imgUrl) {
            document.getElementById("profilePic").innerHTML = `<img src="${userData.imgUrl}" alt="Profile Picture" />`;
        }

        const mycoursesContainer = document.querySelector('.course-cards-container');
        const enrolledCourses = userData.enrolledCourses || [];

        if (enrolledCourses.length === 0) {
            mycoursesContainer.innerHTML = '<p style="color:#888">No courses enrolled yet. Browse courses below!</p>';
        }

        let shown = 0;
        for (const enrollment of enrolledCourses) {
            if (shown++ >= 3) break; // show only first 3

            // enrolledCourses is now [{name, progress}] objects
            const courseName = typeof enrollment === 'object' ? enrollment.name : enrollment;
            const progress = typeof enrollment === 'object' ? enrollment.progress : 0;

            const courseRes = await fetch(`/api/getcourse/name/${courseName}`);
            const courseData = await courseRes.json();
            if (courseData.error) continue;

            const imgRes = await fetch(window.location.origin + `/api/youtubethumb/${courseData.playlist}`);
            const imgData = await imgRes.json();

            const courseCard = document.createElement('div');
            courseCard.classList.add('dashboard-course-card');
            courseCard.innerHTML = `
                <img src="${imgData.img || ''}" alt="${courseName}" />
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


//ai-toolkit js ── Plant Disease Detection (dual-mode)
// Primary:  Gemini Vision  (when X-Gemini-Key is set)
// Fallback: ViT-tiny ONNX  (wambugu71/crop_leaf_diseases_vit, INT8 quantized, ~5MB)
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
        plantModeBadge.textContent = '📴 Offline ViT';
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

function renderOfflineResult(top5) {
    if (!top5 || top5.length === 0) {
        predictionText.innerHTML = `<div class="plant-result"><p style="color:#888">⚠️ Could not identify the plant. Try a clearer close-up of a single leaf.</p></div>`;
        return;
    }

    const best       = top5[0];
    const confidence = (best.confidence * 100).toFixed(1);

    if (best.confidence < 0.40) {
        predictionText.innerHTML = `
            <div class="plant-result">
                <p style="color:#888">⚠️ Low confidence (${confidence}%) — couldn't identify.<br>
                Try a clearer close-up in good lighting.</p>
                <p class="plant-result-source">Offline ViT · Set a Gemini key for smarter results</p>
            </div>`;
        return;
    }

    // Parse "Crop___Disease" label format
    const parseLabel = (raw) => {
        const parts = raw.replace(/[()]/g, '').split('___');
        const crop    = (parts[0] || 'Unknown').replace(/_/g, ' ').trim();
        const disease = (parts[1] || 'Unknown').replace(/_/g, ' ').trim();
        return { crop, disease, healthy: (parts[1] || '').toLowerCase() === 'healthy' };
    };

    const { crop, disease, healthy } = parseLabel(best.label);

    // Build top-3 alternatives row
    const altRows = top5.slice(1, 3).map(t => {
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
            <p class="plant-result-source">Offline ViT-tiny · 98% benchmark accuracy · Set a Gemini key for treatment advice</p>
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
                headers: { 'Content-Type': 'application/json', 'x-gemini-key': key },
                body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' })
            });
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

            const top5 = await PlantViT.predict(plantImg, (msg) => {
                predictionText.innerHTML = `<p style="color:#888">⏳ ${msg}</p>`;
            });
            renderOfflineResult(top5);
        } catch (err) {
            predictionText.innerHTML = `<p style="color:#c00">❌ Offline model error: ${err.message}</p>`;
        }
    }

    plantSpinner.style.display = 'none';
}

plantUpload.addEventListener('change', (e) => analyzeImage(e.target.files[0]));
plantUploadCamera.addEventListener('change', (e) => analyzeImage(e.target.files[0]));

const weatherDiv = document.getElementById('weatherResult');



let tfModel = null;
let tfClassList = null;
let tfModelLoading = false;

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
        plantModeBadge.textContent = '📴 Offline Model';
        plantModeBadge.className = 'plant-mode-badge offline';
    }
}

// Lazy-load TF.js model only when needed (offline fallback)
async function ensureTFModel() {
    if (tfModel) return true;
    if (tfModelLoading) return false;
    tfModelLoading = true;
    try {
        predictionText.innerHTML = '<p style="color:#888">⏳ Loading offline model (~13 MB)...</p>';
        tfClassList = await (await fetch(window.location.origin + '/public/assets/plant-disease-tfjs-default-v1/class_indices.json')).json();
        tfModel = await tf.loadLayersModel(
            window.location.origin + '/public/assets/plant-disease-tfjs-default-v1/model.json',
            { fromTFHub: false }
        );
        predictionText.innerHTML = '';
        return true;
    } catch (e) {
        predictionText.innerHTML = '<p style="color:#c00">❌ Failed to load offline model.</p>';
        tfModelLoading = false;
        return false;
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

function renderTFResult(classList, predictions) {
    const topIdx  = predictions.indexOf(Math.max(...predictions));
    const confidence = (Math.max(...predictions) * 100).toFixed(1);
    if (confidence < 50) {
        predictionText.innerHTML = `
            <div class="plant-result">
                <p style="color:#888">⚠️ Couldn't identify the plant with confidence (${confidence}%).<br>
                Try a clearer close-up of a single leaf in good lighting.</p>
                <p class="plant-result-source">Offline Model · Set an API key for better results</p>
            </div>`;
        return;
    }
    const parts   = (classList[topIdx] || '').split('___');
    const crop    = (parts[0] || 'Unknown').replace(/_/g, ' ');
    const disease = (parts[1] || 'Unknown').replace(/_/g, ' ');
    const healthy = disease.toLowerCase() === 'healthy';
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
            <p class="plant-result-source">Offline Model · Set a Gemini key for treatment advice</p>
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
                headers: { 'Content-Type': 'application/json', 'x-gemini-key': key },
                body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            renderGeminiResult(data);
        } catch (err) {
            predictionText.innerHTML = `<p style="color:#c00">❌ Gemini error: ${err.message}</p>`;
        }
    } else {
        // ── TF.js offline fallback ──
        const loaded = await ensureTFModel();
        if (!loaded) { plantSpinner.style.display = 'none'; return; }

        plantImg.onload = async () => {
            const tensor = tf.browser.fromPixels(plantImg)
                .resizeNearestNeighbor([224, 224])
                .toFloat().div(tf.scalar(255.0)).expandDims();
            const predictions = Array.from(await tfModel.predict(tensor).data());
            renderTFResult(tfClassList, predictions);
            tensor.dispose();
            plantSpinner.style.display = 'none';
        };
        return; // onload handles the rest
    }

    plantSpinner.style.display = 'none';
}

plantUpload.addEventListener('change', (e) => analyzeImage(e.target.files[0]));
plantUploadCamera.addEventListener('change', (e) => analyzeImage(e.target.files[0]));

const weatherDiv = document.getElementById('weatherResult');

// Weather by coordinates (for location-based fetch)
async function getWeatherByCoords(lat, lon) {
    try {
        const wres = await fetch(window.location.origin + `/api/openweather/${lat}/${lon}`);
        const data = await wres.json();
        weatherDiv.innerHTML =
            `<p><strong>${data.name}</strong></p>
            <p>Temperature: ${data.temp}°C</p>
            <p>Weather: ${data.weather}</p>
            <p>Humidity: ${data.humidity}%</p>
            <p>Wind Speed: ${data.wind} m/s</p>`;
        //Farming Suggestions
        const farmingSuggestion = getFarmingSuggestion(data);
        weatherDiv.innerHTML += `<p style="color: green;"><strong>Farming Tip:</strong> ${farmingSuggestion}</p>`;

    } catch (error) {
        console.log(error);
        weatherDiv.innerHTML = '<p>Weather data not available!</p>';
    }
}

function getWeather() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            console.log(`Your location: ${lat}, ${lon}`);
            getWeatherByCoords(lat, lon);
        }, () => {
            alert("Unable to fetch location. Allow location access.");
        });
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}

// Map Initialization
function initMap(lat, lon) {
    const map = L.map('map', {
        zoomControl: true
    }).setView([lat, lon], 10);

    // L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
        keepBuffer: 8,
    }).addTo(map);

    L.marker([lat, lon]).addTo(map)
        .bindPopup('You are here!')
        .openPopup();
}

// Get Location and Start Map + Weather
function getLocationAndStart() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            console.log(`Your location: ${lat}, ${lon}`);
            initMap(lat, lon);
            getWeatherByCoords(lat, lon);
        }, () => {
            alert("Unable to fetch location. Allow location access.");
        });
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}
function getFarmingSuggestion(weatherData) {
    const temp = weatherData.temp;
    const humidity = weatherData.humidity;
    const mainWeather = weatherData.weather.toLowerCase();

    if (temp > 32 && humidity < 40) {
        return "Consider drought-resistant crops like millet, sorghum, or chickpeas.";
    }
    if (humidity > 75) {
        return "High humidity detected. Monitor for fungal infections and use proper fungicides.";
    }
    if (mainWeather.includes("rain")) {
        return "Heavy rains expected. Ensure proper water drainage in fields.";
    }
    if (temp >= 20 && temp <= 25) {
        return "Ideal conditions for planting vegetables like tomatoes, peppers, and lettuce.";
    }
    return "Weather looks normal. Continue regular farming practices.";
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
            weatherDiv.innerHTML = '<p>Unable to fetch location. Allow location access.</p>';
        });
    } else {
        weatherDiv.innerHTML = '<p>Geolocation not supported by this browser.</p>';
    }
}

// Email Validation and Sending
//   email 
function validate(){
    let name= document.querySelector(".name");
    let email= document.querySelector(".email");
    let msg= document.querySelector(".message");
    let sendBtn= document.querySelector(".send-btn");
    sendBtn.addEventListener('click',(e)=>{
        e.preventDefault();
        if(name.value == "" || email.value == "" || msg.value== ""){
            emptyerror();
        }else{
            sendmail (name.value, email.value, msg.value);
            success();
        }
    });

}
validate();
function sendmail(name,email,msg)
{
    emailjs.send("service_zuh4atp","template_q2td4se",{
        from_name: email,
        to_name: name,
        message: msg,
        });
}
function emptyerror()
{
    swal({
        title: "Complete All The Sections",
        text: "Fields cant be empty",
        icon: "error",
      });
}
function success()
{
    swal({
        title: "Email Sent Succesfully",
        text: "We will Try To Rspond In 24 Hours",
        icon: "success",
      });
}

async function logout() {
    await Clerk.signOut();
    window.location.href = window.location.origin + '/private/logout';
}

// course js @Rouvik Maji
async function listCourses() {
    const res = await fetch('/api/getcourses');
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
        const data = await res.json();
        if (data.error) console.warn("Enroll note:", data.error);
    } catch (err) {
        console.warn("Could not enroll:", err);
    }

    window.location.href = window.location.origin + '/private/Player/player.html';
}
/*async function listCourses() {
    const res = await fetch('/api/getcourses');
    const data = await res.json();
    const courseList = document.querySelector('.courses-grid');

    for (const course of data) {
        const card = document.createElement('div');
        card.classList.add('course-card');

        const imgres = await fetch(window.location.origin + `/api/youtubethumb/${course.playlist}`);
        const imgdata = await imgres.json();

        const watchedSeconds = localStorage.getItem(`watched_${course._id}`) || 0;
        const estimatedDuration = 1200; 
        const progress = Math.min(watchedSeconds / estimatedDuration, 1);

        card.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress * 100}%;"></div>
            </div>
            <img src="${imgdata.img}" alt="Playlist image" />
            <h3>${course.name}</h3>
            <p>${course.description}</p>
            <p><b>Medium</b>: ${course.medium}</p>
            <button class="enroll-btn"
                data-coursename="${course.name}"
                data-courseplaylist="${course.playlist}"
                data-courseid="${course._id}"
                onclick="courseHandler(this);">Watch</button>
        `;

        courseList.appendChild(card);
    }
}
*/