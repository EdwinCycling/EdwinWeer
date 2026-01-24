import React from 'react';

export const AccessDenied: React.FC = () => {
  return (
    <div style={{
      backgroundColor: '#000',
      color: '#0f0',
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: '"Courier New", Courier, monospace',
      padding: '2rem',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 99999,
      textAlign: 'left'
    }}>
      <div style={{ maxWidth: '600px', width: '100%' }}>
        <h1 style={{ borderBottom: '2px solid #0f0', paddingBottom: '10px', marginBottom: '20px' }}>SYSTEM SECURITY ALERT</h1>
        <p style={{ margin: '10px 0', fontSize: '1.2rem', fontWeight: 'bold' }}>ERROR 403: FORBIDDEN</p>
        <p>ACCESS DENIED FROM YOUR CURRENT LOCATION.</p>
        <br/>
        <p>TECHNICAL DIAGNOSTICS:</p>
        <div style={{ border: '1px solid #0f0', padding: '15px', marginTop: '10px' }}>
          <p>STATUS: <span style={{ color: 'red', fontWeight: 'bold' }}>BLOCKED</span></p>
          <p>REASON: GEOGRAPHIC_RESTRICTION_POLICY_VIOLATION</p>
          <p>GATEWAY: SECURE-NODE-X7</p>
          <p>TIMESTAMP: {new Date().toISOString()}</p>
        </div>
        <br/>
        <p>{'>'} CONNECTION TERMINATED...</p>
      </div>
    </div>
  );
};
