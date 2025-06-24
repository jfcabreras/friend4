
'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, getDoc, doc, updateDoc, arrayUnion, arrayRemove, addDoc } from 'firebase/firestore';
import ProfileModal from '../components/ProfileModal';

const Home = ({ user, userProfile, refreshUserProfile }) => {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedPal, setSelectedPal] = useState(null);
  const [selectedPalPosts, setSelectedPalPosts] = useState([]);
  const [loadingPalPosts, setLoadingPalPosts] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
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
    if (user && userProfile) {
      loadFeed();
      setFavorites(userProfile.favorites || []);
    } else {
      setLoading(false);
    }
  }, [user, userProfile]);

  

  const loadFeed = async () => {
    if (!user?.uid || !userProfile) return;
    
    try {
      setLoading(true);
      let feedPosts = [];

      // Load actual posts from the posts collection
      try {
        const postsQuery = query(
          collection(db, 'posts'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const postsSnapshot = await getDocs(postsQuery);
        const posts = await Promise.all(postsSnapshot.docs.map(async (postDoc) => {
          const postData = postDoc.data();
          let authorProfilePicture = null;
          let authorUsername = postData.creatorUsername || postData.authorUsername || 'Anonymous';
          
          // Fetch the author's profile picture if we have an authorId
          if (postData.authorId) {
            try {
              const authorDoc = await getDoc(doc(db, 'users', postData.authorId));
              if (authorDoc.exists()) {
                const authorData = authorDoc.data();
                authorProfilePicture = authorData.profilePicture;
                authorUsername = authorData.username || authorUsername;
              }
            } catch (error) {
              console.log('Could not load author profile:', error);
            }
          }
          
          return {
            id: postDoc.id,
            type: 'post',
            ...postData,
            authorProfilePicture,
            authorUsername
          };
        }));

        feedPosts = [...posts];
        console.log('Loaded posts:', posts.length);
      } catch (postsError) {
        console.log('Could not load posts:', postsError.message);
      }

      console.log('Posts loaded from posts collection:', feedPosts.length);

      // Sort by creation date
      feedPosts = feedPosts.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt) || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt) || new Date(0);
        return bTime - aTime;
      }).slice(0, 50);

      console.log('Final feed posts:', feedPosts.length);
      setFeed(feedPosts);
    } catch (error) {
      console.error('Error loading feed:', error);
      // Set empty array on error
      setFeed([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (postId) => {
    // TODO: Implement like functionality
    console.log('Like post:', postId);
  };

  const handleComment = (postId) => {
    // TODO: Implement comment functionality
    console.log('Comment on post:', postId);
  };

  const handleShare = (postId) => {
    // TODO: Implement share functionality
    console.log('Share post:', postId);
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

  const handleUsernameClick = async (authorId, post) => {
    if (!authorId || authorId === user?.uid) return; // Don't open modal for current user
    
    try {
      const userDoc = await getDoc(doc(db, 'users', authorId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setSelectedPal({
          id: authorId,
          ...userData
        });
        setShowProfileModal(true);
        loadPalPosts(authorId);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
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

  if (!user) {
    return (
      <div className="home-section">
        <div className="welcome-message">
          <h2>Welcome to Social Task & Event Platform</h2>
          <p>Connect with others, create invites, and explore opportunities!</p>
          <p>Please login or register to get started.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="main-section">
        <div className="loading-feed">Loading feed...</div>
      </div>
    );
  }

  return (
    <div className="main-section">
      <div className="report-feed">
        {feed.length === 0 ? (
          <div className="empty-feed">
            <div className="empty-feed-content">
              <h3>No posts yet</h3>
              <p>No posts available at the moment. Be the first to share something!</p>
            </div>
          </div>
        ) : (
          feed.map(item => (
            <div key={item.id} className="feed-item">
              {/* Post Header */}
              <div className="feed-overlay">
                <div className="feed-author">
                  <div className="author-avatar">
                    {item.authorProfilePicture ? (
                      <img 
                        src={item.authorProfilePicture} 
                        alt="Author"
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '50%',
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      item.authorUsername?.charAt(0).toUpperCase() || '?'
                    )}
                  </div>
                  <div className="author-info">
                    <span 
                      className="author-name clickable" 
                      onClick={() => handleUsernameClick(item.authorId, item)}
                      style={{ cursor: 'pointer' }}
                    >
                      {item.authorUsername || 'Anonymous'}
                    </span>
                    <span className="post-location">{item.city}, {item.country}</span>
                  </div>
                </div>
                <div className="feed-time">
                  {formatTimeAgo(item.createdAt)}
                </div>
              </div>

              {/* Post Image/Media */}
              <div className="feed-image-container">
                {item.imageUrl ? (
                  item.mediaType === 'video' ? (
                    <video controls className="feed-image">
                      <source src={item.imageUrl} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <img 
                      src={item.imageUrl} 
                      alt="Post content" 
                      className="feed-image"
                    />
                  )
                ) : (
                  <div className="feed-placeholder">
                    <div className="placeholder-icon">
                      📝
                    </div>
                  </div>
                )}
              </div>

              {/* Post Content */}
              <div className="feed-content">
                <div className="feed-actions">
                  <button 
                    className="feed-action-btn"
                    onClick={() => handleLike(item.id)}
                  >
                    ❤️ {item.likes || 0}
                  </button>
                  <button 
                    className="feed-action-btn"
                    onClick={() => handleComment(item.id)}
                  >
                    💬 {item.comments || 0}
                  </button>
                  <button 
                    className="feed-action-btn"
                    onClick={() => handleShare(item.id)}
                  >
                    📤 Share
                  </button>
                </div>

                <div className="feed-message">
                  <strong>{item.title}</strong>
                  {item.description && <p>{item.description}</p>}
                  <div className="post-details">
                    <span className="post-type">📝 User Post</span>
                  </div>
                </div>

                {/* Post Stats */}
                <div className="feed-stats">
                  <span>{item.likes || 0} likes</span>
                  <span>{item.comments || 0} comments</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

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
        onFavoriteChange={refreshUserProfile}
      />

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
    </div>
  );
};

export default Home;
