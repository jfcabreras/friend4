
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

  useEffect(() => {
    if (userProfile) {
      setUsername(userProfile.username || '');
      setCountry(userProfile.country || '');
      setCity(userProfile.city || '');
      setProfileType(userProfile.profileType || 'public');
      
      // Show username setup if user doesn't have a username
      if (!userProfile.username || !userProfile.usernameSet) {
        setShowUsernameSetup(true);
      }
    }
  }, [userProfile]);

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
        profileType: profileType
      });

      setSuccessMessage('Profile updated successfully!');
      setIsEditing(false);
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
        <h2>My Profile</h2>
        {!isEditing && (
          <button 
            onClick={() => setIsEditing(true)}
            className="edit-btn"
          >
            Edit Profile
          </button>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={handleUpdateProfile} className="profile-form">
          <div className="form-group">
            <label>Username:</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label>Profile Type:</label>
            <select
              value={profileType}
              onChange={(e) => setProfileType(e.target.value)}
              className="form-input"
            >
              <option value="public">Public Profile (Visible for receiving invites)</option>
              <option value="private">Private Profile (Not discoverable)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Country:</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label>City:</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="form-input"
              required
            />
          </div>

          <div className="form-actions">
            <button 
              type="submit" 
              disabled={loading}
              className="form-button"
            >
              {loading ? 'Updating...' : 'Update Profile'}
            </button>
            <button 
              type="button" 
              onClick={() => {
                setIsEditing(false);
                setErrorMessage('');
                setSuccessMessage('');
                // Reset form values
                setUsername(userProfile.username || '');
                setCountry(userProfile.country || '');
                setCity(userProfile.city || '');
                setProfileType(userProfile.profileType || 'public');
              }}
              className="cancel-btn"
            >
              Cancel
            </button>
          </div>

          {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
          {successMessage && <p style={{ color: 'green' }}>{successMessage}</p>}
        </form>
      ) : (
        <div className="profile-display">
          <div className="profile-info">
            <div className="info-item">
              <strong>Username:</strong> {userProfile?.username || 'Not set'}
            </div>
            <div className="info-item">
              <strong>Email:</strong> {user.email}
            </div>
            <div className="info-item">
              <strong>Profile Type:</strong> {userProfile?.profileType || 'Not set'}
            </div>
            <div className="info-item">
              <strong>Location:</strong> {userProfile?.city}, {userProfile?.country}
            </div>
            <div className="info-item">
              <strong>Email Verified:</strong> {user.emailVerified ? 'Yes' : 'No'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
