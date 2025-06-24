
'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore';

const UserPosts = ({ userId }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      loadUserPosts();
    }
  }, [userId]);

  const loadUserPosts = async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      // First, get all posts for this user without ordering
      const postsQuery = query(
        collection(db, 'posts'),
        where('authorId', '==', userId)
      );
      
      const postsSnapshot = await getDocs(postsQuery);
      const userPosts = postsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      // Then sort in JavaScript to avoid composite index requirement
      .sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt) || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt) || new Date(0);
        return bTime - aTime;
      });
      
      setPosts(userPosts);
    } catch (error) {
      console.error('Error loading user posts:', error);
      setPosts([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const deletePost = async (postId) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    
    try {
      await deleteDoc(doc(db, 'posts', postId));
      setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post. Please try again.');
    }
  };

  const handleSharePost = (postId) => {
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
        prompt('Copy this link to share:', shareUrl);
      });
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

  if (loading) {
    return <div className="posts-loading">Loading posts...</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="no-posts">
        <p>No posts yet. Share your first thought!</p>
      </div>
    );
  }

  return (
    <div className="user-posts">
      {posts.map(post => (
        <div key={post.id} className="user-post-item">
          <div className="post-header">
            <div className="post-info">
              <h4>{post.title}</h4>
              <span className="post-time">{formatTimeAgo(post.createdAt)}</span>
            </div>
            <button 
              className="delete-post-btn"
              onClick={() => deletePost(post.id)}
              title="Delete post"
            >
              🗑️
            </button>
          </div>
          
          {post.description && (
            <p className="post-description">{post.description}</p>
          )}
          
          {post.imageUrl && (
            <div className="post-media">
              {post.mediaType === 'video' ? (
                <video controls className="post-media-content">
                  <source src={post.imageUrl} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <img 
                  src={post.imageUrl} 
                  alt={post.title} 
                  className="post-media-content"
                />
              )}
            </div>
          )}
          
          <div className="post-stats">
            <span>❤️ {post.likes || 0} likes</span>
            <span>💬 {post.comments || 0} comments</span>
            <button 
              className="share-post-link-btn"
              onClick={() => handleSharePost(post.id)}
              title="Share post"
            >
              📤 Share
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default UserPosts;
