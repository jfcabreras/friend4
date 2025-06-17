
'use client';

import React from 'react';

const Nav = ({ selectedSection, setSelectedSection, user }) => {
  return (
    <nav className="nav">
      <div className="nav-brand">
        <h1>Social Tasks</h1>
      </div>
      
      <div className="nav-center">
        {user && (
          <span className="nav-user">
            Welcome, {user.email}
          </span>
        )}
      </div>
      
      <div className="nav-actions">
        {!user ? (
          <button 
            onClick={() => setSelectedSection('login')} 
            className="nav-login-btn"
          >
            Login
          </button>
        ) : (
          <div className="nav-status">
            {user.emailVerified ? '✅' : '⏳'}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Nav;
