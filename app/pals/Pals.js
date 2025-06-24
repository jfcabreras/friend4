'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, arrayRemove, addDoc, getDoc, orderBy } from 'firebase/firestore';
import ProfileModal from '../components/ProfileModal';


const Pals = ({ user, userProfile }) => {
  const [pals, setPals] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedPal, setSelectedPal] = useState(null);
  const [selectedPalPosts, setSelectedPalPosts] = useState([]);
  const [loadingPalPosts, setLoadingPalPosts] = useState(false);
  const [inviteData, setInviteData] = useState({
    title: '',
    description: '',
    meetingLocation: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    price: ''
  });

  useEffect(() => {
    if (user?.uid && userProfile) {
      loadPals();
      setFavorites(userProfile.favorites || []);
    }
  }, [user?.uid, userProfile]);

  // Update favorites when userProfile changes
  useEffect(() => {
    if (userProfile) {
      setFavorites(userProfile.favorites || []);
    }
  }, [userProfile?.favorites]);

  const loadPals = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);
      console.log('Loading pals for user:', user.uid);
      console.log('User profile:', userProfile);

      // Start with a simple query for all public users
      const q = query(
        collection(db, 'users'),
        where('profileType', '==', 'public')
      );

      console.log('Executing query for public users...');
      const palsSnapshot = await getDocs(q);
      console.log('Query results:', palsSnapshot.docs.length, 'documents found');

      let allPals = palsSnapshot.docs
        .filter(doc => doc.id !== user?.uid)
        .map(doc => {
          const data = doc.data();
          console.log('Pal data:', { id: doc.id, ...data });
          return {
            id: doc.id,
            ...data
          };
        });

      // For now, show all public pals regardless of country
      // You can enable country filtering later if needed
      console.log('Showing all public pals without country filtering');

      setPals(allPals);
      console.log('Final pals set:', allPals);
    } catch (error) {
      console.error('Error loading pals:', error);
      // Set empty array on error to show the empty state
      setPals([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (palId) => {
    if (!user?.uid) return;

    try {
      const isFavorite = favorites.includes(palId);
      const userRef = doc(db, 'users', user.uid);

      if (isFavorite) {
        await updateDoc(userRef, {
          favorites: arrayRemove(palId)
        });
        setFavorites(prev => prev.filter(id => id !== palId));
      } else {
        await updateDoc(userRef, {
          favorites: arrayUnion(palId)
        });
        setFavorites(prev => [...prev, palId]);
      }
    } catch (error) {
      console.error('Error updating favorites:', error);
    }
  };

  

  const loadPalPosts = async (palId) => {
    if (!palId) return;

    setLoadingPalPosts(true);
    try {
      const postsQuery = query(
        collection(db, 'posts'),
        where('authorId', '==', palId)
      );
      
      const postsSnapshot = await getDocs(postsQuery);
      const posts = postsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      // Sort in JavaScript to avoid composite index requirement
      .sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt) || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt) || new Date(0);
        return bTime - aTime;
      });
      
      setSelectedPalPosts(posts);
    } catch (error) {
      console.error('Error loading pal posts:', error);
      setSelectedPalPosts([]);
    } finally {
      setLoadingPalPosts(false);
    }
  };

  const sendInvite = async () => {
    if (!inviteData.title || !inviteData.description || !inviteData.meetingLocation || 
        !inviteData.startDate || !inviteData.startTime || !inviteData.endDate || 
        !inviteData.endTime || !inviteData.price) {
      alert('Please fill in all fields');
      return;
    }

    // Validate that end date/time is after start date/time
    const startDateTime = new Date(`${inviteData.startDate}T${inviteData.startTime}`);
    const endDateTime = new Date(`${inviteData.endDate}T${inviteData.endTime}`);

    if (endDateTime <= startDateTime) {
      alert('End date and time must be after start date and time');
      return;
    }

    try {
      await addDoc(collection(db, 'planInvitations'), {
        fromUserId: user.uid,
        fromUsername: userProfile.username,
        toUserId: selectedPal.id,
        toUsername: selectedPal.username,
        title: inviteData.title,
        description: inviteData.description,
        meetingLocation: inviteData.meetingLocation,
        startDate: new Date(inviteData.startDate),
        startTime: inviteData.startTime,
        endDate: new Date(inviteData.endDate),
        endTime: inviteData.endTime,
        price: parseFloat(inviteData.price),
        status: 'pending',
        createdAt: new Date()
      });

      alert('Invite sent successfully!');
      setShowInviteModal(false);
      setInviteData({
        title: '',
        description: '',
        meetingLocation: '',
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
        price: ''
      });
    } catch (error) {
      console.error('Error sending invite:', error);
      alert('Failed to send invite');
    }
  };

  const handleSendInvite = (pal) => {
    setSelectedPal(pal);
    setShowProfileModal(false);
    setShowInviteModal(true);
  };

  

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Just now';
    const now = new Date();
    const postTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffInMinutes = Math.floor((now - postTime) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return postTime.toLocaleDateString();
  };

  const filteredPals = showFavoritesOnly 
    ? pals.filter(pal => favorites.includes(pal.id))
    : pals;

  if (!user) {
    return (
      <div className="pals-section">
        <h2>Please login to explore pals</h2>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="pals-section">
        <div className="loading">Loading pals...</div>
      </div>
    );
  }

  return (
    <div className="pals-section">
      <div className="pals-header">
        <h2>Explore Pals</h2>
        <div className="filter-controls">
          <button 
            onClick={() => setShowFavoritesOnly(false)}
            className={`filter-btn ${!showFavoritesOnly ? 'active' : ''}`}
          >
            🌍 All Pals
          </button>
          <button 
            onClick={() => setShowFavoritesOnly(true)}
            className={`filter-btn ${showFavoritesOnly ? 'active' : ''}`}
          >
            ⭐ Favorites
          </button>
        </div>
      </div>

      <div className="pals-grid">
        {filteredPals.length === 0 ? (
          <div className="empty-state">
            <p>
              {showFavoritesOnly 
                ? 'No favorite pals yet. Add some pals to your favorites!'
                : 'No pals found in your area.'
              }
            </p>
          </div>
        ) : (
          filteredPals.map(pal => (
            <div 
              key={pal.id} 
              className="pal-card"
              onClick={() => {
                setSelectedPal(pal);
                setShowProfileModal(true);
                loadPalPosts(pal.id);
              }}
            >
              <div className="pal-card-header">
                <div className="pal-card-info">
                  <div className="pal-avatar">
                    {pal.profilePicture ? (
                      <img src={pal.profilePicture} alt={`${pal.username}'s profile`} className="pal-profile-picture" />
                    ) : (
                      pal.username?.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="pal-info">
                    <h3>{pal.username}</h3>
                    <p className="pal-location">📍 {pal.city}, {pal.country}</p>
                    {pal.activityPreferences && pal.activityPreferences.length > 0 && (
                      <div className="pal-activity-preview">
                        {pal.activityPreferences.slice(0, 3).map((activity, index) => (
                          <span key={index} className="pal-activity-tag">
                            {activity}
                          </span>
                        ))}
                        {pal.activityPreferences.length > 3 && (
                          <span className="pal-activity-tag">
                            +{pal.activityPreferences.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    {pal.languagePreferences && pal.languagePreferences.length > 0 && (
                      <div className="pal-language-preview">
                        <span className="language-label">🗣️</span>
                        {pal.languagePreferences.slice(0, 3).map((language, index) => (
                          <span key={index} className="pal-language-tag">
                            {language}
                          </span>
                        ))}
                        {pal.languagePreferences.length > 3 && (
                          <span className="pal-language-tag">
                            +{pal.languagePreferences.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <span className="pal-type">🌍 Public</span>
              </div>

              <div className="pal-actions" onClick={(e) => e.stopPropagation()}>
                <div className="pal-actions-left">
                  <button 
                    onClick={() => toggleFavorite(pal.id)}
                    className={`favorite-btn ${favorites.includes(pal.id) ? 'favorited' : ''}`}
                    title={favorites.includes(pal.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {favorites.includes(pal.id) ? '⭐' : '☆'}
                  </button>
                </div>
                <button 
                  onClick={() => {
                    setSelectedPal(pal);
                    setShowInviteModal(true);
                  }}
                  className="invite-btn"
                >
                  Send Invite
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowInviteModal(false)}>×</button>
            <div className="invite-form-header">
              <h3>Invite {selectedPal?.username}</h3>
              <p className="invite-form-subtitle">Create a hangout plan and set your incentive</p>
            </div>

            <div className="invite-form">
              <div className="form-row">
                <div className="form-group full-width">
                  <label>Event Title *</label>
                  <input
                    type="text"
                    placeholder="e.g., Coffee & Chat, Movie Night, Gym Session"
                    value={inviteData.title}
                    onChange={(e) => setInviteData(prev => ({ ...prev, title: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group full-width">
                  <label>Description *</label>
                  <textarea
                    placeholder="Describe what you'd like to do together..."
                    value={inviteData.description}
                    onChange={(e) => setInviteData(prev => ({ ...prev, description: e.target.value }))}
                    className="form-textarea"
                    rows="3"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group full-width">
                  <label>Meeting Location *</label>
                  <input
                    type="text"
                    placeholder="e.g., Central Park, Starbucks on 5th Ave"
                    value={inviteData.meetingLocation}
                    onChange={(e) => setInviteData(prev => ({ ...prev, meetingLocation: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>
              </div>

              <div className="datetime-section">
                <h4>📅 Event Schedule</h4>

                <div className="form-row">
                  <div className="form-group half-width">
                    <label>Start Date *</label>
                    <input
                      type="date"
                      value={inviteData.startDate}
                      onChange={(e) => setInviteData(prev => ({ ...prev, startDate: e.target.value }))}
                      className="form-input"
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                  <div className="form-group half-width">
                    <label>Start Time *</label>
                    <input
                      type="time"
                      value={inviteData.startTime}
                      onChange={(e) => setInviteData(prev => ({ ...prev, startTime: e.target.value }))}
                      className="form-input"
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group half-width">
                    <label>End Date *</label>
                    <input
                      type="date"
                      value={inviteData.endDate}
                      onChange={(e) => setInviteData(prev => ({ ...prev, endDate: e.target.value }))}
                      className="form-input"
                      min={inviteData.startDate || new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                  <div className="form-group half-width">
                    <label>End Time *</label>
                    <input
                      type="time"
                      value={inviteData.endTime}
                      onChange={(e) => setInviteData(prev => ({ ...prev, endTime: e.target.value }))}
                      className="form-input"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group full-width">
                  <label>💰 Your Incentive ($) *</label>
                  <input
                    type="number"
                    placeholder="How much are you offering?"
                    value={inviteData.price}
                    onChange={(e) => setInviteData(prev => ({ ...prev, price: e.target.value }))}
                    className="form-input"
                    min="0"
                    step="0.01"
                    required
                  />
                  <small className="form-hint">This is what you're willing to pay for their time</small>
                </div>
              </div>

              <button onClick={sendInvite} className="send-invite-btn">
                🚀 Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      <ProfileModal
        showModal={showProfileModal}
        onClose={() => {
          setShowProfileModal(false);
          setSelectedPalPosts([]);
        }}
        selectedPal={selectedPal}
        selectedPalPosts={selectedPalPosts}
        loadingPalPosts={loadingPalPosts}
        favorites={favorites}
        setFavorites={setFavorites}
        user={user}
        userProfile={userProfile}
        formatTimeAgo={formatTimeAgo}
        onSendInvite={handleSendInvite}
        onFavoriteChange={(palId, isFavorite) => {
          // Update local favorites state
          if (isFavorite) {
            setFavorites(prev => [...prev, palId]);
          } else {
            setFavorites(prev => prev.filter(id => id !== palId));
          }
        }}
      />

      
    </div>
  );
};

export default Pals;