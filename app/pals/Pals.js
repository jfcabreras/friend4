'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

const Pals = ({ user, userProfile }) => {
  const [pals, setPals] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedPal, setSelectedPal] = useState(null);
  const [inviteData, setInviteData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    price: ''
  });

  useEffect(() => {
    if (user?.uid && userProfile?.country) {
      loadPals();
      setFavorites(userProfile.favorites || []);
    }
  }, [user?.uid, userProfile?.country]);

  const loadPals = async () => {
    if (!user?.uid || !userProfile?.country) return;

    try {
      setLoading(true);

      const q = query(
        collection(db, 'users'),
        where('profileType', '==', 'public'),
        where('country', '==', userProfile.country)
      );

      const palsSnapshot = await getDocs(q);
      const allPals = palsSnapshot.docs
        .filter(doc => doc.id !== user?.uid)
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      setPals(allPals);
    } catch (error) {
      console.error('Error loading pals:', error);
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

  const sendInvite = async () => {
    if (!user || !selectedPal || !inviteData.title || !inviteData.date || !inviteData.time || !inviteData.price) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const inviteRef = await addDoc(collection(db, 'planInvitations'), {
        fromUserId: user.uid,
        fromUsername: userProfile.username,
        toUserId: selectedPal.id,
        toUsername: selectedPal.username,
        title: inviteData.title,
        description: inviteData.description,
        date: new Date(inviteData.date),
        time: inviteData.time,
        price: parseFloat(inviteData.price),
        status: 'pending',
        createdAt: new Date()
      });

      alert('Invite sent successfully!');
      setShowInviteModal(false);
      setSelectedPal(null);
      setInviteData({ title: '', description: '', date: '', time: '', price: '' });
    } catch (error) {
      console.error('Error sending invite:', error);
      alert('Failed to send invite');
    }
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
            <div key={pal.id} className="pal-card">
              <div className="pal-avatar">
                {pal.username?.charAt(0).toUpperCase()}
              </div>
              <div className="pal-info">
                <h3>{pal.username}</h3>
                <p className="pal-location">{pal.city}, {pal.country}</p>
                <div className="pal-actions">
                  <button 
                    onClick={() => toggleFavorite(pal.id)}
                    className={`favorite-btn ${favorites.includes(pal.id) ? 'favorited' : ''}`}
                  >
                    {favorites.includes(pal.id) ? '⭐' : '☆'}
                  </button>
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
            </div>
          ))
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowInviteModal(false)}>×</button>
            <h3>Send Invite to {selectedPal?.username}</h3>

            <div className="invite-form">
              <input
                type="text"
                placeholder="Invite title"
                value={inviteData.title}
                onChange={(e) => setInviteData(prev => ({ ...prev, title: e.target.value }))}
              />
              <textarea
                placeholder="Description (optional)"
                value={inviteData.description}
                onChange={(e) => setInviteData(prev => ({ ...prev, description: e.target.value }))}
              />
              <input
                type="date"
                value={inviteData.date}
                onChange={(e) => setInviteData(prev => ({ ...prev, date: e.target.value }))}
              />
              <input
                type="time"
                value={inviteData.time}
                onChange={(e) => setInviteData(prev => ({ ...prev, time: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Price ($)"
                value={inviteData.price}
                onChange={(e) => setInviteData(prev => ({ ...prev, price: e.target.value }))}
              />
              <button onClick={sendInvite} className="send-invite-btn">
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pals;