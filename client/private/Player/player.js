let player;
let watchSeconds = 0;
let timer = null;
const PROGRESS_REPORT_INTERVAL = 30;
let lastReportedSeconds = 0;
let userName = 'Student';
let courseCompleted = false;

// ── YouTube API readiness coordination ───────────────────────────────────────
// Either the API fires first (ytAPIReady = true) or the iframe is injected
// first (iframeReady = true). initPlayer() waits for BOTH before constructing
// YT.Player — eliminating the race condition that broke event attachment.
let ytAPIReady   = false;
let iframeReady  = false;

window.onYouTubeIframeAPIReady = function () {
    ytAPIReady = true;
    if (iframeReady) initPlayer();
};

function initPlayer() {
    player = new YT.Player('yt-player', {
        events: { onStateChange: onPlayerStateChange }
    });
}

// ─────────────────────────────────────────────────────────────────────────────

async function fetchCourseData() {
    const name = localStorage.getItem('courseName');
    if (!name) {
        window.location.href = window.location.origin + '/private/Dashboard/dashboard.html';
        return;
    }

    const response = await fetch(window.location.origin + `/api/getcourse/name/${name}`);
    const data = await response.json();
    if (data.error) {
        window.location.href = window.location.origin + '/private/Dashboard/dashboard.html';
        return;
    }

    document.getElementById('course-title').textContent = data.name;
    document.getElementById('course-desc').textContent  = data.description;
    document.getElementById('course-lang').textContent  = data.medium;

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

    // Iframe is now in the DOM — signal readiness and init if API is also ready
    iframeReady = true;
    if (ytAPIReady) initPlayer();

    try {
        const chres  = await fetch(window.location.origin + `/api/youtubechannel/${localStorage.getItem("coursePlaylist")}`);
        const chdata = await chres.json();
        if (!chdata.error) {
            document.getElementById('channel-img').src         = chdata.channelThumbnail;
            document.getElementById('channel-name').textContent = chdata.channelTitle;
            document.getElementById('channel-desc').textContent = chdata.channelDescription;
            document.getElementById('channel-link').href        = `https://www.youtube.com/channel/${chdata.channelId}`;
            document.getElementById('channel-link').target      = '_blank';
            document.getElementById('channel-link').rel         = 'noopener noreferrer';
            document.getElementById('channel-link').textContent = chdata.channelTitle;
        }
    } catch (_) {}
}

function unlockCertificate(courseName) {
    if (courseCompleted) return;
    courseCompleted = true;

    clearInterval(timer);

    const remainingDelta = watchSeconds - lastReportedSeconds;
    if (remainingDelta > 0) reportProgress(remainingDelta);

    if (!document.querySelector('.cert-btn')) {
        const container = document.querySelector('.video-preview');
        const certBtn   = document.createElement('button');
        certBtn.innerText          = '🎉 DOWNLOAD CERTIFICATE 🎉';
        certBtn.className          = 'cert-btn';
        certBtn.style.display      = 'block';
        certBtn.style.marginTop    = '2rem';
        certBtn.style.padding      = '1rem 2rem';
        certBtn.style.fontSize     = '1.5rem';
        certBtn.style.background   = '#4CAF50';
        certBtn.style.color        = 'white';
        certBtn.style.border       = 'none';
        certBtn.style.borderRadius = '8px';
        certBtn.style.cursor       = 'pointer';
        certBtn.style.width        = '100%';
        certBtn.style.fontWeight   = 'bold';
        certBtn.style.boxShadow    = '0 4px 12px rgba(0,0,0,0.25)';
        certBtn.onclick = () => {
            localStorage.setItem('cert_name',   userName);
            localStorage.setItem('cert_course', courseName);
            localStorage.setItem('cert_date',   new Date().toLocaleDateString());
            window.location.href = '../Certificate Generator/cert.html';
        };
        container.appendChild(certBtn);
    }

    setTimeout(() => {
        alert('🎉 Congratulations! You have completed the course!\n\nScroll down and click the big green button to download your certificate!');
    }, 300);
}

async function reportProgress(deltaSeconds) {
    const courseName = localStorage.getItem('courseName');
    if (!courseName || deltaSeconds <= 0) return;

    const duration       = player ? player.getDuration() : 0;
    const base           = duration > 0 ? duration : 1200;
    const percentIncrement = (deltaSeconds / base) * 100;

    try {
        await fetch('/api/updcourseprog', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ courseName, progress: percentIncrement })
        });
    } catch (err) {
        console.warn('[Progress] Could not sync:', err);
    }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        clearInterval(timer); // guard: clear any dangling timer before starting
        const courseName = localStorage.getItem('courseName');

        timer = setInterval(() => {
            watchSeconds++;
            const courseId = localStorage.getItem('courseId');
            localStorage.setItem(`watched_${courseId}`, watchSeconds);

            // Position-based completion — works for both single videos and playlists
            if (!courseCompleted && player) {
                const currentTime = player.getCurrentTime();
                const duration    = player.getDuration();
                if (duration > 0 && currentTime >= duration * 0.95) {
                    unlockCertificate(courseName);
                }
            }

            const delta = watchSeconds - lastReportedSeconds;
            if (delta >= PROGRESS_REPORT_INTERVAL) {
                lastReportedSeconds = watchSeconds;
                reportProgress(delta);
            }
        }, 1000);

    } else {
        clearInterval(timer);

        const delta = watchSeconds - lastReportedSeconds;
        if (delta > 0) {
            lastReportedSeconds = watchSeconds;
            reportProgress(delta);
        }
    }
}

// Load YouTube IFrame API
const ytScript  = document.createElement('script');
ytScript.src    = 'https://www.youtube.com/iframe_api';
document.head.appendChild(ytScript);

// Boot sequence
window.addEventListener('load', async () => {
    const courseId = localStorage.getItem('courseId');
    if (courseId) {
        watchSeconds        = parseInt(localStorage.getItem(`watched_${courseId}`)) || 0;
        lastReportedSeconds = watchSeconds;
    }

    try {
        const res         = await fetch('/api/userinfo');
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            userName   = data.fullName || data.name || 'Student';
        }
    } catch (_) {}

    fetchCourseData();
});
