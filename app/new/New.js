
'use client';

import React, { useState } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const New = ({ user, userProfile }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleMediaChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        setErrorMessage('Media file must be less than 50MB');
        return;
      }
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        setErrorMessage('Media file must be an image or video');
        return;
      }
      
      setMediaFile(file);
      setErrorMessage('');
      
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setMediaPreview({
        url: previewUrl,
        type: file.type.startsWith('video/') ? 'video' : 'image'
      });
    }
  };

  const uploadMedia = async () => {
    if (!mediaFile || !user?.uid) return null;
    
    try {
      const timestamp = Date.now();
      const fileExtension = mediaFile.name.split('.').pop();
      const fileName = `post_${timestamp}.${fileExtension}`;
      const mediaRef = ref(storage, `users/${user.uid}/posts/${fileName}`);
      
      await uploadBytes(mediaRef, mediaFile);
      const downloadURL = await getDownloadURL(mediaRef);
      
      return downloadURL;
    } catch (error) {
      console.error('Error uploading media:', error);
      throw error;
    }
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setErrorMessage('Please enter a title for your post');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      let mediaUrl = null;
      
      // Upload media if present
      if (mediaFile) {
        mediaUrl = await uploadMedia();
      }

      // Create post data
      const postData = {
        title: title.trim(),
        description: description.trim(),
        authorId: user.uid,
        authorUsername: userProfile.username,
        authorProfileType: userProfile.profileType,
        city: userProfile.city,
        country: userProfile.country,
        imageUrl: mediaUrl,
        mediaType: mediaFile ? (mediaFile.type.startsWith('video/') ? 'video' : 'image') : null,
        createdAt: serverTimestamp(),
        likes: 0,
        comments: 0,
        likedBy: []
      };

      // Save to Firebase
      await addDoc(collection(db, 'posts'), postData);

      // Reset form
      setTitle('');
      setDescription('');
      setMediaFile(null);
      setMediaPreview(null);
      
      // Reset file input
      const fileInput = document.getElementById('media-input');
      if (fileInput) fileInput.value = '';

      setSuccessMessage('Post created successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (error) {
      console.error('Error creating post:', error);
      setErrorMessage('Failed to create post. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const removeMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    const fileInput = document.getElementById('media-input');
    if (fileInput) fileInput.value = '';
  };

  if (!user) {
    return (
      <div className="new-section">
        <div className="auth-required">
          <h2>Please log in to create posts</h2>
          <p>You need to be logged in to share your thoughts and media.</p>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="new-section">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="new-section">
      <div className="new-header">
        <h2>Create New Post</h2>
        <p>Share your thoughts, experiences, or media with the community</p>
      </div>

      <form onSubmit={handleCreatePost} className="new-post-form">
        <div className="form-group">
          <label htmlFor="title">Title *</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's on your mind?"
            required
            maxLength={100}
          />
          <small>{title.length}/100 characters</small>
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell us more about it... (optional)"
            rows={4}
            maxLength={500}
          />
          <small>{description.length}/500 characters</small>
        </div>

        <div className="form-group">
          <label htmlFor="media-input">Add Photo or Video</label>
          <input
            id="media-input"
            type="file"
            accept="image/*,video/*"
            onChange={handleMediaChange}
            className="media-input"
          />
          
          {mediaPreview && (
            <div className="media-preview">
              <div className="preview-header">
                <span>Preview:</span>
                <button type="button" onClick={removeMedia} className="remove-media">
                  ✕ Remove
                </button>
              </div>
              {mediaPreview.type === 'video' ? (
                <video controls className="preview-media">
                  <source src={mediaPreview.url} />
                  Your browser does not support video preview.
                </video>
              ) : (
                <img src={mediaPreview.url} alt="Preview" className="preview-media" />
              )}
            </div>
          )}
        </div>

        <div className="post-info">
          <div className="author-info">
            <span className="posting-as">Posting as: <strong>{userProfile.username}</strong></span>
            <span className="location">📍 {userProfile.city}, {userProfile.country}</span>
            <span className="visibility">
              👁️ Visible to: {userProfile.profileType === 'public' ? 'Everyone' : 'Private profile users only'}
            </span>
          </div>
        </div>

        {errorMessage && <div className="error-message">{errorMessage}</div>}
        {successMessage && <div className="success-message">{successMessage}</div>}

        <button type="submit" disabled={loading} className="create-post-btn">
          {loading ? 'Creating Post...' : 'Create Post'}
        </button>
      </form>
    </div>
  );
};

export default New;
