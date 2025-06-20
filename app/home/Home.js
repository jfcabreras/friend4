
'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

const Home = ({ user, userProfile }) => {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && userProfile) {
      loadFeed();
    } else {
      setLoading(false);
    }
  }, [user, userProfile]);

  const loadFeed = async () => {
    if (!user?.uid || !userProfile) return;
    
    try {
      setLoading(true);
      let feedPosts = [];

      if (userProfile.profileType === 'private') {
        // Load wish invites from all users, then filter for public profiles
        const wishInvitesQuery = query(
          collection(db, 'wishInvites'),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
        const wishInvitesSnapshot = await getDocs(wishInvitesQuery);
        feedPosts = wishInvitesSnapshot.docs.map(doc => ({
          id: doc.id,
          type: 'wishInvite',
          ...doc.data()
        })).filter(invite => invite.authorProfileType === 'public').slice(0, 50);
      } else {
        // For public users, load both open invites and wish invites
        
        // Load open invites - simple query without complex filters
        const openInvitesQuery = query(
          collection(db, 'openInvites'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const openInvitesSnapshot = await getDocs(openInvitesQuery);
        const openInvites = openInvitesSnapshot.docs.map(doc => ({
          id: doc.id,
          type: 'openInvite',
          ...doc.data()
        })).filter(invite => 
          invite.status === 'open' && 
          invite.authorProfileType === 'public'
        );

        // Load wish invites
        const wishInvitesQuery = query(
          collection(db, 'wishInvites'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const wishInvitesSnapshot = await getDocs(wishInvitesQuery);
        const wishInvites = wishInvitesSnapshot.docs.map(doc => ({
          id: doc.id,
          type: 'wishInvite',
          ...doc.data()
        })).filter(invite => invite.authorProfileType === 'public');

        // Combine and sort by creation date
        feedPosts = [...openInvites, ...wishInvites].sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime - aTime;
        }).slice(0, 50); // Limit final results
      }

      setFeed(feedPosts);
    } catch (error) {
      console.error('Error loading feed:', error);
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
              <p>
                {userProfile?.profileType === 'private' 
                  ? 'No wish invites available at the moment'
                  : 'No posts from public profiles available'
                }
              </p>
            </div>
          </div>
        ) : (
          feed.map(item => (
            <div key={item.id} className="feed-item">
              {/* Post Header */}
              <div className="feed-overlay">
                <div className="feed-author">
                  <div className="author-avatar">
                    {item.creatorUsername?.charAt(0).toUpperCase() || item.authorUsername?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="author-info">
                    <span className="author-name">{item.creatorUsername || item.authorUsername || 'Anonymous'}</span>
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
                  <img 
                    src={item.imageUrl} 
                    alt="Post content" 
                    className="feed-image"
                  />
                ) : (
                  <div className="feed-placeholder">
                    <div className="placeholder-icon">
                      {item.type === 'wishInvite' ? '🙏' : 
                       item.type === 'openInvite' ? '📅' : '📝'}
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
                    ❤️ Like
                  </button>
                  <button 
                    className="feed-action-btn"
                    onClick={() => handleComment(item.id)}
                  >
                    💬 Comment
                  </button>
                  <button 
                    className="feed-action-btn"
                    onClick={() => handleShare(item.id)}
                  >
                    📤 Share
                  </button>
                </div>

                <div className="feed-message">
                  {item.type === 'wishInvite' && (
                    <>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                      <div className="wish-details">
                        <span className="budget">Budget: ${item.budget}</span>
                        {item.date && <span className="date">Date: {new Date(item.date.toDate()).toLocaleDateString()}</span>}
                      </div>
                    </>
                  )}
                  
                  {item.type === 'openInvite' && (
                    <>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                      <div className="invite-details">
                        <span className="price">${item.price}</span>
                        {item.date && <span className="date">{new Date(item.date.toDate()).toLocaleDateString()}</span>}
                        {item.time && <span className="time">{item.time}</span>}
                      </div>
                    </>
                  )}
                  
                  
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
    </div>
  );
};

export default Home;
