// homesly-hr/js/app.js
import { db } from './services/database.js';
import {
    collection, addDoc, getDocs, query, where,
    doc, getDoc, updateDoc, setDoc
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // We mock the currently logged-in user until the Login screen is fully wired.
    const CURRENT_USER_ID = "emp_001";

    // --- STATE INITIALIZATION ---
    let appState = {
        attendance: {
            activeDocId: null,
            isClockedIn: false,
            clockInTime: null,
            totalSeconds: 0,
            history: [] // Populated dynamically from Firestore
        },
        profile: {
            name: 'Loading...',
            email: '...',
            phone: '...',
            dob: '...',
            gender: 'female',
            avatar: 'https://ui-avatars.com/api/?name=Loading&background=4F46E5&color=fff'
        }
    };

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

    // --- UI HELPERS ---
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', ...gmtFormat };
    const dateDisplay = document.getElementById('currentDateDisplay');
    if (dateDisplay) dateDisplay.textContent = new Date().toLocaleDateString('en-GB', dateOptions) + ' (GMT)';

    const timeDisplay = document.getElementById('currentTimeDisplay');
    function updateLiveClock() {
        if (timeDisplay) {
            timeDisplay.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', ...gmtFormat });
        }
    }
    setInterval(updateLiveClock, 1000);
    updateLiveClock();

    function initializeUI() {
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

    // --- FIRESTORE DATA FETCHING ---
    async function fetchFirestoreData() {
        try {
            console.log("[Firebase] Fetching data for UI...");
            // 1. Fetch Profile
            const userRef = doc(db, "users", CURRENT_USER_ID);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                appState.profile = { ...appState.profile, ...userSnap.data() };
            } else {
                // Seed initial profile in database if completely fresh project
                appState.profile = {
                    name: 'Sarah Jen', email: 'sarah.jen@homesly.com', phone: '+44 20 7123 4567',
                    dob: '1990-05-15', gender: 'female', avatar: 'https://ui-avatars.com/api/?name=Sarah+Jen&background=4F46E5&color=fff'
                };
                await setDoc(userRef, appState.profile);
            }
            initializeUI();

            // 2. Fetch Attendance
            const attRef = collection(db, "attendance_logs");
            const q = query(attRef, where("userId", "==", CURRENT_USER_ID));
            const querySnapshot = await getDocs(q);

            let allLogs = [];
            querySnapshot.forEach((docSnap) => {
                allLogs.push({ id: docSnap.id, ...docSnap.data() });
            });

            // Client side sort to prevent Firebase composite index crash on fresh setups
            allLogs.sort((a, b) => new Date(b.clockInTime) - new Date(a.clockInTime));

            appState.attendance.history = [];
            allLogs.forEach((data) => {
                if (data.clockOutTime === null) {
                    // The user left the tab without clocking out! Resuming active shift.
                    appState.attendance.activeDocId = data.id;
                    appState.attendance.isClockedIn = true;
                    appState.attendance.clockInTime = data.clockInTime;

                    const now = new Date().getTime();
                    const past = new Date(data.clockInTime).getTime();
                    appState.attendance.totalSeconds = Math.floor((now - past) / 1000);
                } else {
                    const inDate = new Date(data.clockInTime);
                    const outDate = new Date(data.clockOutTime);
                    const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };

                    const hours = Math.floor(data.totalSeconds / 3600);
                    const minutes = Math.floor((data.totalSeconds % 3600) / 60);

                    appState.attendance.history.push({
                        date: outDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat }),
                        in: inDate.toLocaleTimeString('en-GB', timeOpts),
                        out: outDate.toLocaleTimeString('en-GB', timeOpts),
                        total: `${hours}h ${minutes}m`,
                        status: 'Completed',
                        statClass: 'status-on-time'
                    });
                }
            });

            renderAttendanceState();
        } catch (error) {
            console.error("[Firebase] Error fetching data:", error);
            // Fallback UI to unblock rendering if restricted origin/auth
            initializeUI();
            renderAttendanceState();
        }
    }

    // --- ATTENDANCE SYSTEM CONTROLS ---
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
            if (btnClockIn) btnClockIn.disabled = true;
            if (btnClockOut) {
                btnClockOut.disabled = false;
                btnClockOut.classList.remove('btn-secondary');
                btnClockOut.classList.add('btn-danger');

                // Show loading state removal if there was one
                btnClockIn.innerHTML = `<i data-feather="log-in"></i> Clocked In`;
                btnClockOut.innerHTML = `<i data-feather="log-out"></i> Clock Out`;
                feather.replace();
            }

            const inTimeStr = new Date(appState.attendance.clockInTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...gmtFormat });
            if (valClockIn) valClockIn.textContent = inTimeStr;
            if (valClockOut) valClockOut.textContent = '--:--';

            if (!timerInterval) {
                timerInterval = setInterval(() => {
                    appState.attendance.totalSeconds++;
                    if (valTotalHours) valTotalHours.textContent = formatDuration(appState.attendance.totalSeconds);
                }, 1000);
            }
        } else {
            if (btnClockIn) btnClockIn.disabled = false;
            if (btnClockOut) {
                btnClockOut.disabled = true;
                btnClockOut.classList.remove('btn-danger');
                btnClockOut.classList.add('btn-secondary');

                btnClockIn.innerHTML = `<i data-feather="log-in"></i> Clock In`;
                btnClockOut.innerHTML = `<i data-feather="log-out"></i> Clock Out`;
                feather.replace();
            }

            if (valClockIn) valClockIn.textContent = '--:--';
            if (valClockOut) valClockOut.textContent = '--:--';
            if (valTotalHours) valTotalHours.textContent = '0h 0m';
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

        const hRows = appState.attendance.history.slice(0, 30).map(h => `
            <tr>
                <td>${h.date}</td>
                <td>${h.in}</td>
                <td>${h.out}</td>
                <td>${h.total}</td>
                <td><span class="status-pill ${h.statClass}">${h.status}</span></td>
            </tr>
        `).join('');

        const finalHTML = activeRow + hRows;
        if (historyTable) historyTable.innerHTML = finalHTML;
        if (fullTable) fullTable.innerHTML = finalHTML;
    }

    // Clock In Execution (Writes to Database)
    if (btnClockIn) {
        btnClockIn.addEventListener('click', async () => {
            btnClockIn.disabled = true;
            btnClockIn.innerHTML = `<i data-feather="loader"></i> Updating...`;
            feather.replace();

            const startTime = new Date().toISOString();

            try {
                // Firebase Database Transaction
                const docRef = await addDoc(collection(db, "attendance_logs"), {
                    userId: CURRENT_USER_ID,
                    clockInTime: startTime,
                    clockOutTime: null,
                    totalSeconds: 0,
                    status: "Active Shift"
                });

                appState.attendance.activeDocId = docRef.id;
                appState.attendance.isClockedIn = true;
                appState.attendance.clockInTime = startTime;
                appState.attendance.totalSeconds = 0;

                renderAttendanceState();
            } catch (err) {
                console.error("[Firebase] Clock In Failed: ", err);
                alert("Database connection failed. Check your Firebase permissions.");
                btnClockIn.disabled = false;
                btnClockIn.innerHTML = `<i data-feather="log-in"></i> Clock In`;
                feather.replace();
            }
        });
    }

    // Clock Out Execution (Updates Document in Database)
    if (btnClockOut) {
        btnClockOut.addEventListener('click', async () => {
            btnClockOut.disabled = true;
            btnClockOut.innerHTML = `<i data-feather="loader"></i> Processing...`;
            feather.replace();

            const endTime = new Date().toISOString();

            try {
                // Firebase Update Transaction
                const attRef = doc(db, "attendance_logs", appState.attendance.activeDocId);
                await updateDoc(attRef, {
                    clockOutTime: endTime,
                    totalSeconds: appState.attendance.totalSeconds,
                    status: "Completed"
                });

                const inDate = new Date(appState.attendance.clockInTime);
                const outDate = new Date(endTime);
                const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };

                const hours = Math.floor(appState.attendance.totalSeconds / 3600);
                const minutes = Math.floor((appState.attendance.totalSeconds % 3600) / 60);

                // Add to top of local history stack
                appState.attendance.history.unshift({
                    date: outDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat }),
                    in: inDate.toLocaleTimeString('en-GB', timeOpts),
                    out: outDate.toLocaleTimeString('en-GB', timeOpts),
                    total: `${hours}h ${minutes}m`,
                    status: 'Completed',
                    statClass: 'status-on-time'
                });

                appState.attendance.isClockedIn = false;
                appState.attendance.clockInTime = null;
                appState.attendance.activeDocId = null;
                appState.attendance.totalSeconds = 0;

                renderAttendanceState();
            } catch (err) {
                console.error("[Firebase] Clock Out Failed: ", err);
                btnClockOut.disabled = false;
                btnClockOut.innerHTML = `<i data-feather="log-out"></i> Clock Out`;
                feather.replace();
            }
        });
    }

    // --- LEAVE REQUEST FORM ---
    const leaveForm = document.getElementById('leaveRequestForm');
    if (leaveForm) {
        leaveForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const origHTML = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = `<i data-feather="loader"></i> Processing...`;
            feather.replace();

            const lType = document.getElementById('leaveType').value;
            const lStart = document.getElementById('leaveStart').value;
            const lEnd = document.getElementById('leaveEnd').value;

            try {
                // Push to Firebase Leaves collection
                await addDoc(collection(db, "leave_requests"), {
                    userId: CURRENT_USER_ID,
                    type: lType,
                    startDate: lStart,
                    endDate: lEnd,
                    status: "Pending",
                    requestDate: new Date().toISOString()
                });

                btn.innerHTML = `<i data-feather="check-circle"></i> Request Logged to DB`;
                btn.classList.add('btn-success');
                feather.replace();

                setTimeout(() => {
                    btn.innerHTML = origHTML;
                    btn.classList.remove('btn-success');
                    btn.disabled = false;
                    e.target.reset();
                    feather.replace();
                    navigateTo('#timeoff');
                }, 2000);

            } catch (err) {
                console.error("[Firebase] Error saving leave: ", err);
                btn.innerHTML = `<i data-feather="alert-circle"></i> DB Error`;
                setTimeout(() => { btn.innerHTML = origHTML; btn.disabled = false; }, 2000);
            }
        });
    }

    // --- SETTINGS FORM ---
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const origHTML = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = `<i data-feather="loader"></i> Saving to Cloud...`;
            feather.replace();

            const profilePayload = {
                name: document.getElementById('settingsName').value,
                email: document.getElementById('settingsEmail').value,
                phone: document.getElementById('settingsPhone').value,
                dob: document.getElementById('settingsDob').value,
                gender: document.getElementById('settingsGender').value,
                avatar: appState.profile.avatar // Retain current avatar string
            };

            try {
                const userRef = doc(db, "users", CURRENT_USER_ID);
                await updateDoc(userRef, profilePayload);

                appState.profile = { ...appState.profile, ...profilePayload };
                initializeUI();

                btn.innerHTML = `<i data-feather="check"></i> Cloud Sync Success`;
                btn.classList.add('btn-success');
                feather.replace();

                setTimeout(() => {
                    btn.innerHTML = origHTML;
                    btn.classList.remove('btn-success');
                    btn.disabled = false;
                    feather.replace();
                }, 2000);

            } catch (err) {
                console.error("[Firebase] Profile Update Error: ", err);
                btn.innerHTML = `<i data-feather="alert-circle"></i> Access Denied`;
                setTimeout(() => { btn.innerHTML = origHTML; btn.disabled = false; }, 2000);
            }
        });

        const profUpload = document.getElementById('profileUpload');
        if (profUpload) {
            profUpload.addEventListener('change', function () {
                if (this.files && this.files[0]) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        appState.profile.avatar = e.target.result;
                        initializeUI();
                    }
                    reader.readAsDataURL(this.files[0]);
                }
            });
        }
    }

    // Execute initial fetch sequence to prime the dashboard
    fetchFirestoreData();
});
