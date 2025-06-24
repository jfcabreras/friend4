
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '../../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const PostDetail = () => {
  const params = useParams();
  const router = useRouter();
  const [post, setPost] = useState(null);
  const [author, setAuthor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleClose = () => {
    router.push('/');
  };

  useEffect(() => {
    if (params?.id) {
      loadPost(params.id);
    }
  }, [params?.id]);

  const loadPost = async (postId) => {
    try {
      setLoading(true);
      console.log('Loading post:', postId);

      // Get the post
      const postDoc = await getDoc(doc(db, 'posts', postId));
      
      if (!postDoc.exists()) {
        setError('Post not found');
        setLoading(false);
        return;
      }

      const postData = postDoc.data();
      setPost({ id: postDoc.id, ...postData });

      // Get the author's profile
      if (postData.authorId) {
        try {
          const authorDoc = await getDoc(doc(db, 'users', postData.authorId));
          if (authorDoc.exists()) {
            const authorData = authorDoc.data();
            setAuthor(authorData);
          }
        } catch (authorError) {
          console.log('Could not load author profile:', authorError);
        }
      }

    } catch (error) {
      console.error('Error loading post:', error);
      setError(`Failed to load post: ${error.message}`);
    } finally {
      setLoading(false);
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

  const handleSharePost = () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: post?.title || 'Check out this post',
        text: post?.description || '',
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

  if (loading) {
    return (
      <div className="post-detail-page">
        <div className="profile-close-header">
          <button onClick={handleClose} className="profile-close-btn">
            ← Back to Home
          </button>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading post...</p>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="post-detail-page">
        <div className="profile-close-header">
          <button onClick={handleClose} className="profile-close-btn">
            ← Back to Home
          </button>
        </div>
        <div className="error-container">
          <h2>Post Not Found</h2>
          <p>{error || 'The requested post does not exist.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="post-detail-page">
      <div className="profile-close-header">
        <button onClick={handleClose} className="profile-close-btn">
          ← Back to Home
        </button>
        <button onClick={handleSharePost} className="share-post-btn">
          📤 Share Post
        </button>
      </div>

      <div className="post-detail-container">
        <div className="post-detail-header">
          <div className="post-author-info">
            <div className="author-avatar">
              {author?.profilePicture ? (
                <img 
                  src={author.profilePicture} 
                  alt="Author"
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }}
                />
              ) : (
                (author?.username || post.authorUsername || 'Anonymous').charAt(0).toUpperCase()
              )}
            </div>
            <div className="author-details">
              <h3>{author?.username || post.authorUsername || 'Anonymous'}</h3>
              <p className="post-location">{post.city}, {post.country}</p>
              <p className="post-time">{formatTimeAgo(post.createdAt)}</p>
            </div>
          </div>
        </div>

        <div className="post-detail-content">
          <h1 className="post-title">{post.title}</h1>
          
          {post.description && (
            <div className="post-description">
              <p>{post.description}</p>
            </div>
          )}

          {post.imageUrl && (
            <div className="post-media-container">
              {post.mediaType === 'video' ? (
                <video controls className="post-media">
                  <source src={post.imageUrl} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <img 
                  src={post.imageUrl} 
                  alt={post.title} 
                  className="post-media"
                />
              )}
            </div>
          )}

          <div className="post-stats">
            <div className="post-actions">
              <span className="stat-item">❤️ {post.likes || 0} likes</span>
              <span className="stat-item">💬 {post.comments || 0} comments</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostDetail;
