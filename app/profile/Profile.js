
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
  const [aboutMe, setAboutMe] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePictureFile, setProfilePictureFile] = useState(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');

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
    receivedPaymentsForInvitesNotRelatedToMePaidToPlatform: 0,
    receivedPaymentsForCancelledInvitesNotRelatedToMePaidToPlatform: 0,

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
      setAboutMe(userProfile.aboutMe || '');

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
      setAboutMe('');
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

      // Use stored database values instead of recalculating

      // Get financial data from database stored values
      let platformFeesOwed = 0;

      // 1. ISSUED PAYMENTS (What I owe to others) - from database
      const issuedForIncentivePayments = sentInvites
        .filter(invite => ['finished', 'payment_done', 'completed'].includes(invite.status))
        .reduce((total, invite) => total + (invite.price || 0), 0);

      const issuedForCancelledInvites = sentInvites
        .filter(invite => invite.status === 'cancelled' && invite.cancellationFee && invite.cancellationFee > 0)
        .reduce((total, invite) => total + (invite.cancellationFee || 0), 0);

      // 2. PAID PAYMENTS (What I've already paid) - from database
      const paidForIncentivePayments = sentInvites
        .filter(invite => invite.status === 'completed' && invite.paymentConfirmed === true)
        .reduce((total, invite) => total + (invite.price || 0), 0);

      const paidForCancelledInvites = sentInvites
        .filter(invite => invite.status === 'cancelled' && invite.cancellationFeePaid === true)
        .reduce((total, invite) => total + (invite.cancellationFee || 0), 0);

      // 3. PENDING PAYMENTS (What I still owe) - calculated from database values
      const pendingPaymentsForIncentives = issuedForIncentivePayments - paidForIncentivePayments;
      const pendingPaymentsForCancelled = issuedForCancelledInvites - paidForCancelledInvites;

      // 4. PAYMENTS RELATED TO ME (As recipient) - from database
      const issuedPaymentsForInvitesRelatedToMe = receivedInvites
        .filter(invite => ['finished', 'payment_done', 'completed'].includes(invite.status))
        .reduce((total, invite) => total + (invite.price || 0), 0);

      const issuedPaymentsForCancelledInvitesRelatedToMe = receivedInvites
        .filter(invite => invite.status === 'cancelled' && invite.palCompensation && invite.palCompensation > 0)
        .reduce((total, invite) => total + (invite.palCompensation || 0), 0);

      // 5. RECEIVED PAYMENTS (What I've actually received) - from database
      const receivedPaymentsForInvitesRelatedToMe = receivedInvites
        .filter(invite => invite.status === 'completed' && invite.paymentConfirmed === true)
        .reduce((total, invite) => total + (invite.price || 0), 0);

      const receivedPaymentsForCancelledInvitesRelatedToMe = receivedInvites
        .filter(invite => invite.status === 'cancelled' && invite.palCompensation && invite.palCompensation > 0 && invite.cancellationFeePaid === true)
        .reduce((total, invite) => total + (invite.palCompensation || 0), 0);

      // 6. PENDING TO RECEIVE (What others still owe me) - calculated from database values
      const paymentsForInvitesPendingToReceive = issuedPaymentsForInvitesRelatedToMe - receivedPaymentsForInvitesRelatedToMe;
      const paymentsForCancelledInvitesPendingToReceive = issuedPaymentsForCancelledInvitesRelatedToMe - receivedPaymentsForCancelledInvitesRelatedToMe;

      // 7. PAYMENTS NOT RELATED TO ME (Outstanding fees from others) - from database
      // These are fees collected from other users that were included in payments to me
      let receivedPaymentsForInvitesNotRelatedToMe = 0;
      let receivedPaymentsForCancelledInvitesNotRelatedToMe = 0;
      let receivedPaymentsForInvitesNotRelatedToMePaidToPlatform = 0;
      let receivedPaymentsForCancelledInvitesNotRelatedToMePaidToPlatform = 0;

      receivedInvites.forEach(invite => {
        if (invite.status === 'completed' && invite.paymentConfirmed === true) {
          // Use only the new discriminated fee fields
          if (invite.pendingInviteFeesIncluded && invite.pendingInviteFeesIncluded > 0) {
            receivedPaymentsForInvitesNotRelatedToMe += invite.pendingInviteFeesIncluded;
            // Only count as paid to platform if explicitly confirmed by platform
            if (invite.platformFeesPaidToPlatformConfirmed) {
              receivedPaymentsForInvitesNotRelatedToMePaidToPlatform += invite.pendingInviteFeesIncluded;
            }
          }
          
          if (invite.pendingCancelledInviteFeesIncluded && invite.pendingCancelledInviteFeesIncluded > 0) {
            receivedPaymentsForCancelledInvitesNotRelatedToMe += invite.pendingCancelledInviteFeesIncluded;
            // Only count as paid to platform if explicitly confirmed by platform
            if (invite.platformFeesPaidToPlatformConfirmed) {
              receivedPaymentsForCancelledInvitesNotRelatedToMePaidToPlatform += invite.pendingCancelledInviteFeesIncluded;
            }
          }
        }
      });

      // Also calculate received cancellation fees from other users (when I'm the pal receiving compensation)
      receivedInvites
        .filter(invite => 
          invite.status === 'cancelled' && 
          invite.cancellationFeeRecipient === user.uid &&
          invite.cancellationFeePaid === true &&
          invite.cancellationFeeAmountPaid && 
          invite.cancellationFeeAmountPaid > 0
        )
        .forEach(invite => {
          receivedPaymentsForCancelledInvitesNotRelatedToMe += invite.cancellationFeeAmountPaid || 0;
          // Only count as paid to platform if explicitly confirmed by platform
          if (invite.platformFeesPaidToPlatformConfirmed) {
            receivedPaymentsForCancelledInvitesNotRelatedToMePaidToPlatform += invite.cancellationFeeAmountPaid || 0;
          }
        });

      // 8. PLATFORM FEES - from database stored values
      let issuedFeesForInvitesRelatedToMe = 0;
      let issuedFeesForCancellationsRelatedToMe = 0;

      if (userProfile.profileType === 'public') {
        // Get platform fees from stored values in invites
        receivedInvites.forEach(invite => {
          if (invite.status === 'completed' && invite.paymentConfirmed === true) {
            const platformFee = invite.platformFee || ((invite.price || 0) * 0.05);
            issuedFeesForInvitesRelatedToMe += platformFee;
            if (!invite.platformFeePaid) {
              platformFeesOwed += platformFee;
            }
          }

          if (invite.status === 'cancelled' && invite.palCompensation && invite.palCompensation > 0) {
            const platformFee = invite.platformFee || ((invite.price || 0) * 0.05);
            issuedFeesForCancellationsRelatedToMe += platformFee;
            if (invite.cancellationFeePaid && !invite.platformFeePaid) {
              platformFeesOwed += platformFee;
            }
          }
        });
      }

      // 9. FINAL BALANCE CALCULATIONS - only calculate dynamic balances
      // Platform fees owed to platform (no adjustment - full amount owed)
      const platformFeesOwedToPlatform = platformFeesOwed;
      
      // Outstanding fees collected from others that need to be paid to platform
      // This includes both invite fees and cancelled invite fees that were received but not yet paid to platform
      const outstandingInviteFeesNotPaidToPlatform = receivedPaymentsForInvitesNotRelatedToMe - receivedPaymentsForInvitesNotRelatedToMePaidToPlatform;
      const outstandingCancelledInviteFeesNotPaidToPlatform = receivedPaymentsForCancelledInvitesNotRelatedToMe - receivedPaymentsForCancelledInvitesNotRelatedToMePaidToPlatform;
      const outstandingFeesCollectedNotPaidToPlatform = outstandingInviteFeesNotPaidToPlatform + outstandingCancelledInviteFeesNotPaidToPlatform;
      
      // Total amount owed to platform (own platform fees + outstanding fees collected from others)
      const totalOwedToPlatform = platformFeesOwedToPlatform + Math.max(0, outstandingFeesCollectedNotPaidToPlatform);
      
      const totalOwed = pendingPaymentsForIncentives + pendingPaymentsForCancelled + totalOwedToPlatform;
      const totalToReceive = paymentsForInvitesPendingToReceive + paymentsForCancelledInvitesPendingToReceive;

      // Calculate the net balance dynamically
      const netBalance = totalToReceive - totalOwed;

      const pendingBalanceToPayToPlatform = Math.max(0, totalOwedToPlatform);
      const balanceInFavor = Math.max(0, totalToReceive - totalOwed);

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

      // Get cancelled invites with fees from sent invites
      const cancelledInvitesWithFees = sentInvites.filter(invite => 
        invite.status === 'cancelled' && invite.cancellationFee && invite.cancellationFee > 0
      );

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

      // Calculate total earnings dynamically from both received and pending payments owed to user (net after platform fees)
      const totalEarnings = receivedPaymentsForInvitesRelatedToMe + receivedPaymentsForCancelledInvitesRelatedToMe + paymentsForInvitesPendingToReceive + paymentsForCancelledInvitesPendingToReceive - issuedFeesForInvitesRelatedToMe - issuedFeesForCancellationsRelatedToMe;

      setBalanceData({
        totalOwed,
        totalEarnings,
        cancellationFeesOwed: pendingPaymentsForCancelled,
        incentivePaymentsOwed: pendingPaymentsForIncentives,
        platformFeesOwed: platformFeesOwedToPlatform,
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
        receivedPaymentsForInvitesNotRelatedToMePaidToPlatform,
        receivedPaymentsForCancelledInvitesNotRelatedToMePaidToPlatform,

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
        aboutMe: aboutMe.trim(),
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
      {/* Profile Header - Instagram Style */}
      <div className="profile-header-modern">
        <div className="profile-picture-container">
          <div className="profile-avatar-large">
            {profilePicture ? (
              <img src={profilePicture} alt="Profile" className="profile-picture-modern" />
            ) : (
              <div className="avatar-placeholder-modern">
                {userProfile.username?.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="profile-info-modern">
          <div className="profile-name-row">
            <h1 className="profile-username">{userProfile.username}</h1>
            {!isEditing && (
              <button onClick={() => setIsEditing(true)} className="edit-profile-btn">
                Edit Profile
              </button>
            )}
          </div>

          {/* Stats Row - Instagram Style */}
          <div className="profile-stats-modern">
            <div className="stat-item-modern">
              <span className="stat-number-modern">{userStats.sentInvites}</span>
              <span className="stat-label-modern">Sent</span>
            </div>
            <div className="stat-item-modern">
              <span className="stat-number-modern">{userStats.receivedInvites}</span>
              <span className="stat-label-modern">Received</span>
            </div>
            <div className="stat-item-modern">
              <span className="stat-number-modern">{userStats.acceptedInvites}</span>
              <span className="stat-label-modern">Accepted</span>
            </div>
            <div className="stat-item-modern">
              <span className="stat-number-modern">{userStats.cancelledInvites}</span>
              <span className="stat-label-modern">Cancelled</span>
            </div>
            <div className="stat-item-modern">
              <span className="stat-number-modern">{userStats.favoriteCount}</span>
              <span className="stat-label-modern">Favorites</span>
            </div>
          </div>

          {/* Profile Info */}
          <div className="profile-details-modern">
            <div className="profile-location-modern">
              📍 {userProfile.city}, {userProfile.country}
            </div>
            
            {userProfile.aboutMe && (
              <div className="profile-bio-modern">
                {userProfile.aboutMe}
              </div>
            )}

            <div className="profile-badges-modern">
              <span className={`profile-type-badge ${userProfile.profileType}`}>
                {userProfile.profileType === 'private' ? '🔒 Private' : '🌍 Public'}
              </span>
              <span className="member-since-badge">
                Member since {userProfile.createdAt?.toDate?.()?.getFullYear() || 'Recently'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
        <div className="edit-profile-modal">
          <div className="edit-modal-content">
            <div className="edit-modal-header">
              <h2>Edit Profile</h2>
              <button onClick={() => setIsEditing(false)} className="close-edit-btn">×</button>
            </div>

            <form onSubmit={handleUpdateProfile} className="edit-form-modern">
              <div className="form-section">
                <h3>Basic Information</h3>
                <div className="form-group">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    required
                  />
                </div>
                <div className="form-row">
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
                </div>
                <div className="form-group">
                  <textarea
                    value={aboutMe}
                    onChange={(e) => setAboutMe(e.target.value)}
                    placeholder="Tell people about yourself..."
                    rows="4"
                    maxLength="300"
                    className="about-me-textarea"
                  />
                  <span className="char-count">{aboutMe.length}/300</span>
                </div>
              </div>

              <div className="form-section">
                <h3>Privacy Settings</h3>
                <select
                  value={profileType}
                  onChange={(e) => setProfileType(e.target.value)}
                  className="profile-type-select"
                >
                  <option value="public">Public Profile (Visible for receiving invites)</option>
                  <option value="private">Private Profile (Not discoverable)</option>
                </select>
              </div>

              <div className="form-section">
                <h3>Profile Picture</h3>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureChange}
                  className="file-input-modern"
                />
                {profilePictureFile && (
                  <p className="file-selected">Selected: {profilePictureFile.name}</p>
                )}
              </div>

              <div className="form-section">
                <h3>Activity Preferences</h3>
                <div className="tags-input-container">
                  <div className="tag-input-row">
                    <input
                      type="text"
                      value={newActivity}
                      onChange={(e) => setNewActivity(e.target.value)}
                      placeholder="Add an activity"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addActivity())}
                    />
                    <button type="button" onClick={addActivity} className="add-tag-btn">
                      Add
                    </button>
                  </div>
                  <div className="tags-display">
                    {activityPreferences.map((activity, index) => (
                      <span key={index} className="tag-modern">
                        {activity}
                        <button 
                          type="button" 
                          onClick={() => removeActivity(activity)}
                          className="remove-tag"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>Languages</h3>
                <div className="tags-input-container">
                  <div className="tag-input-row">
                    <input
                      type="text"
                      value={newLanguage}
                      onChange={(e) => setNewLanguage(e.target.value)}
                      placeholder="Add a language"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addLanguage())}
                    />
                    <button type="button" onClick={addLanguage} className="add-tag-btn">
                      Add
                    </button>
                  </div>
                  <div className="tags-display">
                    {languagePreferences.map((language, index) => (
                      <span key={index} className="tag-modern">
                        {language}
                        <button 
                          type="button" 
                          onClick={() => removeLanguage(language)}
                          className="remove-tag"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="edit-actions-modern">
                <button type="submit" disabled={loading} className="save-btn-modern">
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setIsEditing(false)} className="cancel-btn-modern">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activity and Language Tags Display */}
      {!isEditing && (activityPreferences.length > 0 || languagePreferences.length > 0) && (
        <div className="profile-tags-section">
          {activityPreferences.length > 0 && (
            <div className="tags-group">
              <h4>Activities</h4>
              <div className="tags-display-modern">
                {activityPreferences.map((activity, index) => (
                  <span key={index} className="tag-display-modern activity-tag">
                    {activity}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {languagePreferences.length > 0 && (
            <div className="tags-group">
              <h4>Languages</h4>
              <div className="tags-display-modern">
                {languagePreferences.map((language, index) => (
                  <span key={index} className="tag-display-modern language-tag">
                    {language}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="profile-tabs-modern">
        <button 
          className={`tab-btn-modern ${activeTab === 'posts' ? 'active' : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          📝 Posts
        </button>
        <button 
          className={`tab-btn-modern ${activeTab === 'financial' ? 'active' : ''}`}
          onClick={() => setActiveTab('financial')}
        >
          💰 Financial
        </button>
        <button 
          className={`tab-btn-modern ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          ⚙️ Account
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content-modern">
        {activeTab === 'posts' && (
          <div className="posts-tab">
            <UserPosts userId={user?.uid} />
            
            {/* Detailed Activity Statistics */}
            <div className="detailed-stats-section">
              <h4>Activity Statistics</h4>
              <div className="stats-grid-modern">
                <div className="stat-card-modern">
                  <div className="stat-icon-modern">📤</div>
                  <div className="stat-content-modern">
                    <span className="stat-value-modern">{userStats.sentInvites}</span>
                    <span className="stat-description-modern">Invites Sent</span>
                  </div>
                </div>
                <div className="stat-card-modern">
                  <div className="stat-icon-modern">📥</div>
                  <div className="stat-content-modern">
                    <span className="stat-value-modern">{userStats.receivedInvites}</span>
                    <span className="stat-description-modern">Invites Received</span>
                  </div>
                </div>
                <div className="stat-card-modern">
                  <div className="stat-icon-modern">✅</div>
                  <div className="stat-content-modern">
                    <span className="stat-value-modern">{userStats.acceptedInvites}</span>
                    <span className="stat-description-modern">Successfully Completed</span>
                  </div>
                </div>
                <div className="stat-card-modern">
                  <div className="stat-icon-modern">❌</div>
                  <div className="stat-content-modern">
                    <span className="stat-value-modern">{userStats.cancelledInvites}</span>
                    <span className="stat-description-modern">Cancelled Events</span>
                  </div>
                </div>
                <div className="stat-card-modern">
                  <div className="stat-icon-modern">⭐</div>
                  <div className="stat-content-modern">
                    <span className="stat-value-modern">{userStats.favoriteCount}</span>
                    <span className="stat-description-modern">Favorite Pals</span>
                  </div>
                </div>
                <div className="stat-card-modern">
                  <div className="stat-icon-modern">📊</div>
                  <div className="stat-content-modern">
                    <span className="stat-value-modern">
                      {userStats.sentInvites > 0 ? Math.round((userStats.acceptedInvites / userStats.sentInvites) * 100) : 0}%
                    </span>
                    <span className="stat-description-modern">Success Rate</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="share-profile-section">
              <h4>Share Your Profile</h4>
              <p className="share-description">
                {userProfile.profileType === 'public' 
                  ? 'Share this link to let others view your public profile'
                  : 'Your profile is private - others will see a private profile message'
                }
              </p>
              <div className="share-link-container-modern">
                <input
                  type="text"
                  value={`${window.location.origin}/profile/${userProfile.username}`}
                  readOnly
                  className="share-link-input-modern"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/profile/${userProfile.username}`);
                    const btn = event.target;
                    btn.textContent = 'Copied!';
                    setTimeout(() => {
                      btn.textContent = 'Copy';
                    }, 2000);
                  }}
                  className="copy-link-btn-modern"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'financial' && (
          <div className="financial-tab">
            <div className="balance-section-modern">
              <h3>Financial Overview</h3>

              <div className="balance-cards">
                <div className="balance-card earnings">
                  <div className="balance-icon">💰</div>
                  <div className="balance-info">
                    <span className="balance-amount">${(balanceData.balanceInFavor || 0).toFixed(2)}</span>
                    <span className="balance-label">Balance in Favor</span>
                  </div>
                </div>
                
                <div className="balance-card pending">
                  <div className="balance-icon">⏳</div>
                  <div className="balance-info">
                    <span className="balance-amount">${(balanceData.totalOwed || 0).toFixed(2)}</span>
                    <span className="balance-label">Total Owed</span>
                  </div>
                </div>

                {userProfile.profileType === 'public' && (
                  <div className="balance-card total">
                    <div className="balance-icon">📊</div>
                    <div className="balance-info">
                      <span className="balance-amount">${(balanceData.totalEarnings || 0).toFixed(2)}</span>
                      <span className="balance-label">Total Earned</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Detailed Financial Breakdown */}
              <div className="financial-breakdown-modern">
                <h4>Payment Breakdown</h4>
                <div className="breakdown-grid-modern">
                  <div className="breakdown-item-modern">
                    <span className="breakdown-label-modern">Incentive Payments Owed</span>
                    <span className="breakdown-amount-modern">${(balanceData.incentivePaymentsOwed || 0).toFixed(2)}</span>
                  </div>
                  <div className="breakdown-item-modern">
                    <span className="breakdown-label-modern">Cancellation Fees Owed</span>
                    <span className="breakdown-amount-modern">${(balanceData.cancellationFeesOwed || 0).toFixed(2)}</span>
                  </div>
                  {userProfile.profileType === 'public' && (
                    <div className="breakdown-item-modern">
                      <span className="breakdown-label-modern">Platform Fees Owed</span>
                      <span className="breakdown-amount-modern">${(balanceData.platformFeesOwed || 0).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Comprehensive Financial Statistics */}
              <div className="financial-stats-modern">
                <h4>Financial History</h4>
                <div className="financial-stats-grid">
                  <div className="financial-stat-card">
                    <div className="financial-stat-header">
                      <span className="financial-stat-title">Sent Invites</span>
                      <span className="financial-stat-icon">📤</span>
                    </div>
                    <div className="financial-stat-details">
                      <div className="financial-stat-row">
                        <span>Total Issued:</span>
                        <span>${(balanceData.issuedForIncentivePayments || 0).toFixed(2)}</span>
                      </div>
                      <div className="financial-stat-row">
                        <span>Total Paid:</span>
                        <span>${(balanceData.paidForIncentivePayments || 0).toFixed(2)}</span>
                      </div>
                      <div className="financial-stat-row pending">
                        <span>Pending:</span>
                        <span>${(balanceData.pendingPaymentsForIncentives || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="financial-stat-card">
                    <div className="financial-stat-header">
                      <span className="financial-stat-title">Cancellation Fees</span>
                      <span className="financial-stat-icon">❌</span>
                    </div>
                    <div className="financial-stat-details">
                      <div className="financial-stat-row">
                        <span>Total Issued:</span>
                        <span>${(balanceData.issuedForCancelledInvites || 0).toFixed(2)}</span>
                      </div>
                      <div className="financial-stat-row">
                        <span>Total Paid:</span>
                        <span>${(balanceData.paidForCancelledInvites || 0).toFixed(2)}</span>
                      </div>
                      <div className="financial-stat-row pending">
                        <span>Pending:</span>
                        <span>${(balanceData.pendingPaymentsForCancelled || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {userProfile.profileType === 'public' && (
                    <div className="financial-stat-card">
                      <div className="financial-stat-header">
                        <span className="financial-stat-title">As Pal - Earnings</span>
                        <span className="financial-stat-icon">💼</span>
                      </div>
                      <div className="financial-stat-details">
                        <div className="financial-stat-row">
                          <span>Total Issued:</span>
                          <span>${(balanceData.issuedPaymentsForInvitesRelatedToMe || 0).toFixed(2)}</span>
                        </div>
                        <div className="financial-stat-row">
                          <span>Total Received:</span>
                          <span>${(balanceData.receivedPaymentsForInvitesRelatedToMe || 0).toFixed(2)}</span>
                        </div>
                        <div className="financial-stat-row pending">
                          <span>Pending to Receive:</span>
                          <span>${(balanceData.paymentsForInvitesPendingToReceive || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {userProfile.profileType === 'public' && (
                    <div className="financial-stat-card">
                      <div className="financial-stat-header">
                        <span className="financial-stat-title">Platform Fees</span>
                        <span className="financial-stat-icon">🏢</span>
                      </div>
                      <div className="financial-stat-details">
                        <div className="financial-stat-row">
                          <span>From Events:</span>
                          <span>${(balanceData.issuedFeesForInvitesRelatedToMe || 0).toFixed(2)}</span>
                        </div>
                        <div className="financial-stat-row">
                          <span>From Cancellations:</span>
                          <span>${(balanceData.issuedFeesForCancellationsRelatedToMe || 0).toFixed(2)}</span>
                        </div>
                        <div className="financial-stat-row pending">
                          <span>Pending to Pay:</span>
                          <span>${(balanceData.pendingBalanceToPayToPlatform || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {balanceData.pendingPayments.length > 0 && (
                <div className="pending-payments-modern">
                  <h4>Pending Payments</h4>
                  <div className="payments-list-modern">
                    {balanceData.pendingPayments.slice(0, 5).map(payment => (
                      <div key={`${payment.type}-${payment.id}`} className={`payment-item-modern ${payment.type}`}>
                        <div className="payment-info-modern">
                          <span className="payment-description-modern">{payment.description}</span>
                          <span className="payment-date-modern">{payment.date.toLocaleDateString()}</span>
                        </div>
                        <span className={`payment-amount-modern ${payment.type}`}>
                          ${(payment.amount || 0).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {balanceData.pendingPayments.length > 5 && (
                      <div className="more-payments">
                        +{balanceData.pendingPayments.length - 5} more payments
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'account' && (
          <div className="account-tab">
            <div className="account-info-section">
              <h3>Account Information</h3>
              
              <div className="account-details-grid">
                <div className="account-detail">
                  <span className="detail-label">Email</span>
                  <span className="detail-value">{user.email}</span>
                </div>
                
                <div className="account-detail">
                  <span className="detail-label">Email Status</span>
                  <span className={`detail-value ${user.emailVerified ? 'verified' : 'unverified'}`}>
                    {user.emailVerified ? '✅ Verified' : '❌ Not Verified'}
                  </span>
                </div>
                
                <div className="account-detail">
                  <span className="detail-label">Username</span>
                  <span className="detail-value">@{userProfile.username}</span>
                </div>
                
                <div className="account-detail">
                  <span className="detail-label">Profile Type</span>
                  <span className="detail-value">
                    {userProfile.profileType === 'private' 
                      ? '🔒 Private (Not discoverable)'
                      : '🌍 Public (Visible for invites)'
                    }
                  </span>
                </div>
                
                <div className="account-detail">
                  <span className="detail-label">Location</span>
                  <span className="detail-value">📍 {userProfile.city}, {userProfile.country}</span>
                </div>
                
                <div className="account-detail">
                  <span className="detail-label">Member Since</span>
                  <span className="detail-value">
                    📅 {userProfile.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'}
                  </span>
                </div>
                
                <div className="account-detail">
                  <span className="detail-label">Last Updated</span>
                  <span className="detail-value">
                    🔄 {userProfile.updatedAt?.toDate?.()?.toLocaleDateString() || 'Never'}
                  </span>
                </div>
                
                <div className="account-detail">
                  <span className="detail-label">Account ID</span>
                  <span className="detail-value account-id">{user.uid}</span>
                </div>
              </div>
            </div>

            {/* Account Statistics */}
            <div className="account-stats-section">
              <h3>Account Statistics</h3>
              <div className="account-stats-grid">
                <div className="account-stat-item">
                  <div className="account-stat-icon">📊</div>
                  <div className="account-stat-info">
                    <span className="account-stat-number">{userStats.sentInvites + userStats.receivedInvites}</span>
                    <span className="account-stat-label">Total Invites</span>
                  </div>
                </div>
                <div className="account-stat-item">
                  <div className="account-stat-icon">✅</div>
                  <div className="account-stat-info">
                    <span className="account-stat-number">{userStats.acceptedInvites}</span>
                    <span className="account-stat-label">Successful Events</span>
                  </div>
                </div>
                <div className="account-stat-item">
                  <div className="account-stat-icon">⭐</div>
                  <div className="account-stat-info">
                    <span className="account-stat-number">{userStats.favoriteCount}</span>
                    <span className="account-stat-label">Favorite Pals</span>
                  </div>
                </div>
                <div className="account-stat-item">
                  <div className="account-stat-icon">🎯</div>
                  <div className="account-stat-info">
                    <span className="account-stat-number">
                      {userStats.sentInvites > 0 ? Math.round((userStats.acceptedInvites / userStats.sentInvites) * 100) : 0}%
                    </span>
                    <span className="account-stat-label">Success Rate</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Preferences Summary */}
            {(activityPreferences.length > 0 || languagePreferences.length > 0) && (
              <div className="preferences-summary-section">
                <h3>Preferences Summary</h3>
                <div className="preferences-summary-grid">
                  {activityPreferences.length > 0 && (
                    <div className="preference-item">
                      <span className="preference-label">🎯 Activities</span>
                      <span className="preference-count">{activityPreferences.length} preferences</span>
                    </div>
                  )}
                  {languagePreferences.length > 0 && (
                    <div className="preference-item">
                      <span className="preference-label">🗣️ Languages</span>
                      <span className="preference-count">{languagePreferences.length} languages</span>
                    </div>
                  )}
                  <div className="preference-item">
                    <span className="preference-label">📝 About Me</span>
                    <span className="preference-count">
                      {aboutMe ? `${aboutMe.length}/300 characters` : 'Not set'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {errorMessage && <div className="error-message-modern">{errorMessage}</div>}
      {successMessage && <div className="success-message-modern">{successMessage}</div>}
    </div>
  );
};

export default Profile;
