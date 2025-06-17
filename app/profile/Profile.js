'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';

const Profile = ({ user, userProfile }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    username: '',
    country: '',
    city: ''
  });
  const [userStats, setUserStats] = useState({
    sentInvites: 0,
    receivedInvites: 0,
    acceptedInvites: 0,
    favoriteCount: 0
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setEditData({
        username: userProfile.username || '',
        country: userProfile.country || '',
        city: userProfile.city || ''
      });
      loadUserStats();
    }
  }, [userProfile, user]);

  const loadUserStats = async () => {
    if (!user) return;

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

  const handleSaveProfile = async () => {
    if (!user || !editData.username || !editData.country || !editData.city) {
      alert('Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        username: editData.username,
        country: editData.country,
        city: editData.city,
        updatedAt: new Date()
      });

      setIsEditing(false);
      alert('Profile updated successfully!');

      // Reload user profile
      window.location.reload();
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="profile-section">
        <h2>Please login to view profile</h2>
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

  return (
    <div className="profile-section">
      <div className="profile-header">
        <div className="profile-avatar">
          {userProfile.username?.charAt(0).toUpperCase()}
        </div>
        <div className="profile-info">
          {isEditing ? (
            <div className="edit-form">
              <input
                type="text"
                value={editData.username}
                onChange={(e) => setEditData(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Username"
              />
              <input
                type="text"
                value={editData.country}
                onChange={(e) => setEditData(prev => ({ ...prev, country: e.target.value }))}
                placeholder="Country"
              />
              <input
                type="text"
                value={editData.city}
                onChange={(e) => setEditData(prev => ({ ...prev, city: e.target.value }))}
                placeholder="City"
              />
              <div className="edit-actions">
                <button onClick={handleSaveProfile} disabled={loading}>
                  {loading ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setIsEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="profile-display">
              <h2>{userProfile.username}</h2>
              <p className="profile-email">{userProfile.email}</p>
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
            <span>{userProfile.email}</span>
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