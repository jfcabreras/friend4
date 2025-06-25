
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, getDoc, doc, updateDoc, arrayUnion, arrayRemove, addDoc } from 'firebase/firestore';
import ProfileModal from '../components/ProfileModal';
import InviteModal from '../components/InviteModal';

const Home = ({ user, userProfile, refreshUserProfile }) => {
  const router = useRouter();
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedPal, setSelectedPal] = useState(null);
  const [selectedPalPosts, setSelectedPalPosts] = useState([]);
  const [loadingPalPosts, setLoadingPalPosts] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);

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
          let isPublicProfile = false;
          
          // Fetch the author's profile picture and check if profile is public
          if (postData.authorId) {
            try {
              const authorDoc = await getDoc(doc(db, 'users', postData.authorId));
              if (authorDoc.exists()) {
                const authorData = authorDoc.data();
                authorProfilePicture = authorData.profilePicture;
                authorUsername = authorData.username || authorUsername;
                isPublicProfile = authorData.profileType === 'public';
              } else {
                console.log('Author document does not exist for:', postData.authorId);
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
            authorUsername,
            isPublicProfile
          };
        }));

        // Filter to only show posts from public users
        const publicPosts = posts.filter(post => post.isPublicProfile === true);
        feedPosts = [...publicPosts];
        console.log('Loaded posts:', posts.length);
        console.log('Public posts:', publicPosts.length);
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
    const shareUrl = `${window.location.origin}/post/${postId}`;
    if (navigator.share) {
      navigator.share({
        title: 'Check out this post',
        url: shareUrl
      });
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        alert('Post link copied to clipboard!');
      }).catch(() => {
        // Fallback: show the URL in a prompt
        prompt('Copy this link to share:', shareUrl);
      });
    }
  };

  const handlePostClick = (postId, event) => {
    // Don't navigate if clicking on buttons or interactive elements
    if (event.target.closest('button') || event.target.closest('.clickable')) {
      return;
    }
    router.push(`/post/${postId}`);
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
            <div 
              key={item.id} 
              className="feed-item clickable-post" 
              onClick={(e) => handlePostClick(item.id, e)}
            >
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

      <InviteModal
        showModal={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        selectedPal={selectedPal}
        user={user}
        userProfile={userProfile}
      />
    </div>
  );
};

export default Home;
