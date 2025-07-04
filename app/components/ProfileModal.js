'use client';

import React, { useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove, addDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const ProfileModal = ({ 
  showModal, 
  onClose, 
  selectedPal, 
  selectedPalPosts, 
  loadingPalPosts, 
  favorites, 
  setFavorites, 
  user, 
  userProfile,
  formatTimeAgo,
  onSendInvite,
  onFavoriteChange // Add callback to refresh parent data
}) => {
  
  // Reload user profile when modal opens to get fresh data
  useEffect(() => {
    if (showModal && onFavoriteChange) {
      // Call the refresh function to get fresh data from database
      onFavoriteChange();
    }
  }, [showModal, onFavoriteChange]);

  // Update favorites when userProfile changes, but only when modal first opens
  useEffect(() => {
    if (showModal && userProfile && userProfile.favorites) {
      setFavorites(userProfile.favorites);
    }
  }, [showModal, userProfile?.favorites, setFavorites]);
  const toggleFavorite = async (palId, event) => {
    if (!user?.uid || !event) return;

    // Prevent any automatic triggering
    event.preventDefault();
    event.stopPropagation();

    try {
      const isFavorite = favorites.includes(palId);
      const userRef = doc(db, 'users', user.uid);

      // Update database first and wait for completion
      if (isFavorite) {
        await updateDoc(userRef, {
          favorites: arrayRemove(palId)
        });
        console.log('Removed from favorites:', palId);
      } else {
        await updateDoc(userRef, {
          favorites: arrayUnion(palId)
        });
        console.log('Added to favorites:', palId);
      }

      // Update local state immediately after successful database update
      if (isFavorite) {
        setFavorites(prev => prev.filter(id => id !== palId));
      } else {
        setFavorites(prev => [...prev, palId]);
      }

      // Refresh user profile after a brief delay to ensure database consistency
      if (onFavoriteChange) {
        setTimeout(async () => {
          await onFavoriteChange();
        }, 100);
      }
    } catch (error) {
      console.error('Error updating favorites:', error);
      // Revert local state on error
      // Don't change local state if database update failed
    }
  };

  if (!showModal || !selectedPal) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <div className="profile-modal-header">
          <div className="profile-avatar-large">
            {selectedPal.profilePicture ? (
              <img src={selectedPal.profilePicture} alt={`${selectedPal.username}'s profile`} className="profile-picture-large" />
            ) : (
              selectedPal.username?.charAt(0).toUpperCase()
            )}
          </div>
          <div className="profile-info-large">
            <h2>{selectedPal.username}</h2>
            <p className="profile-location-large">📍 {selectedPal.city}, {selectedPal.country}</p>
            <span className="profile-type-badge">🌍 Public Profile</span>
          </div>
        </div>

        <div className="profile-modal-actions">
          <button 
            onClick={(event) => toggleFavorite(selectedPal.id, event)}
            className={`modal-favorite-btn ${favorites.includes(selectedPal.id) ? 'favorited' : ''}`}
          >
            {favorites.includes(selectedPal.id) ? '⭐ Remove from Favorites' : '☆ Add to Favorites'}
          </button>
          <button 
            onClick={() => onSendInvite(selectedPal)}
            className="modal-invite-btn"
          >
            Send Invite
          </button>
        </div>

        <div className="profile-modal-stats">
          <div className="stat-item">
            <span className="stat-label">Member Since</span>
            <span className="stat-value">
              {selectedPal.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Profile Type</span>
            <span className="stat-value">Public</span>
          </div>
        </div>

        {selectedPal.activityPreferences && selectedPal.activityPreferences.length > 0 && (
          <div className="profile-modal-activities">
            <h3>Activity Preferences</h3>
            <div className="modal-activity-tags">
              {selectedPal.activityPreferences.map((activity, index) => (
                <span key={index} className="modal-activity-tag">
                  {activity}
                </span>
              ))}
            </div>
          </div>
        )}

        {selectedPal.languagePreferences && selectedPal.languagePreferences.length > 0 && (
          <div className="profile-modal-activities">
            <h3>Languages</h3>
            <div className="modal-activity-tags">
              {selectedPal.languagePreferences.map((language, index) => (
                <span key={index} className="modal-activity-tag">
                  {language}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="profile-modal-posts">
          <h3>Recent Posts</h3>
          {loadingPalPosts ? (
            <div className="loading">Loading posts...</div>
          ) : selectedPalPosts.length > 0 ? (
            <div className="modal-posts-list">
              {selectedPalPosts.map((post) => (
                <div key={post.id} className="modal-post-item">
                  <div className="modal-post-header">
                    <h4>{post.title}</h4>
                    <span className="modal-post-time">{formatTimeAgo(post.createdAt)}</span>
                  </div>

                  {post.description && (
                    <p className="modal-post-description">{post.description}</p>
                  )}

                  {post.imageUrl && (
                    <div className="modal-post-media">
                      {post.mediaType === 'video' ? (
                        <video controls className="modal-post-media-content">
                          <source src={post.imageUrl} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      ) : (
                        <img 
                          src={post.imageUrl} 
                          alt={post.title} 
                          className="modal-post-media-content"
                        />
                      )}
                    </div>
                  )}

                  <div className="modal-post-stats">
                    <span>❤️ {post.likes || 0} likes</span>
                    <span>💬 {post.comments || 0} comments</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-posts">No posts shared by this user.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;