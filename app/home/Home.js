
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

      // First, let's try to get public profiles with media content
      const publicUsersQuery = query(
        collection(db, 'users'),
        where('profileType', '==', 'public')
      );
      
      const publicUsersSnapshot = await getDocs(publicUsersQuery);
      console.log('Found public users:', publicUsersSnapshot.docs.length);

      // Create mock posts from public profiles with media
      const publicProfilePosts = publicUsersSnapshot.docs
        .filter(doc => doc.id !== user?.uid) // Don't show own profile
        .map(doc => {
          const userData = doc.data();
          console.log('Processing user:', userData.username, 'with profile picture:', userData.profilePicture);
          
          return {
            id: `profile_${doc.id}`,
            type: 'profile',
            authorUsername: userData.username,
            creatorUsername: userData.username,
            authorProfileType: 'public',
            city: userData.city,
            country: userData.country,
            imageUrl: userData.profilePicture,
            title: `Check out ${userData.username}'s profile`,
            description: userData.activityPreferences?.length > 0 
              ? `Interests: ${userData.activityPreferences.join(', ')}` 
              : 'Available for invites and activities',
            createdAt: userData.updatedAt || userData.createdAt || new Date(),
            likes: Math.floor(Math.random() * 20), // Mock data
            comments: Math.floor(Math.random() * 10) // Mock data
          };
        });

      // Try to load actual invites (with error handling)
      try {
        if (userProfile.profileType === 'private') {
          // Load wish invites for private users
          const wishInvitesQuery = query(
            collection(db, 'wishInvites'),
            limit(20)
          );
          const wishInvitesSnapshot = await getDocs(wishInvitesQuery);
          const wishInvites = wishInvitesSnapshot.docs.map(doc => ({
            id: doc.id,
            type: 'wishInvite',
            ...doc.data()
          })).filter(invite => invite.authorProfileType === 'public');
          
          feedPosts = [...publicProfilePosts, ...wishInvites];
        } else {
          // Load both types for public users
          const openInvitesQuery = query(
            collection(db, 'openInvites'),
            limit(20)
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

          const wishInvitesQuery = query(
            collection(db, 'wishInvites'),
            limit(20)
          );
          const wishInvitesSnapshot = await getDocs(wishInvitesQuery);
          const wishInvites = wishInvitesSnapshot.docs.map(doc => ({
            id: doc.id,
            type: 'wishInvite',
            ...doc.data()
          })).filter(invite => invite.authorProfileType === 'public');

          feedPosts = [...publicProfilePosts, ...openInvites, ...wishInvites];
        }
      } catch (inviteError) {
        console.log('Could not load invites:', inviteError.message);
        // If invites fail to load, just show profile posts
        feedPosts = publicProfilePosts;
      }

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
                       item.type === 'openInvite' ? '📅' : 
                       item.type === 'profile' ? '👤' : '📝'}
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
                  {item.type === 'profile' && (
                    <>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                      <div className="profile-details">
                        <span className="profile-type">Public Profile</span>
                        <span className="available">Available for invites</span>
                      </div>
                    </>
                  )}

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
