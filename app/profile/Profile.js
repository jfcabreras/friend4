
'use client';

import React, { useState, useEffect } from 'react';
import { db, storage } from '../../lib/firebase';
import { doc, updateDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, listAll } from 'firebase/storage';

const Profile = ({ user, userProfile }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [profileType, setProfileType] = useState('public');
  const [activityPreferences, setActivityPreferences] = useState([]);
  const [newActivity, setNewActivity] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePictureFile, setProfilePictureFile] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [newMediaFile, setNewMediaFile] = useState(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  
  const [userStats, setUserStats] = useState({
    sentInvites: 0,
    receivedInvites: 0,
    acceptedInvites: 0,
    favoriteCount: 0
  });

  useEffect(() => {
    if (userProfile && user) {
      setUsername(userProfile.username || '');
      setCountry(userProfile.country || '');
      setCity(userProfile.city || '');
      setProfileType(userProfile.profileType || 'public');
      setProfilePicture(userProfile.profilePicture || null);
      setActivityPreferences(userProfile.activityPreferences || []);
      
      loadUserStats();
      loadUserMedia();
    } else if (!user) {
      // Clear all data when user logs out
      setUsername('');
      setCountry('');
      setCity('');
      setProfileType('public');
      setProfilePicture(null);
      setMediaFiles([]);
      setActivityPreferences([]);
      setUserStats({
        sentInvites: 0,
        receivedInvites: 0,
        acceptedInvites: 0,
        favoriteCount: 0
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

  const loadUserMedia = async () => {
    if (!user?.uid) return;
    
    try {
      // Get media metadata from Firestore to check deleted status
      const userMediaRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userMediaRef);
      const userData = userDoc.data();
      const deletedMedia = userData?.deletedMedia || [];
      
      const mediaRef = ref(storage, `users/${user.uid}/media`);
      const mediaList = await listAll(mediaRef);
      
      const mediaUrls = await Promise.all(
        mediaList.items.map(async (item) => {
          // Skip deleted media files
          if (deletedMedia.includes(item.name)) {
            return null;
          }
          
          const url = await getDownloadURL(item);
          return {
            name: item.name,
            url: url,
            type: item.name.toLowerCase().includes('.mp4') || item.name.toLowerCase().includes('.mov') ? 'video' : 'image'
          };
        })
      );
      
      // Filter out null values (deleted media)
      setMediaFiles(mediaUrls.filter(media => media !== null));
    } catch (error) {
      console.error('Error loading user media:', error);
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

  const handleMediaFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        setErrorMessage('Media file must be less than 50MB');
        return;
      }
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        setErrorMessage('Media file must be an image or video file');
        return;
      }
      setNewMediaFile(file);
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

  const uploadMediaFile = async () => {
    if (!newMediaFile || !user?.uid) return;
    
    setUploadingMedia(true);
    setErrorMessage('');
    
    try {
      const timestamp = Date.now();
      const fileExtension = newMediaFile.name.split('.').pop();
      const fileName = `media_${timestamp}.${fileExtension}`;
      const mediaRef = ref(storage, `users/${user.uid}/media/${fileName}`);
      
      await uploadBytes(mediaRef, newMediaFile);
      const downloadURL = await getDownloadURL(mediaRef);
      
      const newMedia = {
        name: fileName,
        url: downloadURL,
        type: newMediaFile.type.startsWith('video/') ? 'video' : 'image'
      };
      
      setMediaFiles(prev => [...prev, newMedia]);
      setNewMediaFile(null);
      setSuccessMessage('Media file uploaded successfully!');
      
      // Reset file input
      const fileInput = document.getElementById('media-file-input');
      if (fileInput) fileInput.value = '';
      
    } catch (error) {
      console.error('Error uploading media file:', error);
      setErrorMessage('Failed to upload media file. Please try again.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const deleteMediaFile = async (fileName) => {
    if (!user?.uid || !fileName) return;
    
    try {
      setErrorMessage('');
      
      // Mark file as deleted in user document instead of physically deleting
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data();
      const currentDeletedMedia = userData?.deletedMedia || [];
      
      // Add the file to deleted media list
      const updatedDeletedMedia = [...currentDeletedMedia, fileName];
      
      await updateDoc(userRef, {
        deletedMedia: updatedDeletedMedia
      });
      
      // Remove from UI
      setMediaFiles(prev => prev.filter(media => media.name !== fileName));
      setSuccessMessage('Media file deleted successfully!');
      
    } catch (error) {
      console.error('Error deleting media file:', error);
      setErrorMessage('Failed to delete media file. Please try again.');
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

      <div className="media-section">
        <h3>Media Gallery</h3>
        
        <div className="media-upload">
          <input
            id="media-file-input"
            type="file"
            accept="image/*,video/*"
            onChange={handleMediaFileChange}
            style={{ display: 'none' }}
          />
          <label htmlFor="media-file-input" className="upload-btn">
            📎 Add Photo/Video
          </label>
          
          {newMediaFile && (
            <div className="media-upload-preview">
              <p>Selected: {newMediaFile.name}</p>
              <button 
                onClick={uploadMediaFile} 
                disabled={uploadingMedia}
                className="upload-confirm-btn"
              >
                {uploadingMedia ? 'Uploading...' : 'Upload Media'}
              </button>
            </div>
          )}
        </div>

        <div className="media-grid">
          {mediaFiles.map((media, index) => (
            <div key={index} className="media-item">
              {media.type === 'video' ? (
                <video controls className="media-preview">
                  <source src={media.url} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <img src={media.url} alt={`Media ${index + 1}`} className="media-preview" />
              )}
              <button 
                className="delete-media-btn"
                onClick={() => deleteMediaFile(media.name)}
                title="Delete media"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
        
        {mediaFiles.length === 0 && (
          <p className="no-media">No media files uploaded yet.</p>
        )}
      </div>
    </div>
  );
};

export default Profile;
