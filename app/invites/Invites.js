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
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);

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
        cancelled: allInvites.filter(invite => invite.status === 'cancelled'),
        in_progress: allInvites.filter(invite => invite.status === 'in_progress'),
        finished: allInvites.filter(invite => invite.status === 'finished'),
        payment_done: allInvites.filter(invite => invite.status === 'payment_done'),
        completed: allInvites.filter(invite => invite.status === 'completed')
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
      const updateData = {
        status: response,
        respondedAt: new Date()
      };

      // Add specific datetime fields based on response
      if (response === 'accepted') {
        updateData.acceptedAt = new Date();
      } else if (response === 'declined') {
        updateData.declinedAt = new Date();
      }

      await updateDoc(inviteRef, updateData);

      // Reload invites
      loadInvites();
    } catch (error) {
      console.error('Error updating invite:', error);
    }
  };

  const handleCancelInvite = async (inviteId, originalPrice, inviteStatus) => {
    let cancellationFee = 0;
    let confirmMessage = '';
    let successMessage = '';

    if (inviteStatus === 'accepted') {
      // Charge 50% cancellation fee only for accepted invites
      cancellationFee = originalPrice * 0.5;
      confirmMessage = `Are you sure you want to cancel this accepted invite?\n\n⚠️ CANCELLATION FEE: $${cancellationFee.toFixed(2)} (50% of the original incentive $${originalPrice.toFixed(2)})\n\nThis fee will be added to your pending balance.\n\nThis action cannot be undone.`;
      successMessage = `Invite cancelled successfully. Cancellation fee of $${cancellationFee.toFixed(2)} has been applied to your account.`;
    } else {
      // No fee for pending invites
      confirmMessage = `Are you sure you want to cancel this invite?\n\nNo cancellation fee will be charged since the invite hasn't been accepted yet.\n\nThis action cannot be undone.`;
      successMessage = 'Invite cancelled successfully. No cancellation fee was charged.';
    }

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    try {
      const updateData = {
        status: 'cancelled',
        cancelledAt: new Date(),
        originalPrice: originalPrice
      };

      // Only add cancellation fee if invite was accepted
      if (inviteStatus === 'accepted') {
        updateData.cancellationFee = cancellationFee;
      }

      const inviteRef = doc(db, 'planInvitations', inviteId);
      await updateDoc(inviteRef, updateData);

      // Reload invites
      loadInvites();
      alert(successMessage);
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

  const startInvite = async (inviteId) => {
    try {
      const inviteRef = doc(db, 'planInvitations', inviteId);
      await updateDoc(inviteRef, {
        status: 'in_progress',
        startedAt: new Date()
      });

      alert('Invite started! Have a great time!');
      loadInvites();

      // Update selected invite if detail view is open
      if (showInviteDetail && selectedInvite.id === inviteId) {
        setSelectedInvite(prev => ({ ...prev, status: 'in_progress', startedAt: new Date() }));
      }
    } catch (error) {
      console.error('Error starting invite:', error);
      alert('Failed to start invite');
    }
  };

  const finishInvite = async (inviteId) => {
    const invite = invites.in_progress.find(inv => inv.id === inviteId) || selectedInvite;
    if (!invite) return;

    const isAuthor = invite.fromUserId === user.uid;
    const isPal = invite.toUserId === user.uid;
    const role = isAuthor ? 'author' : 'pal';
    
    const confirmMessage = isAuthor 
      ? `Are you sure you want to finish this invite as the AUTHOR?\n\nAs the author, you are responsible for:\n• Paying the incentive amount ($${invite.price}) to your pal\n• Confirming the experience was completed\n\nAfter finishing, you'll be able to mark payment as done.`
      : `Are you sure you want to finish this invite as the PAL?\n\nAs the pal, you are confirming that:\n• The experience/activity was completed\n• You're ready to receive payment ($${invite.price}) from the author\n\nAfter finishing, wait for the author to process payment.`;

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    try {
      const inviteRef = doc(db, 'planInvitations', inviteId);
      await updateDoc(inviteRef, {
        status: 'finished',
        finishedAt: new Date(),
        finishedBy: user.uid,
        finishedByRole: role,
        finishedByUsername: userProfile.username
      });

      const successMessage = isAuthor 
        ? 'Invite finished! As the author, you can now proceed to mark payment as done.'
        : 'Invite finished! As the pal, wait for the author to process your payment.';

      alert(successMessage);
      loadInvites();

      // Update selected invite if detail view is open
      if (showInviteDetail && selectedInvite.id === inviteId) {
        setSelectedInvite(prev => ({ 
          ...prev, 
          status: 'finished', 
          finishedAt: new Date(),
          finishedBy: user.uid,
          finishedByRole: role,
          finishedByUsername: userProfile.username
        }));
      }
    } catch (error) {
      console.error('Error finishing invite:', error);
      alert('Failed to finish invite');
    }
  };

  const markPaymentDone = async (inviteId, price) => {
    setPaymentAmount(price);
    setShowPaymentModal(true);
  };

  const confirmPaymentDone = async () => {
    if (!selectedInvite) return;

    const isAuthor = selectedInvite.fromUserId === user.uid;
    
    try {
      const inviteRef = doc(db, 'planInvitations', selectedInvite.id);
      await updateDoc(inviteRef, {
        status: 'payment_done',
        paymentDoneAt: new Date(),
        paymentMethod: 'cash',
        paymentDoneBy: user.uid,
        paymentDoneByRole: isAuthor ? 'author' : 'pal',
        paymentDoneByUsername: userProfile.username
      });

      alert('Payment marked as done by AUTHOR! Waiting for PAL to confirm receipt.');
      setShowPaymentModal(false);
      loadInvites();

      // Update selected invite if detail view is open
      if (showInviteDetail) {
        setSelectedInvite(prev => ({ 
          ...prev, 
          status: 'payment_done', 
          paymentDoneAt: new Date(),
          paymentMethod: 'cash',
          paymentDoneBy: user.uid,
          paymentDoneByRole: isAuthor ? 'author' : 'pal',
          paymentDoneByUsername: userProfile.username
        }));
      }
    } catch (error) {
      console.error('Error marking payment as done:', error);
      alert('Failed to mark payment as done');
    }
  };

  const confirmPaymentReceived = async (inviteId) => {
    const invite = invites.payment_done.find(inv => inv.id === inviteId) || selectedInvite;
    if (!invite) return;

    const isPal = invite.toUserId === user.uid;
    
    const confirmMessage = `Are you sure you want to confirm payment received as the PAL?\n\nBy confirming, you acknowledge that:\n• You have received the full payment ($${invite.price}) in cash from the author\n• You are satisfied with the transaction\n• The invite will be marked as completed\n\nThis action cannot be undone.`;

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    try {
      const inviteRef = doc(db, 'planInvitations', inviteId);
      await updateDoc(inviteRef, {
        status: 'completed',
        paymentReceivedAt: new Date(),
        paymentConfirmed: true,
        paymentReceivedBy: user.uid,
        paymentReceivedByRole: isPal ? 'pal' : 'author',
        paymentReceivedByUsername: userProfile.username,
        completedAt: new Date()
      });

      alert('Payment received confirmed by PAL! Invite completed successfully.');
      loadInvites();

      // Update selected invite if detail view is open
      if (showInviteDetail && selectedInvite.id === inviteId) {
        setSelectedInvite(prev => ({ 
          ...prev, 
          status: 'completed', 
          paymentReceivedAt: new Date(),
          paymentConfirmed: true,
          paymentReceivedBy: user.uid,
          paymentReceivedByRole: isPal ? 'pal' : 'author',
          paymentReceivedByUsername: userProfile.username,
          completedAt: new Date()
        }));
      }
    } catch (error) {
      console.error('Error confirming payment received:', error);
      alert('Failed to confirm payment received');
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
          <button 
            onClick={() => setActiveTab('in_progress')}
            className={`filter-btn ${activeTab === 'in_progress' ? 'active' : ''}`}
          >
            In Progress ({invites.in_progress?.length || 0})
          </button>
          <button 
            onClick={() => setActiveTab('finished')}
            className={`filter-btn ${activeTab === 'finished' ? 'active' : ''}`}
          >
            Finished ({invites.finished?.length || 0})
          </button>
          <button 
            onClick={() => setActiveTab('payment_done')}
            className={`filter-btn ${activeTab === 'payment_done' ? 'active' : ''}`}
          >
            Payment Done ({invites.payment_done?.length || 0})
          </button>
          <button 
            onClick={() => setActiveTab('completed')}
            className={`filter-btn ${activeTab === 'completed' ? 'active' : ''}`}
          >
            Completed ({invites.completed?.length || 0})
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

                {invite.type === 'sent' && (invite.status === 'pending' || invite.status === 'accepted') && (
                  <>
                    {invite.status === 'pending' && (
                      <button 
                        onClick={() => openEditModal(invite)}
                        className="edit-btn"
                      >
                        ✏️ Edit
                      </button>
                    )}
                    <button 
                      onClick={() => handleCancelInvite(invite.id, invite.price, invite.status)}
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

                {invite.status === 'accepted' && (
                  <button 
                    onClick={() => startInvite(invite.id)}
                    className="start-btn"
                  >
                    🚀 Start Invite
                  </button>
                )}

                {invite.status === 'in_progress' && (
                  <button 
                    onClick={() => finishInvite(invite.id)}
                    className="finish-btn"
                  >
                    🏁 Finish Invite
                  </button>
                )}

                {invite.status === 'finished' && invite.fromUserId === user.uid && (
                  <button 
                    onClick={() => markPaymentDone(invite.id, invite.price)}
                    className="payment-btn"
                  >
                    💰 Mark Payment Done (AUTHOR)
                  </button>
                )}

                {invite.status === 'payment_done' && invite.type === 'received' && (
                  <button 
                    onClick={() => confirmPaymentReceived(invite.id)}
                    className="receive-payment-btn"
                  >
                    ✅ Confirm Payment Received (PAL)
                  </button>
                )}
              </div>

              <div className="invite-status">
                <span className={`status-badge ${invite.status}`}>
                  {invite.status === 'pending' && '⏳ Pending'}
                  {invite.status === 'accepted' && '✅ Accepted'}
                  {invite.status === 'declined' && '❌ Declined'}
                  {invite.status === 'cancelled' && '🚫 Cancelled'}
                  {invite.status === 'in_progress' && '🚀 In Progress'}
                  {invite.status === 'finished' && '🏁 Finished'}
                  {invite.status === 'payment_done' && '💰 Payment Done'}
                  {invite.status === 'completed' && '✅ Completed'}
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
                {selectedInvite.status === 'in_progress' && '🚀 In Progress'}
                {selectedInvite.status === 'finished' && '🏁 Finished'}
                {selectedInvite.status === 'payment_done' && '💰 Payment Done'}
                {selectedInvite.status === 'completed' && '✅ Completed'}
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
                  {selectedInvite.acceptedAt && (
                    <div className="detail-item">
                      <strong>Accepted At:</strong>
                      <span>{selectedInvite.acceptedAt?.toDate?.()?.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedInvite.declinedAt && (
                    <div className="detail-item">
                      <strong>Declined At:</strong>
                      <span>{selectedInvite.declinedAt?.toDate?.()?.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedInvite.startedAt && (
                    <div className="detail-item">
                      <strong>Started At:</strong>
                      <span>{selectedInvite.startedAt?.toDate?.()?.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedInvite.finishedAt && (
                    <div className="detail-item">
                      <strong>Finished At:</strong>
                      <span>{selectedInvite.finishedAt?.toDate?.()?.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedInvite.finishedBy && (
                    <div className="detail-item">
                      <strong>Finished By:</strong>
                      <span className="role-indicator">
                        {selectedInvite.finishedByUsername} ({selectedInvite.finishedByRole?.toUpperCase()})
                      </span>
                    </div>
                  )}
                  {selectedInvite.paymentDoneAt && (
                    <div className="detail-item">
                      <strong>Payment Done At:</strong>
                      <span>{selectedInvite.paymentDoneAt?.toDate?.()?.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedInvite.paymentDoneBy && (
                    <div className="detail-item">
                      <strong>Payment Done By:</strong>
                      <span className="role-indicator">
                        {selectedInvite.paymentDoneByUsername} ({selectedInvite.paymentDoneByRole?.toUpperCase()})
                      </span>
                    </div>
                  )}
                  {selectedInvite.paymentReceivedAt && (
                    <div className="detail-item">
                      <strong>Payment Received At:</strong>
                      <span>{selectedInvite.paymentReceivedAt?.toDate?.()?.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedInvite.paymentReceivedBy && (
                    <div className="detail-item">
                      <strong>Payment Confirmed By:</strong>
                      <span className="role-indicator">
                        {selectedInvite.paymentReceivedByUsername} ({selectedInvite.paymentReceivedByRole?.toUpperCase()})
                      </span>
                    </div>
                  )}
                  {selectedInvite.completedAt && (
                    <div className="detail-item">
                      <strong>Completed At:</strong>
                      <span>{selectedInvite.completedAt?.toDate?.()?.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedInvite.paymentConfirmed && (
                    <div className="detail-item">
                      <strong>Payment:</strong>
                      <span className="payment-confirmed">✅ Confirmed ({selectedInvite.paymentMethod})</span>
                    </div>
                  )}
                </div>

                {selectedInvite.type === 'sent' && (selectedInvite.status === 'pending' || selectedInvite.status === 'accepted') && (
                  <div className="invite-actions-detail">
                    {selectedInvite.status === 'pending' && (
                      <button 
                        onClick={() => openEditModal(selectedInvite)}
                        className="edit-invite-btn"
                      >
                        ✏️ Edit Invite
                      </button>
                    )}
                    <button 
                      onClick={() => handleCancelInvite(selectedInvite.id, selectedInvite.price, selectedInvite.status)}
                      className="cancel-invite-btn"
                    >
                      🚫 Cancel Invite
                    </button>
                  </div>
                )}

                {selectedInvite.status === 'accepted' && (
                  <div className="invite-actions-detail">
                    <button 
                      onClick={() => startInvite(selectedInvite.id)}
                      className="start-invite-btn"
                    >
                      🚀 Start Invite
                    </button>
                  </div>
                )}

                {selectedInvite.status === 'in_progress' && (
                  <div className="invite-actions-detail">
                    <button 
                      onClick={() => finishInvite(selectedInvite.id)}
                      className="finish-invite-btn"
                    >
                      🏁 Finish Invite
                    </button>
                  </div>
                )}

                {selectedInvite.status === 'finished' && selectedInvite.fromUserId === user.uid && (
                  <div className="invite-actions-detail">
                    <button 
                      onClick={() => markPaymentDone(selectedInvite.id, selectedInvite.price)}
                      className="payment-invite-btn"
                    >
                      💰 Mark Payment Done (AUTHOR)
                    </button>
                  </div>
                )}

                {selectedInvite.status === 'payment_done' && selectedInvite.type === 'received' && (
                  <div className="invite-actions-detail">
                    <button 
                      onClick={() => confirmPaymentReceived(selectedInvite.id)}
                      className="receive-payment-invite-btn"
                    >
                      ✅ Confirm Payment Received (PAL)
                    </button>
                  </div>
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

      {/* Payment Confirmation Modal */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="modal-content payment-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPaymentModal(false)}>×</button>
            
            <div className="payment-header">
              <h2>💰 Payment Confirmation</h2>
              <p>Ready to complete your invite?</p>
            </div>

            <div className="payment-details">
              <div className="payment-amount">
                <span className="amount-label">Amount to Pay:</span>
                <span className="amount-value">${paymentAmount.toFixed(2)}</span>
              </div>
              
              <div className="payment-method">
                <span className="method-label">Payment Method:</span>
                <span className="method-value">💵 Cash Payment</span>
              </div>

              <div className="payment-instructions">
                <h4>Instructions for AUTHOR:</h4>
                <ul>
                  <li>🏦 Pay ${paymentAmount.toFixed(2)} in cash to your PAL</li>
                  <li>💬 Ensure both parties are satisfied with the experience</li>
                  <li>✅ Click "Mark Payment as Done" only AFTER you have given the cash</li>
                  <li>⏳ Wait for your PAL to confirm they received the payment</li>
                  <li>🎉 The invite will be completed once PAL confirms receipt</li>
                </ul>
              </div>
            </div>

            <div className="payment-actions">
              <button 
                onClick={confirmPaymentDone}
                className="confirm-payment-btn"
              >
                ✅ Mark Payment as Done
              </button>
              <button 
                onClick={() => setShowPaymentModal(false)}
                className="cancel-payment-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invites;