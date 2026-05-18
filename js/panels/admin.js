// js/panels/admin.js
import { db, collection, getDocs, doc, getDoc, updateDoc } from '../services/database.js';
import { auth, onAuthStateChanged, signOut } from '../services/auth.js';

document.addEventListener('DOMContentLoaded', () => {

    let CURRENT_ADMIN_ID = null;

    // --- SECURITY GATEWAY ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (!CURRENT_ADMIN_ID) {
                // Secondary Validation check -> Is this user actually an HR admin?
                // By right, unauthenticated users or standard employees shouldn't execute this loop
                CURRENT_ADMIN_ID = user.uid;
                triggerHRDataPipeline();
            }
        } else {
            console.log("[Auth] Session expired or unauthenticated request. Booting to login...");
            window.location.replace("login.html");
        }
    });

    const logoutBtn = document.createElement('a');
    Object.assign(logoutBtn, {
        href: "#logout", className: "nav-item nav-link",
        innerHTML: `<i data-feather="log-out"></i> End Session`
    });
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signOut(auth);
    });
    document.querySelector('.nav-menu').appendChild(logoutBtn);


    // --- BASIC ADMIN ROUTING ---
    const navLinks = document.querySelectorAll('.nav-link');
    const viewSections = document.querySelectorAll('.view-section');
    const pageTitleText = document.getElementById('pageTitleText');

    function navigateTo(hash) {
        if (!hash || hash === '') hash = '#admin-dashboard';
        viewSections.forEach(sec => sec.style.display = 'none');
        navLinks.forEach(nav => nav.classList.remove('active'));

        let targetNav = document.querySelector(`.nav-link[href="${hash}"]`);
        if (!targetNav) { targetNav = document.querySelector('.nav-link[href="#admin-dashboard"]'); hash = '#admin-dashboard'; }

        if (targetNav) {
            const targetViewId = targetNav.getAttribute('data-target');
            const targetView = document.getElementById(targetViewId);
            if (targetView) targetView.style.display = 'block';
            targetNav.classList.add('active');

            const titleMap = {
                '#admin-dashboard': 'HR Monitoring Portal',
                '#admin-leaves': 'Leave Management',
                '#admin-directory': 'Manage Workforce'
            };
            if (pageTitleText) pageTitleText.textContent = titleMap[hash] || 'HR Portal';
        }
    }

    navigateTo(window.location.hash);
    window.addEventListener('hashchange', () => navigateTo(window.location.hash));

    // --- DATE / GMT HELPERS ---
    const gmtFormat = { timeZone: 'Europe/London' };
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', ...gmtFormat };
    const dateDisplay = document.getElementById('currentDateDisplay');
    if (dateDisplay) dateDisplay.textContent = new Date().toLocaleDateString('en-GB', dateOptions) + ' (GMT)';


    // --- HR MONITORING ENGINE ---
    const userCache = {};

    async function getUserName(userId) {
        if (userCache[userId]) return userCache[userId];
        try {
            const uRef = doc(db, "users", userId);
            const snap = await getDoc(uRef);
            if (snap.exists() && snap.data().name) {
                userCache[userId] = snap.data().name;
                return userCache[userId];
            }
            return "Unknown Employee (" + userId.substring(0, 6) + ")";
        } catch (e) {
            return "Unregistered User";
        }
    }

    async function triggerHRDataPipeline() {
        console.log("[HR Admin] Beginning broad data query sweeps for Admin ID", CURRENT_ADMIN_ID);

        let metricActiveShiftsCount = 0;
        let metricLateCount = 0;
        let metricPendingLeavesCount = 0;

        try {
            const attRef = collection(db, "attendance_logs");
            const attSnap = await getDocs(attRef);

            let allLogs = [];
            attSnap.forEach(snap => {
                allLogs.push({ id: snap.id, ...snap.data() });
            });
            allLogs.sort((a, b) => new Date(b.clockInTime) - new Date(a.clockInTime));

            const tableBody = document.getElementById('globalAttendanceTable');
            let tableHTML = "";

            for (const log of allLogs) {
                const empName = await getUserName(log.userId);
                const inDateObj = new Date(log.clockInTime);
                const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };

                const rawDateStr = inDateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat });
                const inTimeStr = inDateObj.toLocaleTimeString('en-GB', timeOpts);

                let outTimeStr = "--:--";
                let totalHoursStr = "Counting...";
                let statusBadge = '<span class="status-pill status-active">Active Shift</span>';

                // Track Late Login Metric 
                const loginHour = parseInt(inDateObj.toLocaleTimeString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }));
                const loginMin = parseInt(inDateObj.toLocaleTimeString('en-GB', { minute: 'numeric', timeZone: 'Europe/London' }));

                let isLate = false;
                if ((loginHour > 9) || (loginHour === 9 && loginMin >= 15)) {
                    isLate = true;
                }

                if (log.clockOutTime === null) {
                    metricActiveShiftsCount++;
                } else {
                    const outDateObj = new Date(log.clockOutTime);
                    outTimeStr = outDateObj.toLocaleTimeString('en-GB', timeOpts);
                    const hours = Math.floor(log.totalSeconds / 3600);
                    const minutes = Math.floor((log.totalSeconds % 3600) / 60);
                    totalHoursStr = `${hours}h ${minutes}m`;

                    statusBadge = isLate
                        ? '<span class="status-pill status-late">Late Login</span>'
                        : '<span class="status-pill status-on-time">Completed</span>';
                }

                if (isLate && log.clockOutTime === null) {
                    statusBadge = '<span class="status-pill status-late">Active (Late)</span>';
                }

                const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat });
                if (isLate && rawDateStr === todayStr) {
                    metricLateCount++;
                }

                tableHTML += `<tr>
                    <td><strong>${empName}</strong></td>
                    <td>${rawDateStr}</td>
                    <td>${inTimeStr}</td>
                    <td>${outTimeStr}</td>
                    <td>${totalHoursStr}</td>
                    <td>${statusBadge}</td>
                </tr>`;
            }

            if (allLogs.length === 0) tableHTML = `<tr><td colspan="6" style="text-align:center;">No tracking data available in Firestore.</td></tr>`;
            if (tableBody) tableBody.innerHTML = tableHTML;

        } catch (e) {
            console.error("[HR Admin] Error reading attendance: ", e);
        }

        try {
            const leaveRef = collection(db, "leave_requests");
            const leaveSnap = await getDocs(leaveRef);

            let allLeaves = [];
            leaveSnap.forEach(snap => allLeaves.push({ id: snap.id, ...snap.data() }));

            allLeaves.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));

            const leaveTableBody = document.getElementById('globalLeavesTable');
            let leaveHTML = "";

            for (const request of allLeaves) {
                if (request.status === "Pending") metricPendingLeavesCount++;

                const empName = await getUserName(request.userId);

                const typeMap = { 'sick': 'Sick Leave', 'half': 'Half Day Leave', 'annual': 'Annual Leave' };
                const formattedType = typeMap[request.type] || request.type;

                const reqDateFormatted = new Date(request.requestDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...gmtFormat });

                let actionHTML = "";
                if (request.status === "Pending") {
                    actionHTML = `
                        <button class="btn-action btn-approve" data-id="${request.id}">Approve</button>
                        <button class="btn-action btn-reject" data-id="${request.id}" style="margin-left: 8px;">Reject</button>
                    `;
                } else if (request.status === "Approved" || request.status === "Approve") {
                    actionHTML = `<span style="color:#166534; font-weight:700; font-size:0.8rem;"><i data-feather="check" style="width:14px;"></i> Approved</span>`;
                } else {
                    actionHTML = `<span style="color:#991B1B; font-weight:700; font-size:0.8rem;"><i data-feather="x" style="width:14px;"></i> Rejected</span>`;
                }

                leaveHTML += `<tr>
                    <td><strong>${empName}</strong></td>
                    <td>${formattedType}</td>
                    <td>${request.startDate}</td>
                    <td>${request.endDate}</td>
                    <td>${reqDateFormatted}</td>
                    <td id="td-${request.id}">${actionHTML}</td>
                </tr>`;
            }

            if (allLeaves.length === 0) leaveHTML = `<tr><td colspan="6" style="text-align:center;">No pending leave requests on queue.</td></tr>`;
            if (leaveTableBody) leaveTableBody.innerHTML = leaveHTML;

            feather.replace();
            bindLeaveActions();

        } catch (e) {
            console.error("[HR Admin] Error reading leaves: ", e);
        }

        document.getElementById('metricActiveShifts').textContent = metricActiveShiftsCount;
        document.getElementById('metricLateLogins').textContent = metricLateCount;
        document.getElementById('metricPendingLeaves').textContent = metricPendingLeavesCount;
    }

    function bindLeaveActions() {
        const approveBtns = document.querySelectorAll('.btn-approve');
        const rejectBtns = document.querySelectorAll('.btn-reject');

        approveBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.target.getAttribute('data-id');
                e.target.innerText = "Saving...";
                try {
                    await updateDoc(doc(db, "leave_requests", docId), { status: "Approved" });
                    document.getElementById(`td-${docId}`).innerHTML = `<span style="color:#166534; font-weight:700; font-size:0.8rem;"><i data-feather="check" style="width:14px;"></i> Approved</span>`;
                    feather.replace();
                } catch (err) {
                    console.error("Action error", err);
                    alert("Database write validation failed. Check HR permissions.");
                }
            });
        });

        rejectBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.target.getAttribute('data-id');
                e.target.innerText = "Saving...";
                try {
                    await updateDoc(doc(db, "leave_requests", docId), { status: "Rejected" });
                    document.getElementById(`td-${docId}`).innerHTML = `<span style="color:#991B1B; font-weight:700; font-size:0.8rem;"><i data-feather="x" style="width:14px;"></i> Rejected</span>`;
                    feather.replace();
                } catch (err) {
                    console.error("Action error", err);
                }
            });
        });
    }
});
