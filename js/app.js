// homesly-hr/js/app.js
import { db } from './services/database.js';
import { auth, onAuthStateChanged, signOut } from './services/auth.js';
import { notifyClockStatus, notifyLeaveRequest, notifyLateLogin, notifyAttendanceIssue } from './services/notifications.js';
import {
    collection, addDoc, getDocs, query, where,
    doc, getDoc, updateDoc, setDoc
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    let CURRENT_USER_ID = null;

    // --- AUTHENTICATION GATE ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (!CURRENT_USER_ID) {
                CURRENT_USER_ID = user.uid;
                fetchFirestoreData();
            }
        } else {
            console.log("[Auth] Session expired or logged out. Redirecting...");
            window.location.replace("login.html");
        }
    });

    // --- STATE INITIALIZATION ---
    let appState = {
        attendance: {
            activeDocId: null,
            isClockedIn: false,
            clockInTime: null,
            totalSeconds: 0,
            history: []
        },
        profile: {
            name: 'Loading...',
            email: '...',
            phone: '...',
            dob: '...',
            gender: 'other',
            designation: 'New Employee',
            department: 'Unassigned',
            employeeId: 'HM-0000',
            status: 'active',
            avatar: 'https://ui-avatars.com/api/?name=Loading&background=4F46E5&color=fff',
            emergencyContact: '',
            joinDate: '',
            expiryDate: '',
            bloodGroup: ''
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
                '#timeoff': 'Time Off Overview',
                '#directory': 'Employee Directory',
                '#settings': 'Account Settings'
            };
            if (pageTitleText) pageTitleText.textContent = titleMap[hash] || 'Dashboard';
        }
    }

    navigateTo(window.location.hash);
    window.addEventListener('hashchange', () => navigateTo(window.location.hash));

    // Logout Helper Integration
    const logoutBtn = document.createElement('a');
    Object.assign(logoutBtn, {
        href: "#logout", className: "nav-item nav-link",
        innerHTML: `<i data-feather="log-out"></i> Log Out`
    });
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signOut(auth);
    });
    document.querySelector('.nav-menu').appendChild(logoutBtn);


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
        const sidebarRole = document.getElementById('sidebarRole');
        const sidebarAvatar = document.getElementById('sidebarAvatar');

        if (sidebarName) sidebarName.textContent = appState.profile.name;
        if (sidebarRole) sidebarRole.textContent = appState.profile.designation || 'Specialist';
        if (sidebarAvatar) sidebarAvatar.src = appState.profile.avatar;

        const sName = document.getElementById('settingsName');
        const sEmail = document.getElementById('settingsEmail');
        const sPhone = document.getElementById('settingsPhone');
        const sDob = document.getElementById('settingsDob');
        const sGender = document.getElementById('settingsGender');
        const sDesignation = document.getElementById('settingsDesignation');
        const sDepartment = document.getElementById('settingsDepartment');
        const sAvatarPreview = document.getElementById('settingsAvatarPreview');
        const sEmpId = document.getElementById('settingsEmpId');
        const sEmergencyContact = document.getElementById('settingsEmergencyContact');
        const sJoinDate = document.getElementById('settingsJoinDate');
        const sExpiryDate = document.getElementById('settingsExpiryDate');
        const sBloodGroup = document.getElementById('settingsBloodGroup');

        if (sName) sName.value = appState.profile.name || '';
        if (sEmail) sEmail.value = appState.profile.email || '';
        if (sPhone) sPhone.value = appState.profile.phone || '';
        if (sDob) sDob.value = appState.profile.dob || '';
        if (sGender) sGender.value = appState.profile.gender || 'other';
        if (sDesignation) sDesignation.value = appState.profile.designation || '';
        if (sDepartment) sDepartment.value = appState.profile.department || '';
        if (sEmpId) sEmpId.value = appState.profile.employeeId || '';
        if (sAvatarPreview) sAvatarPreview.src = appState.profile.avatar;
        if (sEmergencyContact) sEmergencyContact.value = appState.profile.emergencyContact || '';
        if (sJoinDate) sJoinDate.value = appState.profile.joinDate || '';
        if (sExpiryDate) sExpiryDate.value = appState.profile.expiryDate || '';
        if (sBloodGroup) sBloodGroup.value = appState.profile.bloodGroup || '';

        updateIDCard();
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
                
                // Dynamic Join Date integration if missing
                if (!appState.profile.joinDate) {
                    const created = appState.profile.createdAt;
                    if (created) {
                        appState.profile.joinDate = new Date(created).toLocaleDateString('en-CA');
                    } else if (auth.currentUser && auth.currentUser.metadata.creationTime) {
                        appState.profile.joinDate = new Date(auth.currentUser.metadata.creationTime).toLocaleDateString('en-CA');
                    } else {
                        appState.profile.joinDate = new Date().toLocaleDateString('en-CA');
                    }
                }
                
                // Dynamic Expiry Date integration if missing (5 years after joinDate)
                if (!appState.profile.expiryDate && appState.profile.joinDate) {
                    const jd = new Date(appState.profile.joinDate);
                    appState.profile.expiryDate = new Date(jd.setFullYear(jd.getFullYear() + 5)).toLocaleDateString('en-CA');
                }
            } else {
                appState.profile = {
                    name: 'New Employee',
                    email: auth.currentUser?.email || '',
                    phone: '',
                    dob: '',
                    gender: 'other',
                    designation: 'Staff',
                    department: '',
                    employeeId: 'HM-' + Math.floor(1000 + Math.random() * 9000),
                    status: 'active',
                    avatar: 'https://ui-avatars.com/api/?name=Employee&background=4F46E5&color=fff',
                    role: 'employee',
                    emergencyContact: '',
                    joinDate: new Date().toLocaleDateString('en-CA'),
                    expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toLocaleDateString('en-CA'),
                    bloodGroup: ''
                };
                await setDoc(userRef, appState.profile);
            }

            // Disabled Gate Check
            if (appState.profile.status === 'disabled') {
                alert("Your account has been disabled. Please contact your administrator.");
                await signOut(auth);
                window.location.replace("login.html");
                return;
            }

            // Super Admin Redirection Guard
            if (appState.profile.role === 'super_admin') {
                console.log("[Auth] CEO/Super Admin detected. Redirecting to Admin dashboard...");
                window.location.replace("admin.html");
                return;
            }

            // Populate departments dropdown dynamically
            try {
                const deptsSnap = await getDocs(collection(db, "departments"));
                const deptSelect = document.getElementById('settingsDepartment');
                if (deptSelect) {
                    deptSelect.innerHTML = '<option value="">Select Department</option>';
                    deptsSnap.forEach(dDoc => {
                        const dData = dDoc.data();
                        const opt = document.createElement('option');
                        opt.value = dData.name;
                        opt.textContent = dData.name;
                        if (appState.profile.department === dData.name) {
                            opt.selected = true;
                        }
                        deptSelect.appendChild(opt);
                    });
                }
            } catch (err) {
                console.error("Error loading departments in settings:", err);
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

            allLogs.sort((a, b) => new Date(b.clockInTime) - new Date(a.clockInTime));

            appState.attendance.history = [];
            allLogs.forEach((data) => {
                if (data.clockOutTime === null) {
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

            // 3. Fetch Leaves Profile History
            fetchMyLeaves();

        } catch (error) {
            console.error("[Firebase] Error fetching data:", error);
            initializeUI();
            renderAttendanceState();
        }
    }

    async function fetchMyLeaves() {
        try {
            const leaveRef = collection(db, "leave_requests");
            const leaveQ = query(leaveRef, where("userId", "==", CURRENT_USER_ID));
            const leaveSnap = await getDocs(leaveQ);

            let myLeaves = [];
            leaveSnap.forEach((docSnap) => {
                myLeaves.push({ id: docSnap.id, ...docSnap.data() });
            });

            myLeaves.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));

            const leavesTableBody = document.getElementById('employeeLeavesTable');
            let rowsHtml = "";

            const pOpts = { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat };
            const typeMap = { 'sick': 'Sick Leave', 'half': 'Half Day Leave', 'annual': 'Annual Leave' };

            for (const request of myLeaves) {
                const formattedType = typeMap[request.type] || request.type;
                const reqDateFormatted = new Date(request.requestDate).toLocaleDateString('en-GB', pOpts);

                let badgeHTML = "";
                if (request.status === "Pending") badgeHTML = `<span class="status-pill status-late" style="background:#FEF3C7; color:#92400E;">Pending</span>`;
                else if (request.status === "Approved" || request.status === "Approve") badgeHTML = `<span class="status-pill status-on-time" style="background:#DCFCE7; color:#166534;"><i data-feather="check" style="width:12px;"></i> Approved</span>`;
                else badgeHTML = `<span class="status-pill" style="background:#FEE2E2; color:#991B1B;"><i data-feather="x" style="width:12px;"></i> Rejected</span>`;

                rowsHtml += `<tr>
                    <td><strong>${formattedType}</strong></td>
                    <td>${reqDateFormatted}</td>
                    <td>${request.startDate} to ${request.endDate}</td>
                    <td>${request.notes || "<span style='color:#94A3B8'>No comments</span>"}</td>
                    <td>${badgeHTML}</td>
                </tr>`;
            }

            if (myLeaves.length === 0) rowsHtml = `<tr><td colspan="5" style="text-align: center; color: #64748B;">You have no leave history.</td></tr>`;

            if (leavesTableBody) {
                leavesTableBody.innerHTML = rowsHtml;
                feather.replace();
            }
        } catch (e) {
            console.error("Error fetching leaves", e);
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

                btnClockIn.innerHTML = `<i data-feather="log-in"></i> Clocked In`;
                btnClockOut.innerHTML = `<i data-feather="log-out"></i> Clock Out`;
                feather.replace();
            }

            const inTimeStr = new Date(appState.attendance.clockInTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...gmtFormat });
            if (valClockIn) valClockIn.textContent = inTimeStr;
            if (valClockOut) valClockOut.textContent = '--:--';

            // Dynamic Clock recalculation bound to absolute reality
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                const now = new Date().getTime();
                const past = new Date(appState.attendance.clockInTime).getTime();
                appState.attendance.totalSeconds = Math.floor((now - past) / 1000);
                if (valTotalHours) valTotalHours.textContent = formatDuration(appState.attendance.totalSeconds);
            }, 1000);

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

    if (btnClockIn) {
        btnClockIn.addEventListener('click', async () => {
            btnClockIn.disabled = true;
            btnClockIn.innerHTML = `<i data-feather="loader"></i> Updating...`;
            feather.replace();

            const startTime = new Date().toISOString();

            try {
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

                await notifyClockStatus(CURRENT_USER_ID, appState.profile.name, 'Clocked In', startTime, '0', startTime);

                // Check for late login (after 09:15 GMT)
                const inDateObj = new Date(startTime);
                const loginHour = parseInt(inDateObj.toLocaleTimeString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }));
                const loginMin = parseInt(inDateObj.toLocaleTimeString('en-GB', { minute: 'numeric', timeZone: 'Europe/London' }));
                if ((loginHour > 9) || (loginHour === 9 && loginMin >= 15)) {
                    await notifyLateLogin(CURRENT_USER_ID, appState.profile.name, startTime);
                }

            } catch (err) {
                console.error("[Firebase] Clock In Failed: ", err);
                alert("Database connection failed. Check your Firebase permissions.");
                btnClockIn.disabled = false;
                btnClockIn.innerHTML = `<i data-feather="log-in"></i> Clock In`;
                feather.replace();
            }
        });
    }

    if (btnClockOut) {
        btnClockOut.addEventListener('click', async () => {
            btnClockOut.disabled = true;
            btnClockOut.innerHTML = `<i data-feather="loader"></i> Processing...`;
            feather.replace();

            const endTime = new Date().toISOString();

            try {
                // FIXED: Calculate Absolute Time Diff directly to fix sync issues across midnight/browser hibernation defaults
                const absoluteNow = new Date(endTime).getTime();
                const absoluteStart = new Date(appState.attendance.clockInTime).getTime();
                const hardTotalSeconds = Math.floor((absoluteNow - absoluteStart) / 1000);

                const attRef = doc(db, "attendance_logs", appState.attendance.activeDocId);
                await updateDoc(attRef, {
                    clockOutTime: endTime,
                    totalSeconds: hardTotalSeconds,
                    status: "Completed"
                });

                const inDate = new Date(appState.attendance.clockInTime);
                const outDate = new Date(endTime);
                const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };

                const hours = Math.floor(hardTotalSeconds / 3600);
                const minutes = Math.floor((hardTotalSeconds % 3600) / 60);
                const finalHoursStr = `${hours}h ${minutes}m`;

                appState.attendance.history.unshift({
                    date: outDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat }),
                    in: inDate.toLocaleTimeString('en-GB', timeOpts),
                    out: outDate.toLocaleTimeString('en-GB', timeOpts),
                    total: finalHoursStr,
                    status: 'Completed',
                    statClass: 'status-on-time'
                });

                await notifyClockStatus(CURRENT_USER_ID, appState.profile.name, 'Clocked Out', endTime, finalHoursStr, endTime);

                // Check for attendance issues (e.g. short shift, less than 4 hours = 14400 seconds)
                if (hardTotalSeconds < 14400) {
                    await notifyAttendanceIssue(CURRENT_USER_ID, appState.profile.name, 'Short Shift', `Worked for only ${finalHoursStr} (less than 4 hours).`);
                }

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

    // --- LEAVE REQUEST FORM W/ STRICT VALIDATION ---
    const leaveForm = document.getElementById('leaveRequestForm');
    const elStart = document.getElementById('leaveStart');
    const elEnd = document.getElementById('leaveEnd');

    if (elStart && elEnd) {
        const todayStr = new Date().toLocaleDateString('en-CA', gmtFormat);
        elStart.setAttribute('min', todayStr);
        elEnd.setAttribute('min', todayStr);

        elStart.addEventListener('change', () => {
            elEnd.setAttribute('min', elStart.value);
            if (elEnd.value && elEnd.value < elStart.value) {
                elEnd.value = elStart.value;
            }
        });
    }

    if (leaveForm) {
        leaveForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const btn = e.target.querySelector('button');
            const origHTML = btn.innerHTML;

            const lType = document.getElementById('leaveType').value;
            const lStart = elStart.value;
            const lEnd = elEnd.value;
            const lComments = document.querySelector('textarea').value;

            const todayBoundary = new Date().toLocaleDateString('en-CA', gmtFormat);
            if (lStart < todayBoundary || lEnd < todayBoundary) {
                alert("Validation Error: Past dates are not allowed for leave applications.");
                return;
            }
            if (lEnd < lStart) {
                alert("Validation Error: End Date cannot be earlier than Start Date.");
                return;
            }

            btn.disabled = true;
            btn.innerHTML = `<i data-feather="loader"></i> Processing Validation...`;
            feather.replace();

            try {
                await addDoc(collection(db, "leave_requests"), {
                    userId: CURRENT_USER_ID,
                    type: lType,
                    startDate: lStart,
                    endDate: lEnd,
                    notes: lComments,
                    status: "Pending",
                    requestDate: new Date().toISOString()
                });

                btn.innerHTML = `<i data-feather="check-circle"></i> Request Submitted`;
                btn.classList.add('btn-success');
                btn.style.boxShadow = "none";
                feather.replace();

                await notifyLeaveRequest(CURRENT_USER_ID, appState.profile.name, lType, lStart, lEnd, lComments);

                await fetchMyLeaves();

                setTimeout(() => {
                    btn.innerHTML = origHTML;
                    btn.classList.remove('btn-success');
                    btn.disabled = false;
                    btn.style.boxShadow = "";
                    e.target.reset();
                    feather.replace();
                    navigateTo('#timeoff');
                }, 2000);

            } catch (err) {
                console.error("[Firebase] Error saving leave: ", err);
                btn.innerHTML = `<i data-feather="alert-circle"></i> Service Timeout`;
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
            btn.innerHTML = `<i data-feather="loader"></i> Saving Data Pipeline...`;
            feather.replace();

            const profilePayload = {
                name: document.getElementById('settingsName').value,
                email: document.getElementById('settingsEmail').value,
                phone: document.getElementById('settingsPhone').value,
                dob: document.getElementById('settingsDob').value,
                gender: document.getElementById('settingsGender').value,
                designation: document.getElementById('settingsDesignation').value,
                department: document.getElementById('settingsDepartment').value,
                avatar: appState.profile.avatar,
                emergencyContact: document.getElementById('settingsEmergencyContact').value,
                joinDate: document.getElementById('settingsJoinDate').value,
                expiryDate: document.getElementById('settingsExpiryDate').value,
                bloodGroup: document.getElementById('settingsBloodGroup').value
            };

            try {
                const userRef = doc(db, "users", CURRENT_USER_ID);
                await updateDoc(userRef, profilePayload);

                appState.profile = { ...appState.profile, ...profilePayload };
                initializeUI();

                btn.innerHTML = `<i data-feather="check"></i> System Profile Updated`;
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
                btn.innerHTML = `<i data-feather="alert-circle"></i> Service Timeout`;
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
                        // Immediate ID Card avatar update
                        const idCardAvatar = document.getElementById('idCardAvatar');
                        if (idCardAvatar) idCardAvatar.src = e.target.result;
                    }
                    reader.readAsDataURL(this.files[0]);
                }
            });
        }
    }

    // --- DIGITAL ID CARD UPDATES & LIVE PREVIEW ---
    function updateIDCard() {
        const idCardName = document.getElementById('idCardName');
        const idCardDesignation = document.getElementById('idCardDesignation');
        const idCardEmpId = document.getElementById('idCardEmpId');
        const idCardDept = document.getElementById('idCardDept');
        const idCardGender = document.getElementById('idCardGender');
        const idCardPhone = document.getElementById('idCardPhone');
        const idCardAvatar = document.getElementById('idCardAvatar');
        const idCardBarcodeText = document.getElementById('idCardBarcodeText');
        const idCardQR = document.getElementById('idCardQR');

        // Back Card Elements
        const idCardJoinDate = document.getElementById('idCardJoinDate');
        const idCardExpiryDate = document.getElementById('idCardExpiryDate');
        const idCardEmergencyContact = document.getElementById('idCardEmergencyContact');
        const idCardSignature = document.getElementById('idCardSignature');
        const idCardBloodGroup = document.getElementById('idCardBloodGroup');

        if (idCardName) idCardName.textContent = appState.profile.name || 'Employee Name';
        if (idCardDesignation) idCardDesignation.textContent = appState.profile.designation || 'Designation';
        if (idCardEmpId) idCardEmpId.textContent = appState.profile.employeeId || 'HM-0000';
        if (idCardDept) idCardDept.textContent = appState.profile.department || 'Unassigned';
        if (idCardGender) {
            const genderLabel = {
                'female': 'Female',
                'male': 'Male',
                'other': 'Other',
                'prefer_not': 'Other'
            }[appState.profile.gender] || appState.profile.gender || 'Other';
            idCardGender.textContent = genderLabel;
        }
        if (idCardPhone) idCardPhone.textContent = appState.profile.phone || '-';
        if (idCardAvatar) idCardAvatar.src = appState.profile.avatar || 'https://ui-avatars.com/api/?name=Employee&background=4F46E5&color=fff';
        if (idCardBarcodeText) idCardBarcodeText.textContent = appState.profile.employeeId || 'HM0000';

        // QR Code API Integration
        if (idCardQR) {
            const qrData = encodeURIComponent(`ID: ${appState.profile.employeeId || 'HM-0000'}\nName: ${appState.profile.name || 'Employee'}\nDept: ${appState.profile.department || 'Unassigned'}\nPhone: ${appState.profile.phone || '-'}`);
            idCardQR.src = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}`;
        }

        // Back Card population
        if (idCardJoinDate) {
            const jd = appState.profile.joinDate;
            idCardJoinDate.textContent = jd ? new Date(jd).toLocaleDateString('en-GB') : '-';
        }
        if (idCardExpiryDate) {
            const ed = appState.profile.expiryDate;
            idCardExpiryDate.textContent = ed ? new Date(ed).toLocaleDateString('en-GB') : '-';
        }
        if (idCardEmergencyContact) idCardEmergencyContact.textContent = appState.profile.emergencyContact || '-';
        if (idCardSignature) idCardSignature.textContent = appState.profile.name || 'Employee Signature';
        if (idCardBloodGroup) idCardBloodGroup.textContent = appState.profile.bloodGroup || '-';
    }

    function bindLiveIDCardPreview() {
        const fields = [
            { id: 'settingsName', targetId: 'idCardName', default: 'Employee Name' },
            { id: 'settingsDesignation', targetId: 'idCardDesignation', default: 'Designation' },
            { id: 'settingsPhone', targetId: 'idCardPhone', default: '-' },
            { id: 'settingsEmergencyContact', targetId: 'idCardEmergencyContact', default: '-' }
        ];

        fields.forEach(f => {
            const el = document.getElementById(f.id);
            if (el) {
                el.addEventListener('input', (e) => {
                    const target = document.getElementById(f.targetId);
                    if (target) target.textContent = e.target.value || f.default;

                    // Specific extra updates
                    if (f.id === 'settingsName') {
                        const sigTarget = document.getElementById('idCardSignature');
                        if (sigTarget) sigTarget.textContent = e.target.value || f.default;
                    }
                });
            }
        });

        const deptEl = document.getElementById('settingsDepartment');
        if (deptEl) {
            deptEl.addEventListener('change', (e) => {
                const target = document.getElementById('idCardDept');
                if (target) target.textContent = e.target.value || 'Unassigned';
            });
        }

        const genderEl = document.getElementById('settingsGender');
        if (genderEl) {
            genderEl.addEventListener('change', (e) => {
                const target = document.getElementById('idCardGender');
                if (target) {
                    const val = e.target.value;
                    const genderLabel = {
                        'female': 'Female',
                        'male': 'Male',
                        'other': 'Other',
                        'prefer_not': 'Other'
                    }[val] || val || 'Other';
                    target.textContent = genderLabel;
                }
            });
        }

        const bgEl = document.getElementById('settingsBloodGroup');
        if (bgEl) {
            bgEl.addEventListener('change', (e) => {
                const target = document.getElementById('idCardBloodGroup');
                if (target) target.textContent = e.target.value || '-';
            });
        }

        const jdEl = document.getElementById('settingsJoinDate');
        if (jdEl) {
            jdEl.addEventListener('change', (e) => {
                const target = document.getElementById('idCardJoinDate');
                if (target) {
                    const val = e.target.value;
                    target.textContent = val ? new Date(val).toLocaleDateString('en-GB') : '-';
                }
            });
        }

        const edEl = document.getElementById('settingsExpiryDate');
        if (edEl) {
            edEl.addEventListener('change', (e) => {
                const target = document.getElementById('idCardExpiryDate');
                if (target) {
                    const val = e.target.value;
                    target.textContent = val ? new Date(val).toLocaleDateString('en-GB') : '-';
                }
            });
        }
    }

    bindLiveIDCardPreview();

    // --- ID CARD PREVIEW CONTROLS & EXPORTS ---
    const idCardContainer = document.getElementById('idCardContainer');
    const switcherBtns = document.querySelectorAll('.switcher-btn');

    if (switcherBtns && idCardContainer) {
        switcherBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                switcherBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                idCardContainer.classList.remove('preview-front', 'preview-back', 'preview-sheet');
                
                if (btn.id === 'btnShowFront') {
                    idCardContainer.classList.add('preview-front');
                } else if (btn.id === 'btnShowBack') {
                    idCardContainer.classList.add('preview-back');
                } else if (btn.id === 'btnShowSheet') {
                    idCardContainer.classList.add('preview-sheet');
                }
            });
        });
    }

    // PDF Export function
    const btnDownloadPDF = document.getElementById('btnDownloadPDF');
    if (btnDownloadPDF && idCardContainer) {
        btnDownloadPDF.addEventListener('click', async () => {
            const { jsPDF } = window.jspdf;
            const origHTML = btnDownloadPDF.innerHTML;
            btnDownloadPDF.disabled = true;
            btnDownloadPDF.innerHTML = `<i data-feather="loader"></i> Generating PDF...`;
            feather.replace();

            try {
                const idCardFront = document.getElementById('idCardFront');
                const idCardBack = document.getElementById('idCardBack');
                const originalContainerClass = idCardContainer.className;
                
                // Set class to preview-sheet so both cards are rendered correctly in the DOM
                idCardContainer.className = "id-card-container preview-sheet";
                
                // Render front canvas
                const canvasFront = await html2canvas(idCardFront, {
                    scale: 3,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null
                });
                const imgFront = canvasFront.toDataURL('image/png');

                // Render back canvas
                const canvasBack = await html2canvas(idCardBack, {
                    scale: 3,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null
                });
                const imgBack = canvasBack.toDataURL('image/png');
                
                // Restore preview mode class
                idCardContainer.className = originalContainerClass;

                // Create A4 PDF page (210mm x 297mm)
                const pdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: 'a4'
                });

                // Add header info
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(16);
                pdf.setTextColor(15, 23, 42); // slate-900
                pdf.text("Homesly Employee ID Card", 105, 20, { align: "center" });
                
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(10);
                pdf.setTextColor(100, 116, 139); // slate-500
                pdf.text("Print-ready high-resolution layout. Standard CR80 Dimensions (54mm x 85.6mm).", 105, 26, { align: "center" });

                // Card Dimensions in mm
                const cardW = 54;
                const cardH = 85.6;
                const startY = 45;
                const frontX = 46;
                const backX = frontX + cardW + 10;

                // Add Front & Back card images
                pdf.addImage(imgFront, 'PNG', frontX, startY, cardW, cardH);
                pdf.addImage(imgBack, 'PNG', backX, startY, cardW, cardH);

                // Add cut boundary dotted lines
                pdf.setDrawColor(203, 213, 225); // slate-300
                pdf.setLineDashPattern([2, 2], 0);
                pdf.rect(frontX, startY, cardW, cardH);
                pdf.rect(backX, startY, cardW, cardH);

                // Footer instructions
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(9);
                pdf.setTextColor(148, 163, 184); // slate-400
                pdf.text("Instructions: Cut along the dotted line, fold in half, and laminate.", 105, startY + cardH + 15, { align: "center" });

                const fileName = `homesly_id_card_${appState.profile.employeeId || 'HM-0000'}.pdf`;
                pdf.save(fileName);

                btnDownloadPDF.innerHTML = `<i data-feather="check"></i> PDF Downloaded`;
                setTimeout(() => {
                    btnDownloadPDF.innerHTML = origHTML;
                    btnDownloadPDF.disabled = false;
                    feather.replace();
                }, 2000);

            } catch (err) {
                console.error("PDF generation failed:", err);
                alert("PDF generation failed. Please try again.");
                btnDownloadPDF.innerHTML = origHTML;
                btnDownloadPDF.disabled = false;
                feather.replace();
            }
        });
    }

    const btnPrintCard = document.getElementById('btnPrintCard');
    if (btnPrintCard) {
        btnPrintCard.addEventListener('click', () => {
            window.print();
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

    // Auto-close sidebar on mobile when a nav link is clicked
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
                toggleMobileMenu();
            }
        });
    });

});
