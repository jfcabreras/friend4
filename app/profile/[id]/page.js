
'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { db } from '../../../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

const ShareableProfile = () => {
  const params = useParams();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (params?.id) {
      loadProfile(params.id);
    }
  }, [params?.id]);

  const loadProfile = async (usernameOrId) => {
    try {
      setLoading(true);
      console.log('Loading profile for username/id:', usernameOrId);

      let userId = null;
      let userData = null;

      // First, try to find user by username
      try {
        const usernameQuery = query(
          collection(db, 'users'),
          where('username', '==', usernameOrId)
        );
        const usernameSnapshot = await getDocs(usernameQuery);
        
        if (!usernameSnapshot.empty) {
          // Found user by username
          const userDoc = usernameSnapshot.docs[0];
          userId = userDoc.id;
          userData = userDoc.data();
          console.log('Found user by username:', userData);
        }
      } catch (usernameError) {
        console.log('Error searching by username:', usernameError);
      }

      // If not found by username, try as direct userId (fallback)
      if (!userData) {
        try {
          const userDoc = await getDoc(doc(db, 'users', usernameOrId));
          if (userDoc.exists()) {
            userId = userDoc.id;
            userData = userDoc.data();
            console.log('Found user by userId:', userData);
          }
        } catch (userIdError) {
          console.log('Error searching by userId:', userIdError);
        }
      }

      if (!userData || !userId) {
        console.log('User not found for:', usernameOrId);
        setError('User not found');
        setLoading(false);
        return;
      }

      setProfile({ id: userId, ...userData });

      // If profile is public, load their posts
      if (userData.profileType === 'public') {
        console.log('Loading posts for public profile:', userId);
        try {
          const postsQuery = query(
            collection(db, 'posts'),
            where('authorId', '==', userId)
          );

          const postsSnapshot = await getDocs(postsQuery);
          console.log('Posts found:', postsSnapshot.docs.length);
          const userPosts = postsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt) || new Date(0);
            const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt) || new Date(0);
            return bTime - aTime;
          });

          setPosts(userPosts);
        } catch (postsError) {
          console.error('Error loading posts:', postsError);
          // Don't fail the entire profile load if posts fail
          setPosts([]);
        }
      }

    } catch (error) {
      console.error('Error loading profile:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);

      if (error.code === 'permission-denied') {
        setError('Permission denied - unable to access this profile');
      } else if (error.code === 'not-found') {
        setError('User not found');
      } else {
        setError(`Failed to load profile: ${error.message}`);
      }
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

  if (loading) {
    return (
      <div className="shareable-profile">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shareable-profile">
        <div className="error-container">
          <h2>Profile Not Found</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="shareable-profile">
        <div className="error-container">
          <h2>Profile Not Found</h2>
          <p>The requested profile does not exist.</p>
        </div>
      </div>
    );
  }

  // Private profile view
  if (profile.profileType === 'private') {
    return (
      <div className="shareable-profile">
        <div className="private-profile-container">
          <div className="private-profile-content">
            <div className="profile-avatar-large">
              {profile.profilePicture ? (
                <img src={profile.profilePicture} alt="Profile" className="profile-picture-large" />
              ) : (
                <div className="avatar-placeholder-large">
                  {profile.username?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
            </div>
            <h2>{profile.username || 'Unknown User'}</h2>
            <div className="private-badge">
              🔒 This profile is private
            </div>
            <p className="private-message">
              This user has chosen to keep their profile private. 
              Only public profiles can be viewed by others.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Public profile view
  return (
    <div className="shareable-profile">
      <div className="public-profile-container">
        <div className="profile-header-shareable">
          <div className="profile-avatar-large">
            {profile.profilePicture ? (
              <img src={profile.profilePicture} alt="Profile" className="profile-picture-large" />
            ) : (
              <div className="avatar-placeholder-large">
                {profile.username?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="profile-info-shareable">
            <h1>{profile.username}</h1>
            <p className="profile-location">📍 {profile.city}, {profile.country}</p>
            <div className="public-badge">
              🌍 Public Profile
            </div>
            <p className="member-since">
              Member since {profile.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'}
            </p>
          </div>
        </div>

        {profile.activityPreferences && profile.activityPreferences.length > 0 && (
          <div className="profile-section-shareable">
            <h3>Activity Preferences</h3>
            <div className="activity-tags-shareable">
              {profile.activityPreferences.map((activity, index) => (
                <span key={index} className="activity-tag-shareable">
                  {activity}
                </span>
              ))}
            </div>
          </div>
        )}

        {profile.languagePreferences && profile.languagePreferences.length > 0 && (
          <div className="profile-section-shareable">
            <h3>Languages</h3>
            <div className="activity-tags-shareable">
              {profile.languagePreferences.map((language, index) => (
                <span key={index} className="activity-tag-shareable">
                  {language}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="profile-section-shareable">
          <h3>Posts ({posts.length})</h3>
          {posts.length > 0 ? (
            <div className="posts-grid-shareable">
              {posts.map(post => (
                <div key={post.id} className="post-card-shareable">
                  <div className="post-header-shareable">
                    <h4>{post.title}</h4>
                    <span className="post-time-shareable">{formatTimeAgo(post.createdAt)}</span>
                  </div>

                  {post.description && (
                    <p className="post-description-shareable">{post.description}</p>
                  )}

                  {post.imageUrl && (
                    <div className="post-media-shareable">
                      {post.mediaType === 'video' ? (
                        <video controls className="post-media-content-shareable">
                          <source src={post.imageUrl} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      ) : (
                        <img 
                          src={post.imageUrl} 
                          alt={post.title} 
                          className="post-media-content-shareable"
                        />
                      )}
                    </div>
                  )}

                  <div className="post-stats-shareable">
                    <span>❤️ {post.likes || 0} likes</span>
                    <span>💬 {post.comments || 0} comments</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-posts-shareable">No posts shared yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareableProfile;
