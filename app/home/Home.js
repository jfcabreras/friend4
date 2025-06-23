
'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, getDoc, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

const Home = ({ user, userProfile }) => {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedPal, setSelectedPal] = useState(null);
  const [selectedPalPosts, setSelectedPalPosts] = useState([]);
  const [loadingPalPosts, setLoadingPalPosts] = useState(false);
  const [favorites, setFavorites] = useState([]);

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

      {/* Profile Modal */}
      {showProfileModal && selectedPal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => {
              setShowProfileModal(false);
              setSelectedPalPosts([]);
            }}>×</button>

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
                onClick={() => toggleFavorite(selectedPal.id)}
                className={`modal-favorite-btn ${favorites.includes(selectedPal.id) ? 'favorited' : ''}`}
              >
                {favorites.includes(selectedPal.id) ? '⭐ Remove from Favorites' : '☆ Add to Favorites'}
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
      )}
    </div>
  );
};

export default Home;
