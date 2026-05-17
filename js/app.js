// homesly-hr/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    // --- LOCAL STORAGE STATE MANAGEMENT ---
    const STORAGE_KEY = 'homesly_hr_state';

    let defaultState = {
        attendance: {
            isClockedIn: false,
            clockInTime: null,
            totalSeconds: 0,
            history: [] // { date, in, out, total, status, statClass }
        },
        profile: {
            name: 'Sarah Jen',
            email: 'sarah.jen@homesly.com',
            phone: '+44 20 7123 4567',
            dob: '1990-05-15',
            gender: 'female',
            avatar: 'https://ui-avatars.com/api/?name=Sarah+Jen&background=4F46E5&color=fff'
        },
        leaves: [] // future use for leave tracking
    };

    let appState = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!appState.attendance) appState.attendance = defaultState.attendance;
    if (!appState.profile) appState.profile = defaultState.profile;

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    }

    // --- CONFIG ---
    const gmtFormat = { timeZone: 'Europe/London' };

    // --- ROUTING (SPA) ---
    const navLinks = document.querySelectorAll('.nav-link');
    const viewSections = document.querySelectorAll('.view-section');
    const pageTitleText = document.getElementById('pageTitleText');

    function navigateTo(hash) {
        if (!hash || hash === '') hash = '#dashboard';
        viewSections.forEach(sec => sec.style.display = 'none');
        navLinks.forEach(nav => nav.classList.remove('active'));

        let targetNav = document.querySelector(`.nav-link[href="${hash}"]`);
        if (!targetNav) { targetNav = document.querySelector('.nav-link[href="#dashboard"]'); hash = '#dashboard'; }

        if (targetNav) {
            const targetViewId = targetNav.getAttribute('data-target');
            const targetView = document.getElementById(targetViewId);
            if (targetView) targetView.style.display = 'block';
            targetNav.classList.add('active');

            const titleMap = {
                '#dashboard': 'Dashboard',
                '#attendance': 'Attendance Records',
                '#timeoff': 'Time Off',
                '#directory': 'Employee Directory',
                '#settings': 'Account Settings'
            };
            if (pageTitleText) pageTitleText.textContent = titleMap[hash] || 'Dashboard';
        }
    }

    navigateTo(window.location.hash);
    window.addEventListener('hashchange', () => navigateTo(window.location.hash));

    // --- UI POPULATION ---
    function initializeUI() {
        // Date
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', ...gmtFormat };
        const dateDisplay = document.getElementById('currentDateDisplay');
        if (dateDisplay) dateDisplay.textContent = new Date().toLocaleDateString('en-GB', dateOptions) + ' (GMT)';

        // Profile Details
        const sidebarName = document.getElementById('sidebarName');
        const sidebarAvatar = document.getElementById('sidebarAvatar');
        if (sidebarName) sidebarName.textContent = appState.profile.name;
        if (sidebarAvatar) sidebarAvatar.src = appState.profile.avatar;

        const sName = document.getElementById('settingsName');
        const sEmail = document.getElementById('settingsEmail');
        const sPhone = document.getElementById('settingsPhone');
        const sDob = document.getElementById('settingsDob');
        const sGender = document.getElementById('settingsGender');
        const sAvatarPreview = document.getElementById('settingsAvatarPreview');

        if (sName) sName.value = appState.profile.name;
        if (sEmail) sEmail.value = appState.profile.email;
        if (sPhone) sPhone.value = appState.profile.phone;
        if (sDob) sDob.value = appState.profile.dob;
        if (sGender) sGender.value = appState.profile.gender;
        if (sAvatarPreview) sAvatarPreview.src = appState.profile.avatar;
    }
    initializeUI();

    // --- LIVE CLOCK ---
    const timeDisplay = document.getElementById('currentTimeDisplay');
    function updateLiveClock() {
        if (timeDisplay) {
            timeDisplay.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', ...gmtFormat });
        }
    }
    setInterval(updateLiveClock, 1000);
    updateLiveClock();

    // --- ATTENDANCE SYSTEM ---
    let timerInterval = null;
    const btnClockIn = document.getElementById('clockInBtn');
    const btnClockOut = document.getElementById('clockOutBtn');
    const valClockIn = document.getElementById('valClockIn');
    const valClockOut = document.getElementById('valClockOut');
    const valTotalHours = document.getElementById('valTotalHours');

    function formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}h ${m}m ${s}s`;
    }

    function renderAttendanceState() {
        if (appState.attendance.isClockedIn) {
            btnClockIn.disabled = true;
            btnClockOut.disabled = false;
            btnClockOut.classList.remove('btn-secondary');
            btnClockOut.classList.add('btn-danger');

            const inTimeStr = new Date(appState.attendance.clockInTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...gmtFormat });
            valClockIn.textContent = inTimeStr;
            valClockOut.textContent = '--:--';

            // Re-sync correct elapsed difference based on actual GMT times to prevent drift when tab closes
            const nowTime = new Date().getTime();
            const pastTime = new Date(appState.attendance.clockInTime).getTime();
            appState.attendance.totalSeconds = Math.floor((nowTime - pastTime) / 1000);

            if (!timerInterval) {
                timerInterval = setInterval(() => {
                    appState.attendance.totalSeconds++;
                    valTotalHours.textContent = formatDuration(appState.attendance.totalSeconds);
                    saveState();
                }, 1000);
            }
        } else {
            btnClockIn.disabled = false;
            btnClockOut.disabled = true;
            btnClockOut.classList.remove('btn-danger');
            btnClockOut.classList.add('btn-secondary');

            valClockIn.textContent = '--:--';
            valClockOut.textContent = '--:--';
            valTotalHours.textContent = '0h 0m';
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        }
        renderHistoryTable();
    }

    function renderHistoryTable() {
        const historyTable = document.getElementById('attendanceHistoryTable');
        const fullTable = document.getElementById('fullAttendanceTable');
        if (!historyTable && !fullTable) return;

        let activeRow = "";
        if (appState.attendance.isClockedIn) {
            const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };
            const rowIn = new Date(appState.attendance.clockInTime).toLocaleTimeString('en-GB', timeOpts);
            const rHours = Math.floor(appState.attendance.totalSeconds / 3600);
            const rMins = Math.floor((appState.attendance.totalSeconds % 3600) / 60);

            activeRow = `
                <tr class="active-shift-row">
                    <td><strong>Today</strong></td>
                    <td>${rowIn}</td>
                    <td>--:--</td>
                    <td><strong>${rHours}h ${rMins}m</strong></td>
                    <td><span class="status-pill status-active">Active Shift</span></td>
                </tr>
            `;
        }

        const hRows = appState.attendance.history.map(h => `
            <tr>
                <td>${h.date}</td>
                <td>${h.in}</td>
                <td>${h.out}</td>
                <td>${h.total}</td>
                <td><span class="status-pill ${h.statClass}">${h.status}</span></td>
            </tr>
        `).join('');

        const finalHTML = activeRow + hRows;
        if (historyTable) {
            // Dashboard only shows recent 4
            historyTable.innerHTML = finalHTML;
        }
        if (fullTable) fullTable.innerHTML = finalHTML;
    }

    if (btnClockIn) {
        btnClockIn.addEventListener('click', () => {
            appState.attendance.isClockedIn = true;
            appState.attendance.clockInTime = new Date().toISOString();
            appState.attendance.totalSeconds = 0;
            saveState();
            renderAttendanceState();
        });
    }

    if (btnClockOut) {
        btnClockOut.addEventListener('click', () => {
            const outDate = new Date();
            const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };
            const inTimeStr = new Date(appState.attendance.clockInTime).toLocaleTimeString('en-GB', timeOpts);
            const outTimeStr = outDate.toLocaleTimeString('en-GB', timeOpts);

            const hours = Math.floor(appState.attendance.totalSeconds / 3600);
            const minutes = Math.floor((appState.attendance.totalSeconds % 3600) / 60);
            const dateStr = outDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat });

            appState.attendance.history.unshift({
                date: dateStr,
                in: inTimeStr,
                out: outTimeStr,
                total: `${hours}h ${minutes}m`,
                status: 'Completed',
                statClass: 'status-on-time'
            });

            appState.attendance.isClockedIn = false;
            appState.attendance.clockInTime = null;
            appState.attendance.totalSeconds = 0;
            saveState();
            renderAttendanceState();
        });
    }

    // Init state
    renderAttendanceState();

    // --- FORMS ---
    const leaveForm = document.getElementById('leaveRequestForm');
    if (leaveForm) {
        leaveForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const origHTML = btn.innerHTML;

            btn.innerHTML = `<i data-feather="check-circle"></i> Request Submitted`;
            btn.classList.add('btn-success');
            feather.replace();

            // Also store in leaves array
            const lType = document.getElementById('leaveType').value;
            const lStart = document.getElementById('leaveStart').value;
            const lEnd = document.getElementById('leaveEnd').value;
            appState.leaves.unshift({ type: lType, start: lStart, end: lEnd, status: 'Pending' });
            saveState();

            setTimeout(() => {
                btn.innerHTML = origHTML;
                btn.classList.remove('btn-success');
                e.target.reset();
                feather.replace();
                navigateTo('#timeoff'); // Redirect to time off view
            }, 1500);
        });
    }

    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const origHTML = btn.innerHTML;

            appState.profile.name = document.getElementById('settingsName').value;
            appState.profile.email = document.getElementById('settingsEmail').value;
            appState.profile.phone = document.getElementById('settingsPhone').value;
            appState.profile.dob = document.getElementById('settingsDob').value;
            appState.profile.gender = document.getElementById('settingsGender').value;
            saveState();

            initializeUI();

            btn.innerHTML = `<i data-feather="check"></i> Saved Successfully`;
            btn.classList.add('btn-success');
            feather.replace();

            setTimeout(() => {
                btn.innerHTML = origHTML;
                btn.classList.remove('btn-success');
                feather.replace();
            }, 2000);
        });

        const profUpload = document.getElementById('profileUpload');
        if (profUpload) {
            profUpload.addEventListener('change', function () {
                if (this.files && this.files[0]) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        appState.profile.avatar = e.target.result;
                        saveState();
                        initializeUI();
                    }
                    reader.readAsDataURL(this.files[0]);
                }
            });
        }
    }
});
