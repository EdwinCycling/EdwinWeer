
import { db } from "./firebase";
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, deleteDoc, doc } from "firebase/firestore";

interface AuditLog {
    userId: string;
    action: 'login' | 'logout' | 'session_start' | 'account_delete';
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

export const logAuthEvent = async (userId: string, action: 'login' | 'logout' | 'session_start' | 'account_delete') => {
    // We don't want to block the main auth flow for logging
    // So we don't await the entire process if it involves slow network calls
    (async () => {
        if (!db) {
            console.error("Audit Log Failed: Database not initialized");
            return;
        }

        try {
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
            const auditCollectionRef = collection(db, 'users', userId, 'audit_logs');
            await addDoc(auditCollectionRef, logEntry);

            // Cleanup: Keep only the latest 50 records
            const q = query(auditCollectionRef, orderBy('timestamp', 'desc'), limit(100));
            const snapshot = await getDocs(q);
            if (snapshot.docs.length > 50) {
                const deletePromises = snapshot.docs.slice(50).map(doc => deleteDoc(doc.ref));
                await Promise.all(deletePromises);
            }
        } catch (error) {
            console.error("Failed to log auth event", error);
        }
    })();
};
