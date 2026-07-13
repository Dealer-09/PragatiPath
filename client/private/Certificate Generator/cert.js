function downloadCertificate() {
    const name = localStorage.getItem('cert_name') || 'Student';
    const course = localStorage.getItem('cert_course') || 'Course';
    const date = localStorage.getItem('cert_date') || new Date().toLocaleDateString();

    document.getElementById('name').innerText = name;
    document.getElementById('course').innerText = course;
    document.getElementById('date').innerText = date;

    const element = document.getElementById('certificate');
    const opt = {
        margin: 0,
        filename: `${name}_${course}_certificate.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(element).save();
}

// Auto-populate on page load
window.addEventListener('load', () => {
    const name   = localStorage.getItem('cert_name');
    const course = localStorage.getItem('cert_course');
    const date   = localStorage.getItem('cert_date') || new Date().toLocaleDateString();

    // Guard: redirect to dashboard if navigated here directly without a completed course
    if (!name || !course) {
        window.location.href = window.location.origin + '/private/Dashboard/dashboard.html';
        return;
    }

    document.getElementById('name').innerText   = name;
    document.getElementById('course').innerText = course;
    document.getElementById('date').innerText   = date;
});
