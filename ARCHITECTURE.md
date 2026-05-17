# Homesly HRMS - Backend & Data Architecture Strategy

To transform this system from a frontend UI into a fully-functional, secure, production-ready HRMS, we must transition to a robust Backend-as-a-Service (BaaS) and modularize the codebase. 

Here is the complete clarification and architectural plan for the Homesly HRMS backend.

## 1. Where will data be stored?
* **Database Type:** We will use **Firebase (Firestore)**, which is a highly scalable real-time NoSQL database perfectly tuned for real-time live clock-in syncing.
* **Storage Location:** It will be a real, cloud-hosted database (no longer `localStorage`). 
* **Data Persistence:** Every time an employee clocks in/out, a document is permanently pushed to an `attendance_logs` collection. Leaves will be stored in a `leave_requests` collection.

## 2. HR Monitoring Functionality (Admin Role)
To support HR monitoring, the system will use **Role-Based Access Control (RBAC)**.
* **How it works:** When a user logs in, the database checks a `role` field on their profile. 
* **Admin Panel:** If `role === 'hr'`, they are redirected to a dedicated **HR Dashboard** where the database fetches a global feed of *all* employees.
* **Tracking:** Firestore will calculate elapsed timestamps. HR will have table views to track who is currently active, daily late logins (comparing `clock_in_time` against standard 09:00 GMT), and pending leave approvals.

## 3. Email Notification System
* **Email Service:** We will use **EmailJS** for lightning-fast implementation directly within the frontend, or **Resend** triggered by Firebase Cloud Functions. 
* **Implementation:** When the `Submit Request` or `Clock In` button is pressed, the data payload (Name, Time GMT, Leave Details) is securely routed to the EmailJS/Resend API, securely dispatching an automatic template email to `hr@homesly.com`.

## 4. Technical Stack Clarification
* **Frontend:** Modular Vanilla JavaScript, HTML5, and CSS3 Spaces (Maintains the exact UI/UX Fluid Team feel perfectly without bulky framework overhead).
* **Backend:** Firebase (Authentication and Firestore NoSQL).
* **Authentication:** Firebase Auth (Secure Email & Password authentication; tracks unique `uid` mapped to employee data).
* **Roles:** Enforced securely via Firestore Rules and custom user document fields.
* **Deployment/Hosting:** **Vercel** or **GitHub Pages**. Since we are utilizing a BaaS, we can host the fast static frontend on Vercel for free, which will securely communicate with the Firebase cloud database instantly worldwide.

## 5. Required Functional Modules (Project Structure)
I have restructured the GitHub repository professionally to separate concerns:
- `/services/` -> Dedicated files for `auth`, `database`, and `email` configurations.
- `/panels/` -> Separated logic for the `employee.js` view and the `admin.js` monitoring view.
- `/docs/` -> Contains technical architecture guidelines.

*Once you review and approve this configuration, we will generate the Firebase configuration keys and inject them into the services folder to make the system fully live!*
