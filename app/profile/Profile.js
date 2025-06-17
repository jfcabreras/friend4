
'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';

const Profile = ({ user, userProfile }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [profileType, setProfileType] = useState('public');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showUsernameSetup, setShowUsernameSetup] = useState(false);
  const [userStats, setUserStats] = useState({
    sentInvites: 0,
    receivedInvites: 0,
    acceptedInvites: 0,
    favoriteCount: 0
  });

  useEffect(() => {
    if (userProfile) {
      setUsername(userProfile.username || '');
      setCountry(userProfile.country || '');
      setCity(userProfile.city || '');
      setProfileType(userProfile.profileType || 'public');
      
      // Show username setup if user doesn't have a username
      if (!userProfile.username || !userProfile.usernameSet) {
        setShowUsernameSetup(true);
      } else {
        loadUserStats();
      }
    }
  }, [userProfile, user]);

  const loadUserStats = async () => {
    if (!user?.uid) return;

    try {
      // Count sent invites
      const sentQuery = query(
        collection(db, 'planInvitations'),
        where('fromUserId', '==', user.uid)
      );
      const sentSnapshot = await getDocs(sentQuery);

      // Count received invites
      const receivedQuery = query(
        collection(db, 'planInvitations'),
        where('toUserId', '==', user.uid)
      );
      const receivedSnapshot = await getDocs(receivedQuery);

      // Count accepted invites (both sent and received)
      const acceptedInvites = [
        ...sentSnapshot.docs.map(doc => doc.data()),
        ...receivedSnapshot.docs.map(doc => doc.data())
      ].filter(invite => invite.status === 'accepted');

      setUserStats({
        sentInvites: sentSnapshot.size,
        receivedInvites: receivedSnapshot.size,
        acceptedInvites: acceptedInvites.length,
        favoriteCount: userProfile.favorites?.length || 0
      });
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  };

  const checkUsernameAvailability = async (usernameToCheck) => {
    if (!usernameToCheck.trim()) return false;
    
    try {
      const usernameQuery = query(
        collection(db, 'users'),
        where('username', '==', usernameToCheck.trim())
      );
      const usernameSnapshot = await getDocs(usernameQuery);
      return usernameSnapshot.empty;
    } catch (error) {
      console.error('Error checking username:', error);
      return false;
    }
  };

  const handleUsernameSetup = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMessage('Please enter a username');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const isAvailable = await checkUsernameAvailability(username);
      if (!isAvailable) {
        setErrorMessage('Username already exists. Please choose a different username.');
        setLoading(false);
        return;
      }

      await updateDoc(doc(db, 'users', user.uid), {
        username: username.trim(),
        usernameSet: true
      });

      setSuccessMessage('Username set successfully!');
      setShowUsernameSetup(false);
      
      // Refresh the page to update userProfile
      window.location.reload();
    } catch (error) {
      console.error('Error setting username:', error);
      setErrorMessage('Failed to set username. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // If username is being changed, check availability
      if (username !== userProfile.username) {
        const isAvailable = await checkUsernameAvailability(username);
        if (!isAvailable) {
          setErrorMessage('Username already exists. Please choose a different username.');
          setLoading(false);
          return;
        }
      }

      await updateDoc(doc(db, 'users', user.uid), {
        username: username.trim(),
        country: country.trim(),
        city: city.trim(),
        profileType: profileType,
        updatedAt: new Date()
      });

      setSuccessMessage('Profile updated successfully!');
      setIsEditing(false);
      
      // Reload stats after update
      loadUserStats();
      
      // Refresh the page to update userProfile
      window.location.reload();
    } catch (error) {
      console.error('Error updating profile:', error);
      setErrorMessage('Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="profile-section">
        <h2>Please log in to view your profile</h2>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="profile-section">
        <div className="loading">Loading profile...</div>
      </div>
    );
  }

  if (showUsernameSetup) {
    return (
      <div className="profile-section">
        <div className="username-setup">
          <h2>Complete Your Profile</h2>
          <p>Please choose a username to complete your profile setup:</p>
          
          <form onSubmit={handleUsernameSetup}>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              className="form-input"
              required
            />
            
            <button 
              type="submit" 
              disabled={loading}
              className="form-button"
            >
              {loading ? 'Setting Username...' : 'Set Username'}
            </button>
          </form>
          
          {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
          {successMessage && <p style={{ color: 'green' }}>{successMessage}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-section">
      <div className="profile-header">
        <div className="profile-avatar">
          <div className="avatar-placeholder">
            {userProfile.username?.charAt(0).toUpperCase()}
          </div>
        </div>
        <div className="profile-info">
          {isEditing ? (
            <div className="edit-form">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                required
              />
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country"
                required
              />
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                required
              />
              <select
                value={profileType}
                onChange={(e) => setProfileType(e.target.value)}
              >
                <option value="public">Public Profile (Visible for receiving invites)</option>
                <option value="private">Private Profile (Not discoverable)</option>
              </select>
              <div className="edit-actions">
                <button onClick={handleUpdateProfile} disabled={loading}>
                  {loading ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => {
                  setIsEditing(false);
                  setErrorMessage('');
                  setSuccessMessage('');
                  // Reset form values
                  setUsername(userProfile.username || '');
                  setCountry(userProfile.country || '');
                  setCity(userProfile.city || '');
                  setProfileType(userProfile.profileType || 'public');
                }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="profile-display">
              <h2>{userProfile.username}</h2>
              <p className="profile-email">{user.email}</p>
              <p className="profile-location">📍 {userProfile.city}, {userProfile.country}</p>
              <div className="profile-type">
                <span className={`type-badge ${userProfile.profileType}`}>
                  {userProfile.profileType === 'private' ? '🔒 Private Profile' : '🌍 Public Profile'}
                </span>
              </div>
              <button onClick={() => setIsEditing(true)} className="edit-btn">
                ✏️ Edit Profile
              </button>
            </div>
          )}
        </div>
      </div>

      {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
      {successMessage && <p style={{ color: 'green' }}>{successMessage}</p>}

      <div className="profile-stats">
        <div className="stat-item">
          <span className="stat-number">{userStats.sentInvites}</span>
          <span className="stat-label">Sent Invites</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{userStats.receivedInvites}</span>
          <span className="stat-label">Received Invites</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{userStats.acceptedInvites}</span>
          <span className="stat-label">Accepted</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{userStats.favoriteCount}</span>
          <span className="stat-label">Favorites</span>
        </div>
      </div>

      <div className="profile-details">
        <div className="detail-section">
          <h3>Account Information</h3>
          <div className="detail-item">
            <label>Email:</label>
            <span>{user.email}</span>
          </div>
          <div className="detail-item">
            <label>Profile Type:</label>
            <span>
              {userProfile.profileType === 'private' 
                ? 'Private (Not discoverable by others)'
                : 'Public (Visible for receiving invites)'
              }
            </span>
          </div>
          <div className="detail-item">
            <label>Member Since:</label>
            <span>{userProfile.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'}</span>
          </div>
          <div className="detail-item">
            <label>Email Verified:</label>
            <span className={user.emailVerified ? 'verified' : 'unverified'}>
              {user.emailVerified ? '✅ Verified' : '❌ Not Verified'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
