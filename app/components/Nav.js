"use client";

import React from "react";

const Nav = ({ selectedSection, setSelectedSection, user, onLogout }) => {
  return (
    <nav className="nav">
      <div className="nav-brand">
        <h1>Book a Pal</h1>
      </div>

      <div className="nav-center">
        {user && selectedSection !== "profile" && (
          <span className="nav-user">Welcome, {user.email}</span>
        )}
        {user && selectedSection === "profile" && (
          <span className="nav-user">Profile Settings</span>
        )}
      </div>

      <div className="nav-actions">
        {!user ? (
          <button
            onClick={() => setSelectedSection("login")}
            className="nav-login-btn"
          >
            Login
          </button>
        ) : selectedSection === "profile" ? (
          <button onClick={onLogout} className="nav-logout-btn">
            🚪 Logout
          </button>
        ) : (
          <div className="nav-status">{user.emailVerified ? "✅" : "⏳"}</div>
        )}
      </div>
    </nav>
  );
};

export default Nav;
