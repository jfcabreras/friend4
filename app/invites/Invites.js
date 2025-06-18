'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, orderBy, addDoc, onSnapshot } from 'firebase/firestore';

const Invites = ({ user, userProfile }) => {
  const [invites, setInvites] = useState({
    pending: [],
    accepted: [],
    declined: []
  });
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [selectedInvite, setSelectedInvite] = useState(null);
  const [showInviteDetail, setShowInviteDetail] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [messagesUnsubscribe, setMessagesUnsubscribe] = useState(null);

  useEffect(() => {
    if (user && userProfile) {
      loadInvites();
    }
  }, [user, userProfile]);

  const loadInvites = async () => {
    if (!user?.uid) return; // Don't fetch if user.uid is not available

    try {
      setLoading(true);

      // Load invites sent by user
      const sentInvitesQuery = query(
        collection(db, 'planInvitations'),
        where('fromUserId', '==', user.uid)
      );
      const sentInvitesSnapshot = await getDocs(sentInvitesQuery);
      const sentInvites = sentInvitesSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'sent',
        ...doc.data()
      }));

      // Load invites received by user
      const receivedInvitesQuery = query(
        collection(db, 'planInvitations'),
        where('toUserId', '==', user.uid)
      );
      const receivedInvitesSnapshot = await getDocs(receivedInvitesQuery);
      const receivedInvites = receivedInvitesSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'received',
        ...doc.data()
      }));

      const allInvites = [...sentInvites, ...receivedInvites]
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime - aTime; // Sort descending by creation date
        });

      // Group by status
      const groupedInvites = {
        pending: allInvites.filter(invite => invite.status === 'pending'),
        accepted: allInvites.filter(invite => invite.status === 'accepted'),
        declined: allInvites.filter(invite => invite.status === 'declined'),
        cancelled: allInvites.filter(invite => invite.status === 'cancelled')
      };

      setInvites(groupedInvites);
    } catch (error) {
      console.error('Error loading invites:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteResponse = async (inviteId, response) => {
    try {
      const inviteRef = doc(db, 'planInvitations', inviteId);
      await updateDoc(inviteRef, {
        status: response,
        respondedAt: new Date()
      });

      // Reload invites
      loadInvites();
    } catch (error) {
      console.error('Error updating invite:', error);
    }
  };

  const handleCancelInvite = async (inviteId, originalPrice) => {
    const cancellationFee = originalPrice * 0.5;
    const confirmed = window.confirm(
      `Are you sure you want to cancel this invite?\n\nCancellation fee: $${cancellationFee.toFixed(2)} (50% of the original incentive $${originalPrice.toFixed(2)})\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const inviteRef = doc(db, 'planInvitations', inviteId);
      await updateDoc(inviteRef, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationFee: cancellationFee,
        originalPrice: originalPrice
      });

      // Reload invites
      loadInvites();
      alert(`Invite cancelled successfully. Cancellation fee of $${cancellationFee.toFixed(2)} has been applied.`);
    } catch (error) {
      console.error('Error cancelling invite:', error);
      alert('Failed to cancel invite. Please try again.');
    }
  };

  const openInviteDetail = (invite) => {
    setSelectedInvite(invite);
    setShowInviteDetail(true);
    loadInviteMessages(invite.id);
  };

  const closeInviteDetail = () => {
    setShowInviteDetail(false);
    setSelectedInvite(null);
    setMessages([]);
  };

  const loadInviteMessages = (inviteId) => {
    const messagesRef = collection(db, 'inviteMessages');
    const q = query(messagesRef, where('inviteId', '==', inviteId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return aTime - bTime; // Sort ascending by creation date
      });
      setMessages(messagesList);
    });

    return unsubscribe;
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedInvite) return;

    try {
      await addDoc(collection(db, 'inviteMessages'), {
        inviteId: selectedInvite.id,
        senderId: user.uid,
        senderUsername: userProfile.username,
        message: newMessage,
        createdAt: new Date()
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const openEditModal = (invite) => {
    setEditFormData({
      title: invite.title,
      description: invite.description,
      meetingLocation: invite.meetingLocation,
      date: invite.date?.toDate?.()?.toISOString().split('T')[0] || '',
      time: invite.time,
      price: invite.price.toString()
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditFormData({});
  };

  const updateInvite = async () => {
    if (!selectedInvite || !editFormData.title || !editFormData.description || !editFormData.meetingLocation) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const inviteRef = doc(db, 'planInvitations', selectedInvite.id);
      await updateDoc(inviteRef, {
        title: editFormData.title,
        description: editFormData.description,
        meetingLocation: editFormData.meetingLocation,
        date: new Date(editFormData.date),
        time: editFormData.time,
        price: parseFloat(editFormData.price),
        updatedAt: new Date()
      });

      alert('Invite updated successfully!');
      closeEditModal();
      loadInvites();

      // Update selected invite if detail view is open
      if (showInviteDetail) {
        const updatedInvite = { ...selectedInvite, ...editFormData, date: new Date(editFormData.date), price: parseFloat(editFormData.price) };
        setSelectedInvite(updatedInvite);
      }
    } catch (error) {
      console.error('Error updating invite:', error);
      alert('Failed to update invite');
    }
  };

  if (!user) {
    return (
      <div className="invites-section">
        <h2>Please login to view invites</h2>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="invites-section">
        <div className="loading">Loading invites...</div>
      </div>
    );
  }

  const currentInvites = invites[activeTab] || [];

  return (
    <div className="invites-section">
      <div className="invites-header">
        <h2>My Invites</h2>
        <div className="filter-controls">
          <button 
            onClick={() => setActiveTab('pending')}
            className={`filter-btn ${activeTab === 'pending' ? 'active' : ''}`}
          >
            Pending ({invites.pending.length})
          </button>
          <button 
            onClick={() => setActiveTab('accepted')}
            className={`filter-btn ${activeTab === 'accepted' ? 'active' : ''}`}
          >
            Accepted ({invites.accepted.length})
          </button>
          <button 
            onClick={() => setActiveTab('declined')}
            className={`filter-btn ${activeTab === 'declined' ? 'active' : ''}`}
          >
            Declined ({invites.declined.length})
          </button>
          <button 
            onClick={() => setActiveTab('cancelled')}
            className={`filter-btn ${activeTab === 'cancelled' ? 'active' : ''}`}
          >
            Cancelled ({invites.cancelled?.length || 0})
          </button>
        </div>
      </div>

      <div className="invites-list">
        {currentInvites.length === 0 ? (
          <div className="empty-state">
            <p>No {activeTab} invites</p>
          </div>
        ) : (
          currentInvites.map(invite => (
            <div key={invite.id} className={`invite-item ${invite.type} ${invite.status}`}>
              <div className="invite-header">
                <h3>{invite.title}</h3>
                <span className={`invite-type ${invite.type}`}>
                  {invite.type === 'sent' ? '📤 Sent' : '📥 Received'}
                </span>
              </div>

              <div className="invite-details">
                <p className="invite-partner">
                  {invite.type === 'sent' 
                    ? `To: ${invite.toUsername}` 
                    : `From: ${invite.fromUsername}`
                  }
                </p>
                {invite.description && (
                  <p className="invite-description">{invite.description}</p>
                )}
                <div className="invite-meta">
                  <span className="invite-date">
                    📅 {invite.date?.toDate?.()?.toLocaleDateString()}
                  </span>
                  <span className="invite-time">🕐 {invite.time}</span>
                  <span className="invite-location">📍 {invite.meetingLocation}</span>
                  <span className="invite-incentive">💰 ${invite.price}</span>
                  {invite.status === 'cancelled' && invite.cancellationFee && (
                    <span className="cancellation-fee">❌ Fee: ${invite.cancellationFee.toFixed(2)}</span>
                  )}
                </div>
              </div>

              <div className="invite-actions">
                <button 
                  onClick={() => openInviteDetail(invite)}
                  className="view-details-btn"
                >
                  👁️ View Details
                </button>

                {invite.type === 'sent' && invite.status === 'pending' && (
                  <>
                    <button 
                      onClick={() => openEditModal(invite)}
                      className="edit-btn"
                    >
                      ✏️ Edit
                    </button>
                    <button 
                      onClick={() => handleCancelInvite(invite.id, invite.price)}
                      className="cancel-btn"
                    >
                      🚫 Cancel
                    </button>
                  </>
                )}

                {invite.type === 'received' && invite.status === 'pending' && (
                  <>
                    <button 
                      onClick={() => handleInviteResponse(invite.id, 'accepted')}
                      className="accept-btn"
                    >
                      ✅ Accept
                    </button>
                    <button 
                      onClick={() => handleInviteResponse(invite.id, 'declined')}
                      className="decline-btn"
                    >
                      ❌ Decline
                    </button>
                  </>
                )}
              </div>

              <div className="invite-status">
                <span className={`status-badge ${invite.status}`}>
                  {invite.status === 'pending' && '⏳ Pending'}
                  {invite.status === 'accepted' && '✅ Accepted'}
                  {invite.status === 'declined' && '❌ Declined'}
                  {invite.status === 'cancelled' && '🚫 Cancelled'}
                </span>
                <span className="invite-created">
                  {invite.createdAt?.toDate?.()?.toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Invite Detail Modal */}
      {showInviteDetail && selectedInvite && (
        <div className="modal-overlay" onClick={closeInviteDetail}>
          <div className="modal-content invite-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeInviteDetail}>×</button>

            <div className="invite-detail-header">
              <h2>{selectedInvite.title}</h2>
              <span className={`status-badge ${selectedInvite.status}`}>
                {selectedInvite.status === 'pending' && '⏳ Pending'}
                {selectedInvite.status === 'accepted' && '✅ Accepted'}
                {selectedInvite.status === 'declined' && '❌ Declined'}
                {selectedInvite.status === 'cancelled' && '🚫 Cancelled'}
              </span>
            </div>

            <div className="invite-detail-content">
              <div className="invite-info-section">
                <h3>Invite Details</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <strong>{selectedInvite.type === 'sent' ? 'To:' : 'From:'}</strong>
                    <span>{selectedInvite.type === 'sent' ? selectedInvite.toUsername : selectedInvite.fromUsername}</span>
                  </div>
                  <div className="detail-item">
                    <strong>Description:</strong>
                    <span>{selectedInvite.description}</span>
                  </div>
                  <div className="detail-item">
                    <strong>Date:</strong>
                    <span>{selectedInvite.date?.toDate?.()?.toLocaleDateString()}</span>
                  </div>
                  <div className="detail-item">
                    <strong>Time:</strong>
                    <span>{selectedInvite.time}</span>
                  </div>
                  <div className="detail-item">
                    <strong>Location:</strong>
                    <span>{selectedInvite.meetingLocation}</span>
                  </div>
                  <div className="detail-item">
                    <strong>Incentive:</strong>
                    <span>${selectedInvite.price}</span>
                  </div>
                  {selectedInvite.status === 'cancelled' && selectedInvite.cancellationFee && (
                    <div className="detail-item">
                      <strong>Cancellation Fee:</strong>
                      <span className="cancellation-fee-detail">${selectedInvite.cancellationFee.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedInvite.status === 'cancelled' && selectedInvite.cancelledAt && (
                    <div className="detail-item">
                      <strong>Cancelled At:</strong>
                      <span>{selectedInvite.cancelledAt?.toDate?.()?.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {selectedInvite.type === 'sent' && selectedInvite.status === 'pending' && (
                  <button 
                    onClick={() => openEditModal(selectedInvite)}
                    className="edit-invite-btn"
                  >
                    ✏️ Edit Invite
                  </button>
                )}
              </div>

              <div className="chat-section">
                <h3>Messages</h3>
                <div className="messages-container">
                  {messages.length === 0 ? (
                    <p className="no-messages">No messages yet. Start the conversation!</p>
                  ) : (
                    messages.map(message => (
                      <div 
                        key={message.id} 
                        className={`message ${message.senderId === user.uid ? 'own-message' : 'other-message'}`}
                      >
                        <div className="message-header">
                          <span className="message-sender">{message.senderUsername}</span>
                          <span className="message-time">
                            {message.createdAt?.toDate?.()?.toLocaleString()}
                          </span>
                        </div>
                        <div className="message-content">{message.message}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="message-input-section">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="message-input"
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  />
                  <button onClick={sendMessage} className="send-message-btn">
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Invite Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeEditModal}>×</button>
            <h3>Edit Invite</h3>

            <div className="edit-form">
              <input
                type="text"
                placeholder="Invite title *"
                value={editFormData.title || ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, title: e.target.value }))}
                required
              />
              <textarea
                placeholder="Description *"
                value={editFormData.description || ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Meeting location *"
                value={editFormData.meetingLocation || ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, meetingLocation: e.target.value }))}
                required
              />
              <input
                type="date"
                value={editFormData.date || ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, date: e.target.value }))}
                required
              />
              <input
                type="time"
                value={editFormData.time || ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, time: e.target.value }))}
                required
              />
              <input
                type="number"
                placeholder="Incentive ($) *"
                value={editFormData.price || ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, price: e.target.value }))}
                required
              />
              <button onClick={updateInvite} className="update-invite-btn">
                Update Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invites;