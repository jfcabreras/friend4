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
    platformFeesOwed: 0,
    totalIssuedByCompletedInvites: 0,
    totalPaidByCompletedInvites: 0,
    totalIssuedByCancellationFees: 0,
    totalPaidByCancellationFees: 0,
    pendingPayments: [],
    
    // Comprehensive financial tracking
    issuedForIncentivePayments: 0,
    issuedForCancelledInvites: 0,
    paidForIncentivePayments: 0,
    paidForCancelledInvites: 0,
    pendingPaymentsForIncentives: 0,
    pendingPaymentsForCancelled: 0,
    
    // Payments related to me (as recipient)
    issuedPaymentsForInvitesRelatedToMe: 0,
    issuedPaymentsForCancelledInvitesRelatedToMe: 0,
    receivedPaymentsForInvitesRelatedToMe: 0,
    receivedPaymentsForCancelledInvitesRelatedToMe: 0,
    paymentsForInvitesPendingToReceive: 0,
    paymentsForCancelledInvitesPendingToReceive: 0,
    
    // Payments not related to me (outstanding fees from others)
    receivedPaymentsForInvitesNotRelatedToMe: 0,
    receivedPaymentsForCancelledInvitesNotRelatedToMe: 0,
    
    // Platform fees
    issuedFeesForCancellationsRelatedToMe: 0,
    issuedFeesForInvitesRelatedToMe: 0,
    
    // Final balances
    pendingBalanceToPayToPlatform: 0,
    balanceInFavor: 0
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
        platformFeesOwed: 0,
        totalIssuedByCompletedInvites: 0,
        totalPaidByCompletedInvites: 0,
        totalIssuedByCancellationFees: 0,
        totalPaidByCancellationFees: 0,
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

      // Get sent invites to calculate what user owes
      const sentInvitesQuery = query(
        collection(db, 'planInvitations'),
        where('fromUserId', '==', user.uid)
      );
      const sentInvitesSnapshot = await getDocs(sentInvitesQuery);
      const sentInvites = sentInvitesSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'sent',
        ...doc.data()
      }));

      // Get received invites to calculate what user earned as a pal
      const receivedInvitesQuery = query(
        collection(db, 'planInvitations'),
        where('toUserId', '==', user.uid)
      );
      const receivedInvitesSnapshot = await getDocs(receivedInvitesQuery);
      const receivedInvites = receivedInvitesSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'received',
        ...doc.data()
      }));

      // === COMPREHENSIVE FINANCIAL TRACKING ===
      
      // Initialize all tracking variables
      let totalEarnings = 0;
      let platformFeesOwed = 0;
      
      // 1. ISSUED PAYMENTS (What I owe to others)
      const completedInvites = sentInvites.filter(invite => 
        ['finished', 'payment_done', 'completed'].includes(invite.status)
      );
      const issuedForIncentivePayments = completedInvites.reduce((total, invite) => {
        return total + (invite.price || 0);
      }, 0);

      const cancelledInvitesWithFees = sentInvites.filter(invite => 
        invite.status === 'cancelled' && 
        invite.cancellationFee && invite.cancellationFee > 0
      );
      const issuedForCancelledInvites = cancelledInvitesWithFees.reduce((total, invite) => {
        return total + (invite.cancellationFee || 0);
      }, 0);

      // 2. PAID PAYMENTS (What I've already paid)
      const paidCompletedInvites = sentInvites.filter(invite => 
        invite.status === 'completed' && invite.paymentConfirmed === true
      );
      const paidForIncentivePayments = paidCompletedInvites.reduce((total, invite) => {
        return total + (invite.price || 0);
      }, 0);

      const paidCancellationFees = cancelledInvitesWithFees.filter(invite => 
        invite.cancellationFeePaid === true
      );
      const paidForCancelledInvites = paidCancellationFees.reduce((total, invite) => {
        return total + (invite.cancellationFee || 0);
      }, 0);

      // 3. PENDING PAYMENTS (What I still owe)
      const pendingPaymentsForIncentives = issuedForIncentivePayments - paidForIncentivePayments;
      const pendingPaymentsForCancelled = issuedForCancelledInvites - paidForCancelledInvites;

      // 4. PAYMENTS RELATED TO ME (As recipient - what others should pay me)
      const finishedReceivedInvites = receivedInvites.filter(invite => 
        ['finished', 'payment_done', 'completed'].includes(invite.status)
      );
      const issuedPaymentsForInvitesRelatedToMe = finishedReceivedInvites.reduce((total, invite) => {
        return total + (invite.price || 0);
      }, 0);

      const cancelledReceivedInvites = receivedInvites.filter(invite => 
        invite.status === 'cancelled' && 
        invite.palCompensation && invite.palCompensation > 0
      );
      const issuedPaymentsForCancelledInvitesRelatedToMe = cancelledReceivedInvites.reduce((total, invite) => {
        return total + (invite.palCompensation || 0);
      }, 0);

      // 5. RECEIVED PAYMENTS (What I've actually received)
      const completedReceivedInvites = receivedInvites.filter(invite => 
        invite.status === 'completed' && invite.paymentConfirmed === true
      );
      const receivedPaymentsForInvitesRelatedToMe = completedReceivedInvites.reduce((total, invite) => {
        return total + (invite.price || 0);
      }, 0);

      const paidCancelledReceivedInvites = cancelledReceivedInvites.filter(invite => 
        invite.status === 'cancelled' && 
        invite.palCompensation && invite.palCompensation > 0 &&
        invite.cancellationFeePaid === true
      );
      const receivedPaymentsForCancelledInvitesRelatedToMe = paidCancelledReceivedInvites.reduce((total, invite) => {
        return total + (invite.palCompensation || 0);
      }, 0);

      // 6. PENDING TO RECEIVE (What others still owe me)
      const paymentsForInvitesPendingToReceive = issuedPaymentsForInvitesRelatedToMe - receivedPaymentsForInvitesRelatedToMe;
      const paymentsForCancelledInvitesPendingToReceive = issuedPaymentsForCancelledInvitesRelatedToMe - receivedPaymentsForCancelledInvitesRelatedToMe;

      // 7. PAYMENTS NOT RELATED TO ME (Outstanding fees from others included in my payments)
      let receivedPaymentsForInvitesNotRelatedToMe = 0;
      let receivedPaymentsForCancelledInvitesNotRelatedToMe = 0;

      // Check if I've received payments that included others' outstanding fees
      completedReceivedInvites.forEach(invite => {
        if (invite.pendingFeesIncluded && invite.pendingFeesIncluded > 0) {
          // This payment included outstanding fees from the sender
          receivedPaymentsForInvitesNotRelatedToMe += invite.pendingFeesIncluded;
          
          // These fees collected from others become a debt to the platform
          // that should be added to my platform fees owed
          platformFeesOwed += invite.pendingFeesIncluded;
        }
      });

      // 8. PLATFORM FEES CALCULATION
      let issuedFeesForInvitesRelatedToMe = 0;
      let issuedFeesForCancellationsRelatedToMe = 0;

      if (userProfile.profileType === 'public') {
        // Platform fees on my earnings (completed invites as pal)
        completedReceivedInvites.forEach(invite => {
          const incentiveAmount = invite.incentiveAmount || invite.price || 0;
          const platformFee = invite.platformFee || (incentiveAmount * 0.05);
          issuedFeesForInvitesRelatedToMe += platformFee;
          
          const netEarning = incentiveAmount - platformFee;
          totalEarnings += netEarning;
          
          if (!invite.platformFeePaid) {
            platformFeesOwed += platformFee;
          }
        });

        // Platform fees on cancellation compensation - CORRECTED LOGIC
        cancelledReceivedInvites.forEach(invite => {
          if (invite.palCompensation && invite.palCompensation > 0) {
            const compensation = invite.palCompensation;
            const platformFee = invite.platformFee || (compensation * 0.05);
            issuedFeesForCancellationsRelatedToMe += platformFee;
            
            const netCompensation = compensation - platformFee;
            totalEarnings += netCompensation;
            
            // For cancellation compensation, if payment was made but platform fee not settled
            if (invite.cancellationFeePaid && !invite.platformFeePaid) {
              platformFeesOwed += platformFee;
            }
          }
        });
      }

      // 9. FINAL BALANCE CALCULATIONS
      const totalOwed = pendingPaymentsForIncentives + pendingPaymentsForCancelled + platformFeesOwed;
      const totalToReceive = paymentsForInvitesPendingToReceive + paymentsForCancelledInvitesPendingToReceive;
      
      // Calculate the net balance
      const netBalance = totalToReceive - totalOwed;
      
      const pendingBalanceToPayToPlatform = Math.max(0, -netBalance); // What I owe to platform
      const balanceInFavor = Math.max(0, netBalance); // What platform owes me

      // Update user's pendingBalance field in database if it differs from calculated amount
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      const currentPendingBalance = userDoc.data()?.pendingBalance || 0;
      
      if (Math.abs(currentPendingBalance - totalOwed) > 0.01) { // Update if difference is more than 1 cent
        await updateDoc(userRef, {
          pendingBalance: totalOwed,
          lastBalanceUpdate: new Date()
        });
      }

      // Build pending payments list
      const pendingPayments = [];

      // Add unpaid incentive payments (completed but not confirmed by pal)
      const unpaidCompletedInvites = sentInvites.filter(invite => 
        ['finished', 'payment_done'].includes(invite.status) && 
        invite.status !== 'completed'
      );
      unpaidCompletedInvites.forEach(invite => {
        pendingPayments.push({
          id: invite.id,
          type: 'incentive_payment',
          amount: invite.price || 0,
          description: `Incentive payment for "${invite.title}" to ${invite.toUsername}`,
          date: invite.finishedAt?.toDate?.() || invite.paymentDoneAt?.toDate?.() || new Date(),
          status: invite.status
        });
      });

      // Add unpaid cancellation fees
      const unpaidCancellationFees = cancelledInvitesWithFees.filter(invite => 
        !invite.cancellationFeePaid
      );
      unpaidCancellationFees.forEach(cancelledInvite => {
        pendingPayments.push({
          id: `cancel_fee_${cancelledInvite.id}`,
          type: 'cancellation_fee',
          amount: cancelledInvite.cancellationFee,
          description: `Unpaid cancellation fee for "${cancelledInvite.title}" to ${cancelledInvite.toUsername}`,
          date: cancelledInvite.cancelledAt?.toDate?.() || new Date(),
          inviteId: cancelledInvite.id
        });
      });

      setBalanceData({
        totalOwed,
        totalEarnings,
        cancellationFeesOwed: pendingPaymentsForCancelled,
        incentivePaymentsOwed: pendingPaymentsForIncentives,
        platformFeesOwed,
        // Legacy fields for backward compatibility
        totalIssuedByCompletedInvites: issuedForIncentivePayments,
        totalPaidByCompletedInvites: paidForIncentivePayments,
        totalIssuedByCancellationFees: issuedForCancelledInvites,
        totalPaidByCancellationFees: paidForCancelledInvites,
        pendingPayments: pendingPayments.sort((a, b) => b.date - a.date),
        
        // Comprehensive financial tracking
        issuedForIncentivePayments,
        issuedForCancelledInvites,
        paidForIncentivePayments,
        paidForCancelledInvites,
        pendingPaymentsForIncentives,
        pendingPaymentsForCancelled,
        
        // Payments related to me (as recipient)
        issuedPaymentsForInvitesRelatedToMe,
        issuedPaymentsForCancelledInvitesRelatedToMe,
        receivedPaymentsForInvitesRelatedToMe,
        receivedPaymentsForCancelledInvitesRelatedToMe,
        paymentsForInvitesPendingToReceive,
        paymentsForCancelledInvitesPendingToReceive,
        
        // Payments not related to me (outstanding fees from others)
        receivedPaymentsForInvitesNotRelatedToMe,
        receivedPaymentsForCancelledInvitesNotRelatedToMe,
        
        // Platform fees
        issuedFeesForCancellationsRelatedToMe,
        issuedFeesForInvitesRelatedToMe,
        
        // Final balances
        pendingBalanceToPayToPlatform,
        balanceInFavor
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
        
        {/* Main Balance Overview */}
        <div className="balance-summary">
          <div className="balance-grid">
            <div className="balance-item total-owed">
              <span className="balance-amount">${(balanceData.pendingBalanceToPayToPlatform || 0).toFixed(2)}</span>
              <span className="balance-label">Pending Balance to Pay to Platform</span>
            </div>
            <div className="balance-item balance-favor">
              <span className="balance-amount earnings">${(balanceData.balanceInFavor || 0).toFixed(2)}</span>
              <span className="balance-label">Balance in Favor</span>
            </div>
            {userProfile.profileType === 'public' && (
              <div className="balance-item total-earned">
                <span className="balance-amount earnings">${(balanceData.totalEarnings || 0).toFixed(2)}</span>
                <span className="balance-label">Total Earned</span>
              </div>
            )}
          </div>
        </div>

        {/* Comprehensive Financial Tracking */}
        <div className="comprehensive-financial-tracking">
          <h4>📊 Comprehensive Financial Tracking</h4>
          
          {/* Payments I Issue (What I owe to others) */}
          <div className="financial-category">
            <h5>💸 Payments I Issue (What I owe to others)</h5>
            <div className="financial-grid">
              <div className="financial-item">
                <span className="financial-label">Issued for Incentive Payments:</span>
                <span className="financial-value">${(balanceData.issuedForIncentivePayments || 0).toFixed(2)}</span>
              </div>
              <div className="financial-item">
                <span className="financial-label">Issued for Cancelled Invites:</span>
                <span className="financial-value">${(balanceData.issuedForCancelledInvites || 0).toFixed(2)}</span>
              </div>
              <div className="financial-item success">
                <span className="financial-label">Paid for Incentive Payments:</span>
                <span className="financial-value">${(balanceData.paidForIncentivePayments || 0).toFixed(2)}</span>
              </div>
              <div className="financial-item success">
                <span className="financial-label">Paid for Cancelled Invites:</span>
                <span className="financial-value">${(balanceData.paidForCancelledInvites || 0).toFixed(2)}</span>
              </div>
              <div className="financial-item pending">
                <span className="financial-label">Pending Payments for Incentives:</span>
                <span className="financial-value">${(balanceData.pendingPaymentsForIncentives || 0).toFixed(2)}</span>
              </div>
              <div className="financial-item pending">
                <span className="financial-label">Pending Payments for Cancelled:</span>
                <span className="financial-value">${(balanceData.pendingPaymentsForCancelled || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payments Related to Me (As recipient) */}
          <div className="financial-category">
            <h5>💰 Payments Related to Me (As recipient)</h5>
            <div className="financial-grid">
              <div className="financial-item">
                <span className="financial-label">Issued Payments for Invites Related to Me:</span>
                <span className="financial-value">${(balanceData.issuedPaymentsForInvitesRelatedToMe || 0).toFixed(2)}</span>
              </div>
              <div className="financial-item">
                <span className="financial-label">Issued Payments for Cancelled Invites Related to Me:</span>
                <span className="financial-value">${(balanceData.issuedPaymentsForCancelledInvitesRelatedToMe || 0).toFixed(2)}</span>
              </div>
              <div className="financial-item success">
                <span className="financial-label">Received Payments for Invites Related to Me:</span>
                <span className="financial-value">${(balanceData.receivedPaymentsForInvitesRelatedToMe || 0).toFixed(2)}</span>
              </div>
              <div className="financial-item success">
                <span className="financial-label">Received Payments for Cancelled Invites Related to Me:</span>
                <span className="financial-value">${(balanceData.receivedPaymentsForCancelledInvitesRelatedToMe || 0).toFixed(2)}</span>
              </div>
              <div className="financial-item pending">
                <span className="financial-label">Payments for Invites Pending to Receive:</span>
                <span className="financial-value">${(balanceData.paymentsForInvitesPendingToReceive || 0).toFixed(2)}</span>
              </div>
              <div className="financial-item pending">
                <span className="financial-label">Payments for Cancelled Invites Pending to Receive:</span>
                <span className="financial-value">${(balanceData.paymentsForCancelledInvitesPendingToReceive || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payments Not Related to Me (Outstanding fees from others) */}
          <div className="financial-category">
            <h5>🔄 Payments Not Related to Me (Outstanding fees from others)</h5>
            <div className="financial-grid">
              <div className="financial-item special">
                <span className="financial-label">Received Payments for Invites Not Related to Me:</span>
                <span className="financial-value">${(balanceData.receivedPaymentsForInvitesNotRelatedToMe || 0).toFixed(2)}</span>
              </div>
              <div className="financial-item special">
                <span className="financial-label">Received Payments for Cancelled Invites Not Related to Me:</span>
                <span className="financial-value">${(balanceData.receivedPaymentsForCancelledInvitesNotRelatedToMe || 0).toFixed(2)}</span>
              </div>
            </div>
            <p className="financial-note">
              💡 These represent outstanding fees from other users that were included in payments made to you.
            </p>
          </div>

          {/* Platform Fees */}
          {userProfile.profileType === 'public' && (
            <div className="financial-category">
              <h5>🏛️ Platform Fees</h5>
              <div className="financial-grid">
                <div className="financial-item">
                  <span className="financial-label">Issued Fees for Invites Related to Me:</span>
                  <span className="financial-value">${(balanceData.issuedFeesForInvitesRelatedToMe || 0).toFixed(2)}</span>
                </div>
                <div className="financial-item">
                  <span className="financial-label">Issued Fees for Cancellations Related to Me:</span>
                  <span className="financial-value">${(balanceData.issuedFeesForCancellationsRelatedToMe || 0).toFixed(2)}</span>
                </div>
                <div className="financial-item pending">
                  <span className="financial-label">Platform Fees Owed:</span>
                  <span className="financial-value">${(balanceData.platformFeesOwed || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
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