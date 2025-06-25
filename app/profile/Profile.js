
'use client';

import React, { useState, useEffect } from 'react';
import { db, storage } from '../../lib/firebase';
import { doc, updateDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, listAll } from 'firebase/storage';
import UserPosts from './UserPosts';

const Profile = ({ user, userProfile }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [profileType, setProfileType] = useState('public');
  const [activityPreferences, setActivityPreferences] = useState([]);
  const [newActivity, setNewActivity] = useState('');
  const [languagePreferences, setLanguagePreferences] = useState([]);
  const [newLanguage, setNewLanguage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePictureFile, setProfilePictureFile] = useState(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  
  const [userStats, setUserStats] = useState({
    sentInvites: 0,
    receivedInvites: 0,
    acceptedInvites: 0,
    cancelledInvites: 0,
    favoriteCount: 0
  });
  
  const [balanceData, setBalanceData] = useState({
    totalOwed: 0,
    totalEarnings: 0,
    cancellationFeesOwed: 0,
    incentivePaymentsOwed: 0,
    pendingPayments: []
  });

  useEffect(() => {
    if (userProfile && user) {
      setUsername(userProfile.username || '');
      setCountry(userProfile.country || '');
      setCity(userProfile.city || '');
      setProfileType(userProfile.profileType || 'public');
      setProfilePicture(userProfile.profilePicture || null);
      setActivityPreferences(userProfile.activityPreferences || []);
      setLanguagePreferences(userProfile.languagePreferences || []);
      
      loadUserStats();
    } else if (!user) {
      // Clear all data when user logs out
      setUsername('');
      setCountry('');
      setCity('');
      setProfileType('public');
      setProfilePicture(null);
      setActivityPreferences([]);
      setLanguagePreferences([]);
      setUserStats({
        sentInvites: 0,
        receivedInvites: 0,
        acceptedInvites: 0,
        cancelledInvites: 0,
        favoriteCount: 0
      });
      setBalanceData({
        totalOwed: 0,
        totalEarnings: 0,
        cancellationFeesOwed: 0,
        incentivePaymentsOwed: 0,
        pendingPayments: []
      });
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

      // Count cancelled invites (both sent and received)
      const cancelledInvites = [
        ...sentSnapshot.docs.map(doc => doc.data()),
        ...receivedSnapshot.docs.map(doc => doc.data())
      ].filter(invite => invite.status === 'cancelled');

      setUserStats({
        sentInvites: sentSnapshot.size,
        receivedInvites: receivedSnapshot.size,
        acceptedInvites: acceptedInvites.length,
        cancelledInvites: cancelledInvites.length,
        favoriteCount: userProfile.favorites?.length || 0
      });

      // Calculate balance - only what users need to pay to pals
      const allInvites = [
        ...sentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        ...receivedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      ];

      // Only show total earnings for public users (pals)
      const totalEarnings = userProfile.profileType === 'public' ? (userProfile.totalEarnings || 0) : 0;

      // Calculate incentives owed for accepted invites where user is the sender (not yet completed)
      const acceptedSentInvites = allInvites.filter(invite => 
        invite.status === 'accepted' && invite.fromUserId === user.uid
      );

      // Get all cancelled invites where user was charged a fee and check payment status
      const userCancelledInvites = allInvites.filter(invite => 
        invite.status === 'cancelled' && 
        invite.fromUserId === user.uid &&
        invite.cancelledBy === user.uid &&
        invite.cancellationFee && invite.cancellationFee > 0
      );

      // Calculate unpaid cancellation fees by checking cancellationFeePaid field directly
      const unpaidCancelledServices = userCancelledInvites.filter(invite => 
        !invite.cancellationFeePaid
      );

      const totalUnpaidCancellationFees = unpaidCancelledServices.reduce((total, invite) => {
        return total + (invite.cancellationFee || 0);
      }, 0);
      const cancellationFeesOwed = totalUnpaidCancellationFees;

      const incentivePaymentsOwed = acceptedSentInvites.reduce((total, invite) => {
        return total + (invite.price || 0);
      }, 0);

      // Total amount user owes (incentives + unpaid cancellation fees)
      const totalOwed = incentivePaymentsOwed + cancellationFeesOwed;

      // Build pending payments list
      const pendingPayments = [];

      // Add incentive payments
      acceptedSentInvites.forEach(invite => {
        pendingPayments.push({
          id: invite.id,
          type: 'incentive_payment',
          amount: invite.price || 0,
          description: `Incentive payment for "${invite.title}" to ${invite.toUsername}`,
          date: invite.respondedAt?.toDate?.() || new Date()
        });
      });

      // Add unpaid cancellation fees (only if there are actual unpaid fees)
      if (unpaidCancelledServices.length > 0) {
        // Add each unpaid cancellation fee as a separate line item for clarity
        unpaidCancelledServices.forEach(cancelledInvite => {
          pendingPayments.push({
            id: `cancel_fee_${cancelledInvite.id}`,
            type: 'cancellation_fee',
            amount: cancelledInvite.cancellationFee,
            description: `Unpaid cancellation fee for "${cancelledInvite.title}" to ${cancelledInvite.toUsername}`,
            date: cancelledInvite.cancelledAt?.toDate?.() || new Date(),
            inviteId: cancelledInvite.id
          });
        });
      }

      setBalanceData({
        totalOwed,
        totalEarnings,
        cancellationFeesOwed,
        incentivePaymentsOwed,
        pendingPayments: pendingPayments.sort((a, b) => b.date - a.date)
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

  const handleProfilePictureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setErrorMessage('Profile picture must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        setErrorMessage('Profile picture must be an image file');
        return;
      }
      setProfilePictureFile(file);
    }
  };

  const uploadProfilePicture = async () => {
    if (!profilePictureFile || !user?.uid) return null;
    
    setUploadingPicture(true);
    try {
      const timestamp = Date.now();
      const fileExtension = profilePictureFile.name.split('.').pop();
      const fileName = `profile_${timestamp}.${fileExtension}`;
      const profilePicRef = ref(storage, `users/${user.uid}/profile/${fileName}`);
      
      await uploadBytes(profilePicRef, profilePictureFile);
      const downloadURL = await getDownloadURL(profilePicRef);
      
      setUploadingPicture(false);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      setUploadingPicture(false);
      return null;
    }
  };

  const addActivity = () => {
    if (newActivity.trim() && !activityPreferences.includes(newActivity.trim())) {
      setActivityPreferences(prev => [...prev, newActivity.trim()]);
      setNewActivity('');
    }
  };

  const removeActivity = (activity) => {
    setActivityPreferences(prev => prev.filter(pref => pref !== activity));
  };

  const addLanguage = () => {
    if (newLanguage.trim() && !languagePreferences.includes(newLanguage.trim())) {
      setLanguagePreferences(prev => [...prev, newLanguage.trim()]);
      setNewLanguage('');
    }
  };

  const removeLanguage = (language) => {
    setLanguagePreferences(prev => prev.filter(pref => pref !== language));
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

      // Upload profile picture if a new one was selected
      let profilePictureUrl = profilePicture;
      if (profilePictureFile) {
        profilePictureUrl = await uploadProfilePicture();
        if (!profilePictureUrl) {
          setErrorMessage('Failed to upload profile picture. Please try again.');
          setLoading(false);
          return;
        }
      }

      const updateData = {
        username: username.trim(),
        country: country.trim(),
        city: city.trim(),
        profileType: profileType,
        activityPreferences: activityPreferences,
        languagePreferences: languagePreferences,
        updatedAt: new Date()
      };

      if (profilePictureUrl) {
        updateData.profilePicture = profilePictureUrl;
      }

      await updateDoc(doc(db, 'users', user.uid), updateData);

      setSuccessMessage('Profile updated successfully!');
      setIsEditing(false);
      setProfilePictureFile(null);
      
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

  

  return (
    <div className="profile-section">
      <div className="profile-header">
        <div className="profile-avatar">
          {profilePicture ? (
            <img src={profilePicture} alt="Profile" className="profile-picture" />
          ) : (
            <div className="avatar-placeholder">
              {userProfile.username?.charAt(0).toUpperCase()}
            </div>
          )}
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
              
              <div className="profile-picture-upload">
                <label htmlFor="profile-picture-input">Profile Picture:</label>
                <input
                  id="profile-picture-input"
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureChange}
                />
                {profilePictureFile && (
                  <p className="file-selected">Selected: {profilePictureFile.name}</p>
                )}
                {uploadingPicture && <p>Uploading profile picture...</p>}
              </div>

              <div className="activity-preferences-section">
                <label>Activity Preferences:</label>
                <div className="activity-input">
                  <input
                    type="text"
                    value={newActivity}
                    onChange={(e) => setNewActivity(e.target.value)}
                    placeholder="Add an activity (e.g., hiking, coffee, movies)"
                    onKeyPress={(e) => e.key === 'Enter' && addActivity()}
                  />
                  <button type="button" onClick={addActivity} className="add-activity-btn">
                    Add
                  </button>
                </div>
                <div className="activity-tags">
                  {activityPreferences.map((activity, index) => (
                    <span key={index} className="activity-tag">
                      {activity}
                      <button 
                        type="button" 
                        onClick={() => removeActivity(activity)}
                        className="remove-activity"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="activity-preferences-section">
                <label>Languages:</label>
                <div className="activity-input">
                  <input
                    type="text"
                    value={newLanguage}
                    onChange={(e) => setNewLanguage(e.target.value)}
                    placeholder="Add a language (e.g., English, Spanish, French)"
                    onKeyPress={(e) => e.key === 'Enter' && addLanguage()}
                  />
                  <button type="button" onClick={addLanguage} className="add-activity-btn">
                    Add
                  </button>
                </div>
                <div className="activity-tags">
                  {languagePreferences.map((language, index) => (
                    <span key={index} className="activity-tag">
                      {language}
                      <button 
                        type="button" 
                        onClick={() => removeLanguage(language)}
                        className="remove-activity"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              
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
                  setActivityPreferences(userProfile.activityPreferences || []);
                  setLanguagePreferences(userProfile.languagePreferences || []);
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

      {!isEditing && (
        <div className="activity-preferences-display">
          <h3>Activity Preferences</h3>
          {activityPreferences.length > 0 ? (
            <div className="activity-tags-display">
              {activityPreferences.map((activity, index) => (
                <span key={index} className="activity-tag-display">
                  {activity}
                </span>
              ))}
            </div>
          ) : (
            <p className="no-activities">No activity preferences set.</p>
          )}
        </div>
      )}

      {!isEditing && (
        <div className="activity-preferences-display">
          <h3>Languages</h3>
          {languagePreferences.length > 0 ? (
            <div className="activity-tags-display">
              {languagePreferences.map((language, index) => (
                <span key={index} className="activity-tag-display">
                  {language}
                </span>
              ))}
            </div>
          ) : (
            <p className="no-activities">No languages set.</p>
          )}
        </div>
      )}

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
          <span className="stat-number">{userStats.cancelledInvites}</span>
          <span className="stat-label">Cancelled</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{userStats.favoriteCount}</span>
          <span className="stat-label">Favorites</span>
        </div>
      </div>

      <div className="balance-section">
        <h3>Financial Summary</h3>
        <div className="balance-summary">
          <div className="balance-grid">
            <div className="balance-item total-owed">
              <span className="balance-amount">${(balanceData.totalOwed || 0).toFixed(2)}</span>
              <span className="balance-label">Total to Pay</span>
            </div>
            {userProfile.profileType === 'public' && (
              <div className="balance-item total-earned">
                <span className="balance-amount earnings">${(balanceData.totalEarnings || 0).toFixed(2)}</span>
                <span className="balance-label">Total Earned</span>
              </div>
            )}
          </div>
          <div className="balance-breakdown">
            <div className="balance-detail">
              <span className="balance-type">Incentive Payments:</span>
              <span className="balance-value incentive">${(balanceData.incentivePaymentsOwed || 0).toFixed(2)}</span>
            </div>
            <div className="balance-detail">
              <span className="balance-type">Unpaid Cancellation Fees:</span>
              <span className="balance-value cancellation">${(balanceData.cancellationFeesOwed || 0).toFixed(2)}</span>
            </div>
            {userProfile.profileType === 'public' && (
              <div className="balance-detail">
                <span className="balance-type">Your Earnings:</span>
                <span className="balance-value earnings">${(balanceData.totalEarnings || 0).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {balanceData.pendingPayments.length > 0 && (
          <div className="pending-payments">
            <h4>Pending Payments</h4>
            <div className="payments-list">
              {balanceData.pendingPayments.map(payment => (
                <div key={`${payment.type}-${payment.id}`} className={`payment-item ${payment.type}`}>
                  <div className="payment-info">
                    <span className="payment-description">{payment.description}</span>
                    <span className="payment-date">{payment.date.toLocaleDateString()}</span>
                  </div>
                  <span className={`payment-amount ${payment.type}`}>
                    ${(payment.amount || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {balanceData.pendingPayments.length === 0 && (
          <p className="no-pending">No pending payments</p>
        )}
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

      <div className="share-link-container">
        <h4>Share Your Profile</h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 12px 0' }}>
          {userProfile.profileType === 'public' 
            ? 'Share this link to let others view your public profile'
            : 'Your profile is private - others will see a private profile message'
          }
        </p>
        <div className="share-link-input-container">
          <input
            type="text"
            value={`${window.location.origin}/profile/${userProfile.username}`}
            readOnly
            className="share-link-input"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/profile/${userProfile.username}`);
              const btn = document.querySelector('.copy-link-btn');
              btn.textContent = 'Copied!';
              btn.classList.add('copied');
              setTimeout(() => {
                btn.textContent = 'Copy Link';
                btn.classList.remove('copied');
              }, 2000);
            }}
            className="copy-link-btn"
          >
            Copy Link
          </button>
        </div>
      </div>

      <div className="user-posts-section">
        <h3>My Posts</h3>
        <UserPosts userId={user?.uid} />
      </div>
    </div>
  );
};

export default Profile;
