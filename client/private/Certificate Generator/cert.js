function downloadCertificate() {
    const name   = localStorage.getItem('cert_name')   || 'Student';
    const course = localStorage.getItem('cert_course') || 'Course';
    const date   = localStorage.getItem('cert_date')   || new Date().toLocaleDateString();

    document.getElementById('name').innerText   = name;
    document.getElementById('course').innerText = course;
    document.getElementById('date').innerText   = date;

    const element = document.getElementById('certificate');
    const opt = {
        margin:     0,
        filename:   `${name}_${course}_certificate.pdf`,
        image:      { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF:      { unit: 'in', format: 'letter', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(element).save();
}

// Auto-populate on page load — verifies completion server-side before rendering
window.addEventListener('load', async () => {
    const name   = localStorage.getItem('cert_name');
    const course = localStorage.getItem('cert_course');
    const date   = localStorage.getItem('cert_date') || new Date().toLocaleDateString();

    // Guard: redirect if navigated here without a completed course in localStorage
    if (!name || !course) {
        window.location.href = window.location.origin + '/private/Dashboard/dashboard.html';
        return;
    }

    // Server-side verification: confirm the course is in completedCourses before rendering
    try {
        const res = await fetch('/api/userinfo', { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Auth failed');
        const ct = res.headers.get('content-type');
        if (!ct || !ct.includes('application/json')) throw new Error('Not JSON');

        const data = await res.json();
        const completed = data.completedCourses || [];

        if (!completed.includes(course)) {
            // Course not actually completed — block certificate
            document.body.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#c62828;text-align:center;padding:20px;">
                    <h2>&#128274; Certificate Not Available</h2>
                    <p>You haven't completed <strong>${course}</strong> yet.</p>
                    <p>Watch at least 95% of the course to unlock your certificate.</p>
                    <a href="/private/Dashboard/dashboard.html" style="margin-top:20px;padding:10px 24px;background:#2e7d32;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">
                        &#8592; Back to Dashboard
                    </a>
                </div>`;
            return;
        }
    } catch (err) {
        // If server check fails (network issue), fall through and allow rendering
        // so a connectivity blip doesn't permanently block a genuine graduate
        console.warn('[Cert] Server verification failed, rendering anyway:', err.message);
    }

    document.getElementById('name').innerText   = name;
    document.getElementById('course').innerText = course;
    document.getElementById('date').innerText   = date;
});
