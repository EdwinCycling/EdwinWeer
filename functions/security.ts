import * as functions from 'firebase-functions';
// import * as admin from 'firebase-admin'; 

// --- SECURITY RECOMMENDATION #3: IP-based Protection ---
// Deploy this to Firebase Cloud Functions to track and block abusive IPs.

export const trackIP = functions.https.onCall((data, context) => {
  // context.rawRequest is available in https.onRequest, but for onCall it's context.rawRequest 
  // (requires specific configuration or use of onRequest instead of onCall for raw HTTP access)
  
  if (!context.rawRequest) {
      console.warn("No rawRequest available - ensure this is called correctly or use https.onRequest");
      return { status: "no_ip_info" };
  }

  const ip = context.rawRequest.ip;
  console.log(`Security Audit - Request from IP: ${ip}`);
  
  // Here you can implement logic to:
  // 1. Store IP in Firestore 'audit_logs' collection
  // 2. Check against a blacklist
  // 3. Rate limit based on IP (if not using the Express proxy)
  
  return { status: "logged", ip: ip };
});
