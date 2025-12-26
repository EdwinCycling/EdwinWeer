
import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

interface AuditLog {
    userId: string;
    action: 'login' | 'logout' | 'session_start';
    timestamp: any; // FieldValue
    ip?: string;
    userAgent: string;
    platform: string;
    language: string;
}

const getIpAddress = async (): Promise<string | undefined> => {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.warn('Failed to fetch IP address', error);
        return undefined;
    }
};

export const logAuthEvent = async (userId: string, action: 'login' | 'logout' | 'session_start') => {
    if (!db) {
        console.error("Audit Log Failed: Database not initialized");
        return;
    }

    try {
        // console.log(`Attempting to log auth event: ${action} for user ${userId}`);
        const ip = await getIpAddress();
        
        const logEntry: AuditLog = {
            userId,
            action,
            timestamp: serverTimestamp(),
            ip,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language
        };

        // Save to a subcollection 'audit_logs' under the user
        // This keeps data organized per user and protected by user rules
        await addDoc(collection(db, 'users', userId, 'audit_logs'), logEntry);
        console.log("Audit log entry created successfully");
        
    } catch (error) {
        console.error("Error logging auth event:", error);
    }
};
