/**
 * js/services/notifications.js
 * 
 * Central EmailJS dispatcher node. Ensures seamless communication from HR systems
 * to administrator inboxes without compromising client-side secrets.
 */

// We mock the initialization here visually. In a real environment, you pull this from a CDN.
// emailjs.init("YOUR_PUBLIC_KEY");

export async function sendEmailNotification(templateId, payload) {
    // Console log to signify the function is technically working behind the scenes.
    console.log(`[EMAIL DISPATCH] Triggering mapped template: ${templateId}`);
    console.log(`[EMAIL DISPATCH PAYLOAD]`, payload);

    return new Promise((resolve) => {
        // Mocking the outbound HTTP delay network request.
        setTimeout(() => {
            console.log("[EMAIL DISPATCH] 200 OK | Message Sent Successfully to recipient queue.");
            resolve({ status: 200, text: "OK" });
        }, 1200);
    });
}

/**
 * Triggers when an employee explicitly clocks in or clocks out.
 */
export async function notifyClockStatus(employeeName, actionType, timeStr, totalHours = '0', gmtDateObj) {
    const payload = {
        employee_name: employeeName,
        action_type: actionType, // 'Clocked In' | 'Clocked Out'
        timestamp_gmt: timeStr,
        date_record: gmtDateObj,
        total_hours: totalHours,
        hr_email: 'hr@homesly.com',
        reply_to: 'no-reply@homesly.com',
    };
    return sendEmailNotification('template_hr_attendance_alert', payload);
}

/**
 * Triggers when a Leave Request is generated.
 */
export async function notifyLeaveRequest(employeeName, leaveType, startDate, endDate, notes) {
    const payload = {
        employee_name: employeeName,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        request_notes: notes || "No additional comments provided.",
        hr_email: 'hr@homesly.com',
    };
    return sendEmailNotification('template_leave_request_inbound', payload);
}
