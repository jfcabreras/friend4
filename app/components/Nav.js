"use client";

import React from "react";

const Nav = ({ selectedSection, setSelectedSection, user, onLogout }) => {
  const getSectionTitle = (section) => {
    switch (section) {
      case "home":
        return "Home Feed";
      case "pals":
        return "Explore Pals";
      case "invites":
        return "My Invites";
      case "profile":
        return "Profile Settings";
      case "shareable-profile":
        return "Shareable Profile";
      case "newPublication":
        return "New Post";
      default:
        return "Bukier";
    }
  };

  return (
    <nav className="nav">
      <div className="nav-brand">
        <h1>Bukier</h1>
      </div>

      <div className="nav-center">
        {user && (
          <span className="nav-user">{getSectionTitle(selectedSection)}</span>
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
