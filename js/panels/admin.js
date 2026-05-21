// js/panels/admin.js
import { db } from '../services/database.js';
import { auth, onAuthStateChanged, signOut } from '../services/auth.js';
import { 
    collection, onSnapshot, doc, getDoc, updateDoc, setDoc, deleteDoc, getDocs
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAQnSbWBx3R1zciZ4-bv62NS5KC312EotI",
    authDomain: "homesly-stays-group.firebaseapp.com",
    projectId: "homesly-stays-group",
    storageBucket: "homesly-stays-group.firebasestorage.app",
    messagingSenderId: "736880412086",
    appId: "1:736880412086:web:2f3fbf17ea1394d863ed17",
    measurementId: "G-K97L3LB1XJ"
};

const secondaryApp = initializeApp(firebaseConfig, "secondaryApp");
const secondaryAuth = getAuth(secondaryApp);

document.addEventListener('DOMContentLoaded', () => {

    let CURRENT_ADMIN_ID = null;
    let adminProfile = null;
    let usersMap = {};
    let departmentsList = [];
    let attendanceLogs = [];
    let leaveRequests = [];

    const gmtFormat = { timeZone: 'Europe/London' };

    // --- SECURITY GATEWAY & PROFILE FETCH ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (!CURRENT_ADMIN_ID) {
                CURRENT_ADMIN_ID = user.uid;
                
                // Fetch the logged-in admin's profile
                try {
                    const adminRef = doc(db, "users", CURRENT_ADMIN_ID);
                    const adminSnap = await getDoc(adminRef);
                    if (adminSnap.exists()) {
                        adminProfile = { id: CURRENT_ADMIN_ID, ...adminSnap.data() };
                        
                        // Check if disabled
                        if (adminProfile.status === 'disabled') {
                            alert("Your account has been disabled. Please contact your administrator.");
                            await signOut(auth);
                            window.location.replace("login.html");
                            return;
                        }
                    } else {
                        // Safe fallback profile
                        adminProfile = {
                            id: CURRENT_ADMIN_ID,
                            name: "HR Admin",
                            role: "hr_admin",
                            department: "HR"
                        };
                    }

                    // Direct standard employees away from Admin panel
                    if (adminProfile.role === 'employee') {
                        window.location.replace("index.html");
                        return;
                    }

                    initializeAdminUI();
                    triggerRealTimeHRDataPipeline();
                } catch (e) {
                    console.error("Auth security gate error:", e);
                    window.location.replace("login.html");
                }
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


    // --- SPA ROUTING ---
    const navLinks = document.querySelectorAll('.nav-link');
    const viewSections = document.querySelectorAll('.view-section');
    const pageTitleText = document.getElementById('pageTitleText');

    function navigateTo(hash) {
        if (!hash || hash === '') hash = '#admin-dashboard';
        viewSections.forEach(sec => sec.style.display = 'none');
        navLinks.forEach(nav => nav.classList.remove('active'));

        let targetNav = document.querySelector(`.nav-link[href="${hash}"]`);
        if (!targetNav) { 
            targetNav = document.querySelector('.nav-link[href="#admin-dashboard"]'); 
            hash = '#admin-dashboard'; 
        }

        if (targetNav) {
            const targetViewId = targetNav.getAttribute('data-target');
            const targetView = document.getElementById(targetViewId);
            if (targetView) targetView.style.display = 'block';
            targetNav.classList.add('active');

            const titleMap = {
                '#admin-dashboard': 'Employee Attendance Monitoring',
                '#admin-leaves': 'Leave Management Workflow',
                '#admin-employees': 'Employee Directory & Roles',
                '#admin-departments': 'Department Management'
            };
            if (pageTitleText) pageTitleText.textContent = titleMap[hash] || 'HR Portal';
        }
    }

    navigateTo(window.location.hash);
    window.addEventListener('hashchange', () => navigateTo(window.location.hash));


    // --- DATE DISPLAY ---
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', ...gmtFormat };
    const dateDisplay = document.getElementById('currentDateDisplay');
    if (dateDisplay) dateDisplay.textContent = new Date().toLocaleDateString('en-GB', dateOptions) + ' (GMT)';


    // --- ADMIN UI DYNAMICS ---
    function initializeAdminUI() {
        const nameEl = document.querySelector('.user-profile .user-name');
        const roleEl = document.querySelector('.user-profile .user-role');
        const avatarEl = document.querySelector('.user-profile .avatar');

        if (nameEl && adminProfile) nameEl.textContent = adminProfile.name || 'HR Administrator';
        if (roleEl && adminProfile) {
            const roleLabels = {
                'team_lead': 'Team Lead / Dept Admin',
                'hr_admin': 'HR Administrator',
                'super_admin': 'Super Administrator'
            };
            roleEl.textContent = roleLabels[adminProfile.role] || adminProfile.role || 'HR Admin';
        }
        if (avatarEl && adminProfile && adminProfile.avatar) {
            avatarEl.src = adminProfile.avatar;
        }

        // Hide Departments tab for Team Leads
        if (adminProfile && adminProfile.role === 'team_lead') {
            const deptLink = document.querySelector('a[href="#admin-departments"]');
            if (deptLink) deptLink.style.display = 'none';
        }

        // Hide Employee Portal link for Super Admin (CEO)
        if (adminProfile && adminProfile.role === 'super_admin') {
            const employeePortalLink = document.querySelector('a[href="index.html"]');
            if (employeePortalLink) employeePortalLink.style.display = 'none';
        }
    }


    // --- HR MONITORING ENGINE (REAL-TIME SNAPSHOT CORE) ---
    let isPipelineInitialized = false;

    function triggerRealTimeHRDataPipeline() {
        if (isPipelineInitialized) return;
        isPipelineInitialized = true;
        console.log("[HR Admin] Binding real-time websocket pipelines to Firebase...");

        // 1. LIVE USERS SNAPSHOT
        onSnapshot(collection(db, "users"), (snapshot) => {
            snapshot.forEach(docSnap => {
                usersMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
            });
            renderAttendance();
            renderLeaves();
            renderEmployees();
        }, (err) => {
            console.error("[HR Realtime] Users sync error:", err);
        });

        // 2. LIVE DEPARTMENTS SNAPSHOT
        onSnapshot(collection(db, "departments"), (snapshot) => {
            departmentsList = [];
            snapshot.forEach(docSnap => {
                departmentsList.push({ id: docSnap.id, ...docSnap.data() });
            });
            departmentsList.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            renderDepartments();
        }, (err) => {
            console.error("[HR Realtime] Departments sync error:", err);
        });

        // 3. LIVE ATTENDANCE SNAPSHOT
        onSnapshot(collection(db, "attendance_logs"), (querySnapshot) => {
            attendanceLogs = [];
            querySnapshot.forEach(snap => {
                attendanceLogs.push({ id: snap.id, ...snap.data() });
            });
            attendanceLogs.sort((a, b) => new Date(b.clockInTime) - new Date(a.clockInTime));
            renderAttendance();
        }, (err) => {
            console.error("[HR Realtime] Attendance sync error:", err);
        });

        // 4. LIVE LEAVES SNAPSHOT
        onSnapshot(collection(db, "leave_requests"), (querySnapshot) => {
            leaveRequests = [];
            querySnapshot.forEach(snap => {
                leaveRequests.push({ id: snap.id, ...snap.data() });
            });
            leaveRequests.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));
            renderLeaves();
        }, (err) => {
            console.error("[HR Realtime] Leaves sync error:", err);
        });
    }

    // --- RENDERING PIPELINES ---

    function renderAttendance() {
        const tableBody = document.getElementById('globalAttendanceTable');
        if (!tableBody) return;

        let metricActiveShiftsCount = 0;
        let metricLateCount = 0;
        let tableHTML = "";

        const filteredLogs = attendanceLogs.filter(log => {
            const emp = usersMap[log.userId];
            if (!emp) return false;
            // Exclude super admins from normal employee structures
            if (emp.role === 'super_admin') {
                return false;
            }
            if (adminProfile.role === 'team_lead' && emp.department !== adminProfile.department) {
                return false;
            }
            return true;
        });

        for (const log of filteredLogs) {
            const emp = usersMap[log.userId] || { name: "Unknown", designation: "-", department: "N/A" };
            const empName = emp.name;

            const inDateObj = new Date(log.clockInTime);
            const timeOpts = { hour: '2-digit', minute: '2-digit', ...gmtFormat };

            const rawDateStr = inDateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat });
            const inTimeStr = inDateObj.toLocaleTimeString('en-GB', timeOpts);

            let outTimeStr = "--:--";
            let totalHoursStr = '<span style="color:#2563EB"><i data-feather="loader" style="width:12px"></i> Active</span>';
            let statusBadge = '<span class="status-pill status-active">Active Shift</span>';

            const loginHour = parseInt(inDateObj.toLocaleTimeString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }));
            const loginMin = parseInt(inDateObj.toLocaleTimeString('en-GB', { minute: 'numeric', timeZone: 'Europe/London' }));

            let isLate = (loginHour > 9) || (loginHour === 9 && loginMin >= 15);

            if (log.clockOutTime === null) {
                metricActiveShiftsCount++;
                if (isLate) {
                    statusBadge = '<span class="status-pill status-late">Active (Late)</span>';
                }
            } else {
                const outDateObj = new Date(log.clockOutTime);
                outTimeStr = outDateObj.toLocaleTimeString('en-GB', timeOpts);

                const accurateTotalSecs = log.totalSeconds || Math.floor((outDateObj.getTime() - inDateObj.getTime()) / 1000);
                const hours = Math.floor(accurateTotalSecs / 3600);
                const minutes = Math.floor((accurateTotalSecs % 3600) / 60);
                totalHoursStr = `${hours}h ${minutes}m`;

                statusBadge = isLate
                    ? '<span class="status-pill status-late">Late Login</span>'
                    : '<span class="status-pill status-on-time">Logged Out</span>';
            }

            const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat });
            if (isLate && rawDateStr === todayStr && log.clockOutTime === null) {
                metricLateCount++;
            }

            tableHTML += `<tr>
                <td>
                    <strong>${empName}</strong>
                    <div style="font-size: 0.75rem; color: #64748B;">${emp.designation} (${emp.department || 'Unassigned'})</div>
                </td>
                <td>${rawDateStr}</td>
                <td>${inTimeStr}</td>
                <td>${outTimeStr}</td>
                <td><strong>${totalHoursStr}</strong></td>
                <td>${statusBadge}</td>
            </tr>`;
        }

        if (filteredLogs.length === 0) {
            tableHTML = `<tr><td colspan="6" style="text-align:center; padding: 32px 0; color: #64748B;">No tracking data flowing in department yet.</td></tr>`;
        }

        tableBody.innerHTML = tableHTML;
        feather.replace();

        document.getElementById('metricActiveShifts').textContent = metricActiveShiftsCount;
        document.getElementById('metricLateLogins').textContent = metricLateCount;
    }

    function renderLeaves() {
        const leaveTableBody = document.getElementById('globalLeavesTable');
        if (!leaveTableBody) return;

        let metricPendingLeavesCount = 0;
        let leaveHTML = "";

        const filteredLeaves = leaveRequests.filter(req => {
            const emp = usersMap[req.userId];
            if (!emp) return false;
            // Exclude super admins from leave requests list
            if (emp.role === 'super_admin') {
                return false;
            }
            if (adminProfile.role === 'team_lead' && emp.department !== adminProfile.department) {
                return false;
            }
            return true;
        });

        for (const request of filteredLeaves) {
            if (request.status === "Pending") metricPendingLeavesCount++;

            const emp = usersMap[request.userId] || { name: "Unknown" };
            const typeMap = { 'sick': 'Sick Leave', 'half': 'Half Day Leave', 'annual': 'Annual Leave', 'festival': 'Festival Leave' };
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
                    <strong>${emp.name}</strong>
                    <div style="font-size: 0.75rem; color: #64748B;">Notes: ${request.notes || 'None'}</div>
                </td>
                <td>${formattedType}</td>
                <td>${request.startDate}</td>
                <td>${request.endDate}</td>
                <td>${reqDateFormatted}</td>
                <td id="td-${request.id}">${actionHTML}</td>
            </tr>`;
        }

        if (filteredLeaves.length === 0) {
            leaveHTML = `<tr><td colspan="6" style="text-align:center; padding: 32px 0;">No leave requests on department queue.</td></tr>`;
        }

        leaveTableBody.innerHTML = leaveHTML;
        feather.replace();
        bindLeaveActions();

        document.getElementById('metricPendingLeaves').textContent = metricPendingLeavesCount;
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
                    alert("Database write validation failed.");
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
                    alert("Database write validation failed.");
                }
            });
        });
    }

    function renderEmployees() {
        const tableBody = document.getElementById('globalEmployeesTable');
        if (!tableBody) return;

        let tableHTML = "";
        const employees = Object.values(usersMap).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        const filteredEmployees = employees.filter(emp => {
            // Exclude super admins from employee listings
            if (emp.role === 'super_admin') {
                return false;
            }
            if (adminProfile.role === 'team_lead' && emp.department !== adminProfile.department) {
                return false;
            }
            return true;
        });

        for (const emp of filteredEmployees) {
            const mgrName = emp.reportingManager && usersMap[emp.reportingManager] 
                ? usersMap[emp.reportingManager].name 
                : "<span style='color:#94A3B8'>None (Top Level)</span>";

            const roleLabels = {
                'employee': 'Employee',
                'team_lead': 'Team Lead / Dept Admin',
                'hr_admin': 'HR Admin',
                'super_admin': 'Super Admin'
            };
            const roleLabel = roleLabels[emp.role] || emp.role || 'Employee';

            let actionsHTML = "";
            if (adminProfile.role === 'super_admin' || adminProfile.role === 'hr_admin' || adminProfile.role === 'hr') {
                const statusBtnText = emp.status === 'disabled' ? 'Enable' : 'Disable';
                const statusBtnClass = emp.status === 'disabled' ? 'btn-success' : 'btn-danger';
                actionsHTML = `
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="btn btn-secondary btn-sm btn-edit-emp" data-id="${emp.id}"><i data-feather="edit-2" style="width:12px;"></i> Edit</button>
                        <button class="btn btn-secondary btn-sm btn-reset-pw-emp" data-id="${emp.id}" data-email="${emp.email}" title="Send Password Reset Email"><i data-feather="key" style="width:12px;"></i> Reset PW</button>
                        <button class="btn btn-sm btn-toggle-status-emp ${statusBtnClass}" data-id="${emp.id}" data-status="${emp.status || 'active'}" style="padding: 6px 12px; font-size: 0.8rem;">${statusBtnText}</button>
                    </div>
                `;
            } else {
                actionsHTML = `<span style="color:#94A3B8; font-size:0.8rem;">No Actions</span>`;
            }

            tableHTML += `<tr>
                <td>
                    <strong>${emp.name || 'Unnamed'}</strong>
                    <div style="font-size: 0.75rem; color: #64748B;">${emp.email}</div>
                    ${emp.employeeId ? `<div style="font-size: 0.75rem; color: var(--primary); font-weight:600; margin-top:2px;">ID: ${emp.employeeId}</div>` : ''}
                </td>
                <td>${emp.department || "<span style='color:#94A3B8'>Unassigned</span>"}</td>
                <td>
                    <span class="status-pill status-on-time">${roleLabel}</span>
                    ${emp.status === 'disabled' ? '<br><span class="status-pill" style="background:#E2E8F0; color:#64748B; font-size:0.65rem; padding:2px 8px; margin-top:4px; display:inline-block;">Disabled</span>' : ''}
                </td>
                <td>${mgrName}</td>
                <td>${actionsHTML}</td>
            </tr>`;
        }

        if (filteredEmployees.length === 0) {
            tableHTML = `<tr><td colspan="5" style="text-align:center; padding: 32px 0; color: #64748B;">No employees registered.</td></tr>`;
        }

        tableBody.innerHTML = tableHTML;
        feather.replace();

        // Bind Edit clicks
        const editBtns = document.querySelectorAll('.btn-edit-emp');
        editBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const empId = e.currentTarget.getAttribute('data-id');
                openEditEmployeeModal(empId);
            });
        });

        // Bind Reset Password clicks
        const resetPwBtns = document.querySelectorAll('.btn-reset-pw-emp');
        resetPwBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const email = e.currentTarget.getAttribute('data-email');
                if (confirm(`Send a password reset email to ${email}?`)) {
                    try {
                        await sendPasswordResetEmail(auth, email);
                        alert(`Password reset email has been sent to ${email}.`);
                    } catch (err) {
                        console.error("Reset password error:", err);
                        alert("Failed to send reset email: " + err.message);
                    }
                }
            });
        });

        // Bind Toggle Status clicks
        const toggleStatusBtns = document.querySelectorAll('.btn-toggle-status-emp');
        toggleStatusBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const empId = e.currentTarget.getAttribute('data-id');
                const currentStatus = e.currentTarget.getAttribute('data-status');
                const nextStatus = currentStatus === 'disabled' ? 'active' : 'disabled';
                
                if (confirm(`Are you sure you want to ${nextStatus === 'disabled' ? 'disable' : 'enable'} this employee account?`)) {
                    try {
                        await updateDoc(doc(db, "users", empId), { status: nextStatus });
                        console.log(`Employee status toggled to: ${nextStatus}`);
                    } catch (err) {
                        console.error("Toggle status error:", err);
                        alert("Database update failed: " + err.message);
                    }
                }
            });
        });
    }

    function renderDepartments() {
        const tableBody = document.getElementById('globalDepartmentsTable');
        if (!tableBody) return;

        let tableHTML = "";

        departmentsList.forEach(dept => {
            const createdDate = dept.createdAt 
                ? new Date(dept.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...gmtFormat })
                : "N/A";

            let actionsHTML = "";
            if (adminProfile.role === 'super_admin' || adminProfile.role === 'hr_admin' || adminProfile.role === 'hr') {
                actionsHTML = `<button class="btn btn-secondary btn-sm btn-delete-dept" data-id="${dept.id}" style="background:#FEE2E2; color:#991B1B; border-color:#FECACA;"><i data-feather="trash" style="width:12px;"></i> Delete</button>`;
            } else {
                actionsHTML = `<span style="color:#94A3B8; font-size:0.8rem;">No Actions</span>`;
            }

            tableHTML += `<tr>
                <td><strong>${dept.name}</strong></td>
                <td>${createdDate}</td>
                <td>${actionsHTML}</td>
            </tr>`;
        });

        if (departmentsList.length === 0) {
            tableHTML = `<tr><td colspan="3" style="text-align:center; padding: 32px 0; color: #64748B;">No departments configured.</td></tr>`;
        }

        tableBody.innerHTML = tableHTML;
        feather.replace();

        // Bind Delete clicks
        const deleteBtns = document.querySelectorAll('.btn-delete-dept');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const deptId = e.currentTarget.getAttribute('data-id');
                deleteDepartment(deptId);
            });
        });
    }


    // --- DIALOG MODAL & FORM WRITING ACTIONS ---

    function openEditEmployeeModal(empId) {
        const emp = usersMap[empId];
        if (!emp) return;

        document.getElementById('editEmpId').value = empId;
        document.getElementById('editEmpRole').value = emp.role || 'employee';
        document.getElementById('editEmpName').value = emp.name || '';
        document.getElementById('editEmpNumber').value = emp.employeeId || '';
        document.getElementById('editEmpDesignation').value = emp.designation || '';
        document.getElementById('editEmpStatus').value = emp.status || 'active';
        document.getElementById('editEmpGender').value = emp.gender || 'other';
        document.getElementById('editEmpPhone').value = emp.phone || '';

        const deptSelect = document.getElementById('editEmpDept');
        deptSelect.innerHTML = `<option value="">Select Department</option>`;
        departmentsList.forEach(dept => {
            const selected = emp.department === dept.name ? "selected" : "";
            deptSelect.innerHTML += `<option value="${dept.name}" ${selected}>${dept.name}</option>`;
        });

        const managerSelect = document.getElementById('editEmpManager');
        managerSelect.innerHTML = `<option value="">None (Top Level)</option>`;
        Object.values(usersMap).forEach(user => {
            if (user.id !== empId) {
                const selected = emp.reportingManager === user.id ? "selected" : "";
                const roleLabels = {
                    'employee': 'Employee',
                    'team_lead': 'Team Lead',
                    'hr_admin': 'HR Admin',
                    'super_admin': 'Super Admin'
                };
                const roleLabel = roleLabels[user.role] || user.role || 'Employee';
                managerSelect.innerHTML += `<option value="${user.id}" ${selected}>${user.name} (${roleLabel})</option>`;
            }
        });

        document.getElementById('editEmployeeModal').style.display = 'flex';
    }

    const editEmployeeForm = document.getElementById('editEmployeeForm');
    if (editEmployeeForm) {
        editEmployeeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const empId = document.getElementById('editEmpId').value;
            const name = document.getElementById('editEmpName').value;
            const employeeId = document.getElementById('editEmpNumber').value;
            const designation = document.getElementById('editEmpDesignation').value;
            const status = document.getElementById('editEmpStatus').value;
            const gender = document.getElementById('editEmpGender').value;
            const phone = document.getElementById('editEmpPhone').value;
            const role = document.getElementById('editEmpRole').value;
            const department = document.getElementById('editEmpDept').value;
            const reportingManager = document.getElementById('editEmpManager').value;

            try {
                await updateDoc(doc(db, "users", empId), {
                    name: name,
                    employeeId: employeeId,
                    designation: designation,
                    status: status,
                    gender: gender,
                    phone: phone,
                    role: role,
                    department: department,
                    reportingManager: reportingManager
                });
                document.getElementById('editEmployeeModal').style.display = 'none';
                console.log(`[Firestore] Employee ${empId} configuration saved.`);
            } catch (err) {
                console.error("Error updating employee profile:", err);
                alert("Database update rejected.");
            }
        });
    }

    // --- ADD EMPLOYEE CREATION IMPLEMENTATION ---

    function openAddEmployeeModal() {
        const deptSelect = document.getElementById('addEmpDept');
        deptSelect.innerHTML = `<option value="">Select Department</option>`;
        departmentsList.forEach(dept => {
            deptSelect.innerHTML += `<option value="${dept.name}">${dept.name}</option>`;
        });

        const managerSelect = document.getElementById('addEmpManager');
        managerSelect.innerHTML = `<option value="">None (Top Level)</option>`;
        Object.values(usersMap).forEach(user => {
            const roleLabels = {
                'employee': 'Employee',
                'team_lead': 'Team Lead',
                'hr_admin': 'HR Admin',
                'super_admin': 'Super Admin'
            };
            const roleLabel = roleLabels[user.role] || user.role || 'Employee';
            managerSelect.innerHTML += `<option value="${user.id}">${user.name} (${roleLabel})</option>`;
        });

        // Set default temporary password
        document.getElementById('addEmpPassword').value = 'Homesly@2026';
        
        // Generate random employee ID
        document.getElementById('addEmpNumber').value = 'HM-' + Math.floor(1000 + Math.random() * 9000);

        document.getElementById('addEmployeeModal').style.display = 'flex';
    }

    const addEmpBtn = document.getElementById('addEmployeeBtn');
    if (addEmpBtn) {
        addEmpBtn.addEventListener('click', openAddEmployeeModal);
    }

    const addEmployeeForm = document.getElementById('addEmployeeForm');
    if (addEmployeeForm) {
        addEmployeeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('addEmpSubmitBtn');
            const origText = submitBtn.textContent;
            
            const name = document.getElementById('addEmpName').value;
            const email = document.getElementById('addEmpEmail').value;
            const password = document.getElementById('addEmpPassword').value;
            const employeeId = document.getElementById('addEmpNumber').value;
            const designation = document.getElementById('addEmpDesignation').value;
            const phone = document.getElementById('addEmpPhone').value;
            const gender = document.getElementById('addEmpGender').value;
            const status = document.getElementById('addEmpStatus').value;
            const role = document.getElementById('addEmpRole').value;
            const department = document.getElementById('addEmpDept').value;
            const reportingManager = document.getElementById('addEmpManager').value;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating Account...';

            try {
                // 1. Create user in secondary Auth instance
                const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const newUid = userCred.user.uid;

                // 2. Immediately sign out from secondary Auth instance to prevent session hijack
                await secondarySignOut(secondaryAuth);

                // 3. Write user details to Firestore
                await setDoc(doc(db, "users", newUid), {
                    name: name,
                    email: email,
                    employeeId: employeeId,
                    designation: designation,
                    phone: phone,
                    gender: gender,
                    status: status,
                    role: role,
                    department: department,
                    reportingManager: reportingManager,
                    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4F46E5&color=fff`,
                    createdAt: new Date().toISOString()
                });

                document.getElementById('addEmployeeModal').style.display = 'none';
                addEmployeeForm.reset();
                alert(`Employee account created successfully!\n\nEmail: ${email}\nPassword: ${password}`);
            } catch (err) {
                console.error("Error creating employee account:", err);
                alert("Account creation failed: " + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = origText;
            }
        });
    }

    // --- DEPARTMENT MANAGEMENT CRUD IMPLEMENTATION ---

    async function deleteDepartment(deptId) {
        if (confirm(`Delete the department: '${deptId}'? This does not alter assigned employees; they must be reassigned manually.`)) {
            try {
                await deleteDoc(doc(db, "departments", deptId));
                console.log(`[Firestore] Department ${deptId} deleted.`);
            } catch (e) {
                console.error("Error deleting department:", e);
                alert("Database write error.");
            }
        }
    }

    async function addDepartment() {
        const name = prompt("Enter the name of the new department/team:");
        if (!name) return;
        
        const deptId = name.trim().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');

        if (!deptId) {
            alert("Invalid department identifier structure.");
            return;
        }

        try {
            const dRef = doc(db, "departments", deptId);
            const dSnap = await getDoc(dRef);
            if (dSnap.exists()) {
                alert("A department with this name already exists.");
                return;
            }
            await setDoc(dRef, {
                name: name.trim(),
                createdAt: new Date().toISOString()
            });
            console.log(`[Firestore] Department '${name}' successfully configured.`);
        } catch (e) {
            console.error("Error saving department:", e);
            alert("Database write validation failure.");
        }
    }

    const addDeptBtn = document.getElementById('addDepartmentBtn');
    if (addDeptBtn) {
        addDeptBtn.addEventListener('click', addDepartment);
    }

    // --- MOBILE MENU RESPONSIVENESS ---
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
            if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
                toggleMobileMenu();
            }
        });
    });

});
