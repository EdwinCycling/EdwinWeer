
import { db } from "./firebase";
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, deleteDoc, doc } from "firebase/firestore";

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
        try {
            const q = query(auditCollectionRef, orderBy('timestamp', 'desc'));
            const snapshot = await getDocs(q);
            
            if (snapshot.size > 50) {
                const docsToDelete = snapshot.docs.slice(50);
                const deletePromises = docsToDelete.map(d => deleteDoc(doc(db, 'users', userId, 'audit_logs', d.id)));
                await Promise.all(deletePromises);
                console.log(`Cleaned up ${docsToDelete.length} old audit logs for user ${userId}`);
            }
        } catch (cleanupError) {
            console.error("Error cleaning up audit logs:", cleanupError);
        }

    } catch (error) {
        console.error("Error logging auth event:", error);
    }
};
