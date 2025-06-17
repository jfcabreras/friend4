
'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

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
    try {
      setLoading(true);
      
      if (userProfile.profileType === 'private') {
        // Load wish invites from public profiles
        const wishInvitesQuery = query(
          collection(db, 'wishInvites'),
          orderBy('createdAt', 'desc')
        );
        const wishInvitesSnapshot = await getDocs(wishInvitesQuery);
        const wishInvites = wishInvitesSnapshot.docs.map(doc => ({
          id: doc.id,
          type: 'wishInvite',
          ...doc.data()
        }));
        setFeed(wishInvites);
      } else {
        // Load available pals and open invites for public profiles
        const palsQuery = query(
          collection(db, 'users'),
          where('profileType', '==', 'public'),
          where('country', '==', userProfile.country)
        );
        const palsSnapshot = await getDocs(palsQuery);
        const pals = palsSnapshot.docs
          .filter(doc => doc.id !== user.uid)
          .map(doc => ({
            id: doc.id,
            type: 'pal',
            ...doc.data()
          }));

        const openInvitesQuery = query(
          collection(db, 'openInvites'),
          where('status', '==', 'open'),
          orderBy('createdAt', 'desc')
        );
        const openInvitesSnapshot = await getDocs(openInvitesQuery);
        const openInvites = openInvitesSnapshot.docs.map(doc => ({
          id: doc.id,
          type: 'openInvite',
          ...doc.data()
        }));

        setFeed([...openInvites, ...pals]);
      }
    } catch (error) {
      console.error('Error loading feed:', error);
    } finally {
      setLoading(false);
    }
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
      <div className="home-section">
        <div className="loading">Loading feed...</div>
      </div>
    );
  }

  return (
    <div className="home-section">
      <div className="feed-header">
        <h2>
          {userProfile?.profileType === 'private' ? 'Wish Invites' : 'Available Opportunities'}
        </h2>
        <p>
          {userProfile?.profileType === 'private' 
            ? 'Discover what public profiles are looking for'
            : 'Find pals and open invites in your area'
          }
        </p>
      </div>

      <div className="feed-container">
        {feed.length === 0 ? (
          <div className="empty-feed">
            <p>
              {userProfile?.profileType === 'private' 
                ? 'No wish invites available at the moment'
                : 'No opportunities available in your area'
              }
            </p>
          </div>
        ) : (
          feed.map(item => (
            <div key={item.id} className={`feed-item ${item.type}`}>
              {item.type === 'pal' && (
                <div className="pal-card">
                  <div className="pal-avatar">
                    {item.username?.charAt(0).toUpperCase()}
                  </div>
                  <div className="pal-info">
                    <h3>{item.username}</h3>
                    <p>{item.city}, {item.country}</p>
                    <button className="invite-btn">Send Invite</button>
                  </div>
                </div>
              )}

              {item.type === 'openInvite' && (
                <div className="invite-card">
                  <div className="invite-header">
                    <h3>{item.title}</h3>
                    <span className="price">${item.price}</span>
                  </div>
                  <p className="invite-description">{item.description}</p>
                  <div className="invite-details">
                    <span className="date">{new Date(item.date?.toDate()).toLocaleDateString()}</span>
                    <span className="time">{item.time}</span>
                  </div>
                  <button className="offer-btn">Make Offer</button>
                </div>
              )}

              {item.type === 'wishInvite' && (
                <div className="wish-card">
                  <div className="wish-header">
                    <h3>{item.title}</h3>
                    <span className="budget">Budget: ${item.budget}</span>
                  </div>
                  <p className="wish-description">{item.description}</p>
                  <div className="wish-author">
                    <span>By: {item.creatorUsername}</span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Home;
