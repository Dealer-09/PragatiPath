let player;
let watchSeconds = 0;
let timer = null;
const PROGRESS_REPORT_INTERVAL = 30; // send progress to server every 30 seconds
let lastReportedSeconds = 0;

async function fetchCourseData() {
    const name = localStorage.getItem('courseName');
    const response = await fetch(window.location.origin + `/api/getcourse/name/${name}`);
    const data = await response.json();

    document.getElementById('course-title').textContent = data.name;
    document.getElementById('course-desc').textContent = data.description;
    document.getElementById('course-lang').textContent = data.medium;

    const container = document.querySelector('.video-preview');
    container.innerHTML = `
        <iframe id="yt-player" class="course-data"
            src="https://www.youtube.com/embed/videoseries?list=${localStorage.getItem("coursePlaylist")}&enablejsapi=1"
            title="${data.name}"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen>
        </iframe>`;

    try {
        const chres = await fetch(window.location.origin + `/api/youtubechannel/${localStorage.getItem("coursePlaylist")}`);
        const chdata = await chres.json();
        if (!chdata.error) {
            document.getElementById('channel-img').src = chdata.channelThumbnail;
            document.getElementById('channel-name').textContent = chdata.channelTitle;
            document.getElementById('channel-desc').textContent = chdata.channelDescription;
            document.getElementById('channel-link').href = `https://www.youtube.com/channel/${chdata.channelId}`;
            document.getElementById('channel-link').target = "_blank";
            document.getElementById('channel-link').rel = "noopener noreferrer";
            document.getElementById('channel-link').textContent = chdata.channelTitle;
        }
    } catch (_) {
        // YouTube API key not set — skip channel info gracefully
    }

    checkCertificateEligibility(data.name);
}

function checkCertificateEligibility(courseName) {
    const courseId = localStorage.getItem("courseId");
    const watched = parseInt(localStorage.getItem(`watched_${courseId}`)) || 0;
    const estimatedDuration = 1200; // 20 minutes = considered complete

    if (watched >= estimatedDuration) {
        const container = document.querySelector('.video-preview');
        const certBtn = document.createElement('button');
        certBtn.innerText = "🎉 Download Certificate";
        certBtn.className = "cert-btn";
        certBtn.style.marginTop = "1rem";
        certBtn.onclick = () => {
            localStorage.setItem("cert_name", "Student"); // actual name from user profile could be set here
            localStorage.setItem("cert_course", courseName);
            localStorage.setItem("cert_date", new Date().toLocaleDateString());
            window.location.href = "../Certificate Generator/cert.html";
        };
        container.appendChild(certBtn);
    }
}

// Send accumulated progress to server
async function reportProgress(seconds) {
    const courseName = localStorage.getItem('courseName');
    if (!courseName || seconds <= 0) return;

    try {
        await fetch('/api/updcourseprog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                courseName,
                progress: seconds   // server adds this to existing progress
            })
        });
    } catch (err) {
        console.warn('[Progress] Could not sync progress to server:', err);
    }
}

window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('yt-player', {
        events: {
            'onStateChange': onPlayerStateChange
        }
    });
};

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        timer = setInterval(() => {
            watchSeconds++;
            const courseId = localStorage.getItem("courseId");

            // Persist locally every second
            localStorage.setItem(`watched_${courseId}`, watchSeconds);

            // Report to server every PROGRESS_REPORT_INTERVAL seconds
            const delta = watchSeconds - lastReportedSeconds;
            if (delta >= PROGRESS_REPORT_INTERVAL) {
                lastReportedSeconds = watchSeconds;
                reportProgress(delta);
            }
        }, 1000);
    } else {
        clearInterval(timer);

        // Flush any remaining unreported progress when paused/ended
        const delta = watchSeconds - lastReportedSeconds;
        if (delta > 0) {
            lastReportedSeconds = watchSeconds;
            reportProgress(delta);
        }

        // Check cert eligibility after each pause
        const courseName = localStorage.getItem('courseName');
        if (courseName) checkCertificateEligibility(courseName);
    }
}

// Load the YouTube IFrame API
const ytScript = document.createElement('script');
ytScript.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(ytScript);

// Load watched seconds from localStorage on startup
window.addEventListener('load', () => {
    const courseId = localStorage.getItem("courseId");
    if (courseId) {
        watchSeconds = parseInt(localStorage.getItem(`watched_${courseId}`)) || 0;
        lastReportedSeconds = watchSeconds;
    }
    fetchCourseData();
});
