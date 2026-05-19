// js/panels/admin.js
import { db, doc, getDoc, updateDoc } from '../services/database.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { auth, onAuthStateChanged, signOut } from '../services/auth.js';

document.addEventListener('DOMContentLoaded', () => {

    let CURRENT_ADMIN_ID = null;

    // --- SECURITY GATEWAY ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (!CURRENT_ADMIN_ID) {
                CURRENT_ADMIN_ID = user.uid;
                triggerRealTimeHRDataPipeline();
            }
        } else {
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
                '#admin-dashboard': 'Employee Attendance Monitoring',
                '#admin-leaves': 'Leave Management Workflow'
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


    // --- HR MONITORING ENGINE (REAL-TIME SNAPSHOT CORE) ---
    const userCache = {};

    async function getUserProfile(userId) {
        if (userCache[userId]) return userCache[userId];
        try {
            const uRef = doc(db, "users", userId);
            const snap = await getDoc(uRef);
            if (snap.exists()) {
                const data = snap.data();
                userCache[userId] = {
                    name: data.name || "Unknown Employee",
                    designation: data.designation || "Staff",
                    department: data.department || "N/A"
                };
                return userCache[userId];
            }
            return { name: "Unregistered UID", designation: "-", department: "-" };
        } catch (e) {
            return { name: "Network Error", designation: "-", department: "-" };
        }
    }

    // Attach listeners ONCE
    let isPipelineInitialized = false;

    async function triggerRealTimeHRDataPipeline() {
        if (isPipelineInitialized) return;
        isPipelineInitialized = true;
        console.log("[HR Admin] Binding real-time websocket pipelines to Firebase...");

        const attRef = collection(db, "attendance_logs");

        // 1. LIVE ATTENDANCE SNAPSHOT LISTENER
        onSnapshot(attRef, async (querySnapshot) => {
            let metricActiveShiftsCount = 0;
            let metricLateCount = 0;

            let allLogs = [];
            querySnapshot.forEach(snap => {
                allLogs.push({ id: snap.id, ...snap.data() });
            });
            allLogs.sort((a, b) => new Date(b.clockInTime) - new Date(a.clockInTime));

            const tableBody = document.getElementById('globalAttendanceTable');
            let tableHTML = "";

            for (const log of allLogs) {
                const profile = await getUserProfile(log.userId);
                const empName = profile.name;

                const inDateObj = new Date(log.clockInTime);
                const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };

                const rawDateStr = inDateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat });
                const inTimeStr = inDateObj.toLocaleTimeString('en-GB', timeOpts);

                let outTimeStr = "--:--";
                let totalHoursStr = '<span style="color:#2563EB"><i data-feather="loader" style="width:12px"></i> Active</span>';
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

                    // Enforce absolute fallback mathematically just in case database wasn't synced tight
                    const absoluteNow = outDateObj.getTime();
                    const absoluteStart = inDateObj.getTime();
                    const accurateTotalSecs = log.totalSeconds || Math.floor((absoluteNow - absoluteStart) / 1000);

                    const hours = Math.floor(accurateTotalSecs / 3600);
                    const minutes = Math.floor((accurateTotalSecs % 3600) / 60);
                    totalHoursStr = `${hours}h ${minutes}m`;

                    statusBadge = isLate
                        ? '<span class="status-pill status-late">Late Login</span>'
                        : '<span class="status-pill status-on-time">Logged Out</span>';
                }

                if (isLate && log.clockOutTime === null) {
                    statusBadge = '<span class="status-pill status-late">Active (Late)</span>';
                }

                const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat });
                if (isLate && rawDateStr === todayStr && log.clockOutTime === null) {
                    metricLateCount++;
                }

                tableHTML += `<tr>
                    <td>
                        <strong>${empName}</strong>
                        <div style="font-size: 0.75rem; color: #64748B;">${profile.designation}</div>
                    </td>
                    <td>${rawDateStr}</td>
                    <td>${inTimeStr}</td>
                    <td>${outTimeStr}</td>
                    <td><strong>${totalHoursStr}</strong></td>
                    <td>${statusBadge}</td>
                </tr>`;
            }

            if (allLogs.length === 0) tableHTML = `<tr><td colspan="6" style="text-align:center; padding: 32px 0; color: #64748B;">No tracking data flowing in network yet.</td></tr>`;
            if (tableBody) {
                tableBody.innerHTML = tableHTML;
                feather.replace();
            }

            document.getElementById('metricActiveShifts').textContent = metricActiveShiftsCount;
            document.getElementById('metricLateLogins').textContent = metricLateCount;
        }, (err) => {
            console.error("[HR Realtime] Attendance sync block err: ", err);
        });

        // 2. LIVE LEAVE REQUESTS SNAPSHOT LISTENER
        const leaveRef = collection(db, "leave_requests");
        onSnapshot(leaveRef, async (querySnapshot) => {
            let metricPendingLeavesCount = 0;
            let allLeaves = [];

            querySnapshot.forEach(snap => allLeaves.push({ id: snap.id, ...snap.data() }));
            allLeaves.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));

            const leaveTableBody = document.getElementById('globalLeavesTable');
            let leaveHTML = "";

            for (const request of allLeaves) {
                if (request.status === "Pending") metricPendingLeavesCount++;

                const profile = await getUserProfile(request.userId);

                const typeMap = { 'sick': 'Sick Leave', 'half': 'Half Day Leave', 'annual': 'Annual Leave' };
                const formattedType = typeMap[request.type] || request.type;

                const reqDateFormatted = new Date(request.requestDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...gmtFormat });

                let actionHTML = "";
                if (request.status === "Pending") {
                    actionHTML = `
                        <button class="btn-action btn-approve" data-id="${request.id}"><i data-feather="check" style="width:14px; margin-right:4px;"></i> Approve</button>
                        <button class="btn-action btn-reject" data-id="${request.id}" style="margin-left: 8px;"><i data-feather="x" style="width:14px; margin-right:4px;"></i> Reject</button>
                    `;
                } else if (request.status === "Approved" || request.status === "Approve") {
                    actionHTML = `<span style="color:#166534; font-weight:700; font-size:0.8rem;"><i data-feather="check" style="width:14px;"></i> Approved</span>`;
                } else {
                    actionHTML = `<span style="color:#991B1B; font-weight:700; font-size:0.8rem;"><i data-feather="x" style="width:14px;"></i> Rejected</span>`;
                }

                leaveHTML += `<tr>
                    <td>
                        <strong>${profile.name}</strong>
                    </td>
                    <td>${formattedType}</td>
                    <td>${request.startDate}</td>
                    <td>${request.endDate}</td>
                    <td>${reqDateFormatted}</td>
                    <td id="td-${request.id}">${actionHTML}</td>
                </tr>`;
            }

            if (allLeaves.length === 0) leaveHTML = `<tr><td colspan="6" style="text-align:center; padding: 32px 0;">No pending leave requests on network queue.</td></tr>`;
            if (leaveTableBody) {
                leaveTableBody.innerHTML = leaveHTML;
                feather.replace();
                bindLeaveActions();
            }

            document.getElementById('metricPendingLeaves').textContent = metricPendingLeavesCount;

        }, (err) => {
            console.error("[HR Realtime] Leave sync block err: ", err);
        });
    }

    function bindLeaveActions() {
        const approveBtns = document.querySelectorAll('.btn-approve');
        const rejectBtns = document.querySelectorAll('.btn-reject');

        approveBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const targetBtn = e.target.closest('.btn-approve');
                const docId = targetBtn.getAttribute('data-id');
                targetBtn.innerHTML = "Saving...";

                try {
                    await updateDoc(doc(db, "leave_requests", docId), { status: "Approved" });
                } catch (err) {
                    console.error("Action error", err);
                    alert("Database write validation failed. Check HR permissions.");
                }
            });
        });

        rejectBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const targetBtn = e.target.closest('.btn-reject');
                const docId = targetBtn.getAttribute('data-id');
                targetBtn.innerHTML = "Saving...";

                try {
                    await updateDoc(doc(db, "leave_requests", docId), { status: "Rejected" });
                } catch (err) {
                    console.error("Action error", err);
                }
            });
        });
    }

    // --- MOBILE RESPONSIVENESS TOGGLES ---
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const sidebar = document.querySelector('.sidebar');

    function toggleMobileMenu() {
        if (sidebar && mobileOverlay) {
            sidebar.classList.toggle('open');
            mobileOverlay.classList.toggle('visible');
        }
    }

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    if (mobileOverlay) mobileOverlay.addEventListener('click', toggleMobileMenu);

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
                toggleMobileMenu();
            }
        });
    });

});
