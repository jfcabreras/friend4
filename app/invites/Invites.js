'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, orderBy, addDoc, onSnapshot, getDoc } from 'firebase/firestore';

const Invites = ({ user, userProfile }) => {
  const [invites, setInvites] = useState({
    pending: [],
    accepted: [],
    declined: []
  });
  const [activeTab, setActiveTab] = useState('all');
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
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishInviteId, setFinishInviteId] = useState(null);
  const [pendingFeesBreakdown, setPendingFeesBreakdown] = useState(null);

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
        all: allInvites,
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
    let palCompensation = 0;
    let confirmMessage = '';
    let successMessage = '';

    if (inviteStatus === 'accepted') {
      // Charge 50% cancellation fee only for accepted invites
      cancellationFee = originalPrice * 0.5;
      palCompensation = originalPrice * 0.3; // 30% compensation to pal
      confirmMessage = `Are you sure you want to cancel this accepted invite?\n\n⚠️ CANCELLATION FEE: $${cancellationFee.toFixed(2)} (50% of the original incentive $${originalPrice.toFixed(2)})\n\n💰 PAL COMPENSATION: $${palCompensation.toFixed(2)} (30% will be paid to your pal)\n\nThis fee will be added to your pending balance.\n\nThis action cannot be undone.`;
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
        updateData.palCompensation = palCompensation;

        // Add fee to user's pending balance
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        const currentUserPendingBalance = userDoc.data()?.pendingBalance || 0;
        
        await updateDoc(userRef, {
          pendingBalance: currentUserPendingBalance + cancellationFee
        });

        // Add compensation to pal's earnings and create pending platform fee
        const invite = [...invites.pending, ...invites.accepted].find(inv => inv.id === inviteId);
        if (invite) {
          const palRef = doc(db, 'users', invite.toUserId);
          const palDoc = await getDoc(palRef);
          const currentPalEarnings = palDoc.data()?.totalEarnings || 0;
          const currentPalPendingBalance = palDoc.data()?.pendingBalance || 0;
          const palPlatformFee = palCompensation * 0.05; // 5% platform fee on compensation

          await updateDoc(palRef, {
            totalEarnings: currentPalEarnings + (palCompensation - palPlatformFee),
            pendingBalance: currentPalPendingBalance + palPlatformFee
          });
        }
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

  const finishInvite = (inviteId) => {
    setFinishInviteId(inviteId);
    setShowFinishModal(true);
  };

  const confirmFinishInvite = async () => {
    if (!finishInviteId) return;

    try {
      const inviteRef = doc(db, 'planInvitations', finishInviteId);
      await updateDoc(inviteRef, {
        status: 'finished',
        finishedAt: new Date()
      });

      alert('Invite finished! Now proceed to payment.');
      setShowFinishModal(false);
      setFinishInviteId(null);
      loadInvites();

      // Update selected invite if detail view is open
      if (showInviteDetail && selectedInvite.id === finishInviteId) {
        setSelectedInvite(prev => ({ ...prev, status: 'finished', finishedAt: new Date() }));
      }
    } catch (error) {
      console.error('Error finishing invite:', error);
      alert('Failed to finish invite');
    }
  };

  const markPaymentDone = async (inviteId, totalPaymentAmount) => {
    const invite = [...invites.finished, ...invites.in_progress].find(inv => inv.id === inviteId);
    if (invite) {
      setSelectedInvite(invite);
    }
    
    // Calculate pending fees from user's profile and get detailed breakdown
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    const pendingBalance = userDoc.data()?.pendingBalance || 0;
    
    let breakdown = null;
    
    if (pendingBalance > 0) {
      // Get all unpaid cancelled invites by this user
      const cancelledInvitesQuery = query(
        collection(db, 'planInvitations'),
        where('fromUserId', '==', user.uid),
        where('status', '==', 'cancelled')
      );
      const cancelledInvitesSnapshot = await getDocs(cancelledInvitesQuery);
      
      const unpaidCancellationFees = cancelledInvitesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(invite => invite.cancellationFee > 0 && !invite.cancellationFeePaid)
        .sort((a, b) => (a.cancelledAt?.toDate() || new Date(0)) - (b.cancelledAt?.toDate() || new Date(0)));

      // Get platform fees owed from completed invites as pal
      const receivedInvitesQuery = query(
        collection(db, 'planInvitations'),
        where('toUserId', '==', user.uid),
        where('status', '==', 'completed')
      );
      const receivedInvitesSnapshot = await getDocs(receivedInvitesQuery);
      
      const unpaidPlatformFees = receivedInvitesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(invite => !invite.platformFeePaidByPal && (invite.platformFee || 0) > 0);

      breakdown = {
        cancellationFees: unpaidCancellationFees,
        platformFees: unpaidPlatformFees,
        totalCancellationFees: unpaidCancellationFees.reduce((sum, inv) => sum + (inv.cancellationFee || 0), 0),
        totalPlatformFees: unpaidPlatformFees.reduce((sum, inv) => sum + (inv.platformFee || 0), 0)
      };
      
      setPendingFeesBreakdown(breakdown);
      setSelectedInvite({...invite, pendingFeesBreakdown: breakdown});
    } else {
      setPendingFeesBreakdown(null);
    }
    
    // Calculate total payment amount including pending fees
    const incentiveAmount = totalPaymentAmount || invite.totalPaymentAmount || invite.price;
    const totalWithPendingFees = incentiveAmount + pendingBalance;
    
    setPaymentAmount(totalWithPendingFees);
    setShowPaymentModal(true);
  };

  const confirmPaymentDone = async () => {
    if (!selectedInvite) return;

    try {
      // Get current pending balance
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      const pendingBalance = userDoc.data()?.pendingBalance || 0;
      
      const incentiveAmount = selectedInvite.incentiveAmount || selectedInvite.price;
      const pendingFeesIncluded = pendingBalance;
      const platformFee = incentiveAmount * 0.05; // 5% platform fee
      const netAmountToPal = incentiveAmount - platformFee;

      const inviteRef = doc(db, 'planInvitations', selectedInvite.id);
      await updateDoc(inviteRef, {
        status: 'payment_done',
        paymentDoneAt: new Date(),
        paymentMethod: 'cash',
        incentiveAmount: incentiveAmount,
        pendingFeesIncluded: pendingFeesIncluded,
        platformFee: platformFee,
        netAmountToPal: netAmountToPal,
        totalPaidAmount: paymentAmount
      });

      // Clear pending fees from user profile and mark related cancellation fees as paid
      if (pendingFeesIncluded > 0) {
        const userRef = doc(db, 'users', user.uid);
        
        // Get user's current pending balance to calculate remaining balance after this payment
        const userDoc = await getDoc(userRef);
        const currentPendingBalance = userDoc.data()?.pendingBalance || 0;
        const newPendingBalance = Math.max(0, currentPendingBalance - pendingFeesIncluded);
        
        await updateDoc(userRef, {
          pendingBalance: newPendingBalance,
          lastPendingFeePayment: new Date()
        });

        // Get all unpaid cancelled invites by this user to mark them as paid
        const cancelledInvitesQuery = query(
          collection(db, 'planInvitations'),
          where('fromUserId', '==', user.uid),
          where('status', '==', 'cancelled'),
          where('cancelledBy', '==', user.uid)
        );
        const cancelledInvitesSnapshot = await getDocs(cancelledInvitesQuery);
        
        let remainingPaymentFees = pendingFeesIncluded;
        const unpaidInvites = cancelledInvitesSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(invite => invite.cancellationFee > 0 && !invite.cancellationFeePaid)
          .sort((a, b) => (a.cancelledAt?.toDate() || new Date(0)) - (b.cancelledAt?.toDate() || new Date(0)));

        // Mark cancellation fees as paid in chronological order
        for (const cancelledInvite of unpaidInvites) {
          if (remainingPaymentFees >= cancelledInvite.cancellationFee) {
            await updateDoc(doc(db, 'planInvitations', cancelledInvite.id), {
              cancellationFeePaid: true,
              cancellationFeePaidAt: new Date(),
              cancellationFeePaidInInvite: selectedInvite.id
            });
            remainingPaymentFees -= cancelledInvite.cancellationFee;
            
            if (remainingPaymentFees <= 0) break;
          }
        }
      }

      alert('Payment marked as done! Waiting for recipient confirmation.');
      setShowPaymentModal(false);
      loadInvites();

      // Update selected invite if detail view is open
      if (showInviteDetail && selectedInvite.id === selectedInvite.id) {
        setSelectedInvite(prev => ({ 
          ...prev, 
          status: 'payment_done', 
          paymentDoneAt: new Date(),
          paymentMethod: 'cash',
          platformFee: platformFee,
          netAmountToPal: netAmountToPal
        }));
      }
    } catch (error) {
      console.error('Error marking payment as done:', error);
      alert('Failed to mark payment as done');
    }
  };

  const confirmPaymentReceived = async (inviteId) => {
    try {
      const invite = [...invites.payment_done].find(inv => inv.id === inviteId);
      if (!invite) return;

      const platformFee = invite.platformFee || (invite.incentiveAmount || invite.price) * 0.05;

      const inviteRef = doc(db, 'planInvitations', inviteId);
      await updateDoc(inviteRef, {
        status: 'completed',
        paymentReceivedAt: new Date(),
        paymentConfirmed: true
      });

      // Add platform fee to pal's pending balance
      const palRef = doc(db, 'users', invite.toUserId);
      const palDoc = await getDoc(palRef);
      const currentPendingBalance = palDoc.data()?.pendingBalance || 0;
      
      await updateDoc(palRef, {
        pendingBalance: currentPendingBalance + platformFee,
        totalEarnings: (palDoc.data()?.totalEarnings || 0) + (invite.netAmountToPal || (invite.incentiveAmount || invite.price) - platformFee)
      });

      alert('Payment received confirmed! Invite completed successfully.');
      loadInvites();

      // Update selected invite if detail view is open
      if (showInviteDetail && selectedInvite.id === inviteId) {
        setSelectedInvite(prev => ({ 
          ...prev, 
          status: 'completed', 
          paymentReceivedAt: new Date(),
          paymentConfirmed: true
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
            onClick={() => setActiveTab('all')}
            className={`filter-btn ${activeTab === 'all' ? 'active' : ''}`}
          >
            All ({invites.all?.length || 0})
          </button>
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
            <div key={invite.id} className={`invite-item ${invite.type}`}>
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
                    <span className="cancellation-fee">
                      ❌ Fee: ${invite.cancellationFee.toFixed(2)}
                      {invite.cancellationFeePaid ? ' (Paid)' : ' (Unpaid)'}
                    </span>
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

                {invite.status === 'finished' && invite.type === 'sent' && (
                  <button 
                    onClick={() => markPaymentDone(invite.id, invite.totalPaymentAmount || invite.price)}
                    className="payment-btn"
                  >
                    💰 Mark Payment Done
                  </button>
                )}

                {invite.status === 'finished' && invite.type === 'received' && (
                  <button 
                    onClick={() => confirmPaymentReceived(invite.id)}
                    className="receive-payment-btn"
                  >
                    ✅ Confirm Payment Received
                  </button>
                )}

                {invite.status === 'payment_done' && invite.type === 'received' && (
                  <button 
                    onClick={() => confirmPaymentReceived(invite.id)}
                    className="receive-payment-btn"
                  >
                    ✅ Confirm Payment Received
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
                      <span className="cancellation-fee-detail">
                        ${selectedInvite.cancellationFee.toFixed(2)}
                        {selectedInvite.cancellationFeePaid ? ' (Paid)' : ' (Unpaid)'}
                      </span>
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
                  {selectedInvite.paymentDoneAt && (
                    <div className="detail-item">
                      <strong>Payment Done At:</strong>
                      <span>{selectedInvite.paymentDoneAt?.toDate?.()?.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedInvite.paymentReceivedAt && (
                    <div className="detail-item">
                      <strong>Payment Received At:</strong>
                      <span>{selectedInvite.paymentReceivedAt?.toDate?.()?.toLocaleString()}</span>
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

                {selectedInvite.status === 'finished' && selectedInvite.type === 'sent' && (
                  <div className="invite-actions-detail">
                    <button 
                      onClick={() => markPaymentDone(selectedInvite.id, selectedInvite.totalPaymentAmount || selectedInvite.price)}
                      className="payment-invite-btn"
                    >
                      💰 Mark Payment Done
                    </button>
                  </div>
                )}

                {selectedInvite.status === 'finished' && selectedInvite.type === 'received' && (
                  <div className="invite-actions-detail">
                    <button 
                      onClick={() => confirmPaymentReceived(selectedInvite.id)}
                      className="receive-payment-invite-btn"
                    >
                      ✅ Confirm Payment Received
                    </button>
                  </div>
                )}

                {selectedInvite.status === 'payment_done' && selectedInvite.type === 'received' && (
                  <div className="invite-actions-detail">
                    <button 
                      onClick={() => confirmPaymentReceived(selectedInvite.id)}
                      className="receive-payment-invite-btn"
                    >
                      ✅ Confirm Payment Received
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

      {/* Finish Invite Confirmation Modal */}
      {showFinishModal && (
        <div className="modal-overlay" onClick={() => setShowFinishModal(false)}>
          <div className="modal-content finish-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowFinishModal(false)}>×</button>
            
            <div className="finish-header">
              <h2>🏁 Finish Invite</h2>
              <p>Ready to complete your activity?</p>
            </div>

            <div className="finish-instructions">
              {(() => {
                const invite = [...invites.in_progress].find(inv => inv.id === finishInviteId);
                if (!invite) return null;
                
                const isAuthor = invite.type === 'sent';
                
                return (
                  <>
                    <h4>Instructions:</h4>
                    <ul>
                      {isAuthor ? (
                        <>
                          <li>Ensure both parties are satisfied with the experience</li>
                          <li>After finishing, you will be able to mark payment as done</li>
                          <li>Wait for your pal to confirm payment received to complete the invite</li>
                        </>
                      ) : (
                        <>
                          <li>Ensure both parties are satisfied with the experience</li>
                          <li>After finishing, your pal will mark payment as done</li>
                          <li>You will then confirm payment received to complete the invite</li>
                        </>
                      )}
                    </ul>
                  </>
                );
              })()}
            </div>

            <div className="finish-actions">
              <button 
                onClick={confirmFinishInvite}
                className="confirm-finish-btn"
              >
                ✅ Finish Invite
              </button>
              <button 
                onClick={() => setShowFinishModal(false)}
                className="cancel-finish-btn"
              >
                Cancel
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
              {(() => {
                const incentiveAmount = selectedInvite?.price || 0;
                const pendingFees = paymentAmount - incentiveAmount;
                
                return (
                  <>
                    <div className="payment-breakdown">
                      <div className="breakdown-item">
                        <span className="breakdown-label">Incentive Payment:</span>
                        <span className="breakdown-value">${incentiveAmount.toFixed(2)}</span>
                      </div>
                      {pendingFees > 0 && (
                        <div className="breakdown-item pending-fees">
                          <span className="breakdown-label">Outstanding Fees:</span>
                          <span className="breakdown-value">${pendingFees.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="breakdown-total">
                        <span className="amount-label">Total Amount to Pay:</span>
                        <span className="amount-value">${paymentAmount.toFixed(2)}</span>
                      </div>
                    </div>
                    
                    <div className="payment-method">
                      <span className="method-label">Payment Method:</span>
                      <span className="method-value">💵 Cash Payment</span>
                    </div>

                    {pendingFees > 0 && (
                      <div className="pending-fees-notice">
                        <h4>⚠️ Outstanding Fees Notice:</h4>
                        <p>You have ${pendingFees.toFixed(2)} in outstanding fees that will be included in this payment:</p>
                        
                        {selectedInvite?.pendingFeesBreakdown && (
                          <div className="fees-breakdown">
                            {selectedInvite.pendingFeesBreakdown.cancellationFees.length > 0 && (
                              <div className="fee-category">
                                <h5>📋 Cancellation Fees (Your Debt to Platform):</h5>
                                {selectedInvite.pendingFeesBreakdown.cancellationFees.map(invite => (
                                  <div key={invite.id} className="fee-item">
                                    <span>• "${invite.title}" to {invite.toUsername}</span>
                                    <span>${(invite.cancellationFee || 0).toFixed(2)}</span>
                                  </div>
                                ))}
                                <div className="fee-subtotal">
                                  <strong>Subtotal: ${selectedInvite.pendingFeesBreakdown.totalCancellationFees.toFixed(2)}</strong>
                                </div>
                              </div>
                            )}
                            
                            {selectedInvite.pendingFeesBreakdown.platformFees.length > 0 && (
                              <div className="fee-category">
                                <h5>💼 Platform Fees (Your Debt as Pal to Platform):</h5>
                                {selectedInvite.pendingFeesBreakdown.platformFees.map(invite => (
                                  <div key={invite.id} className="fee-item">
                                    <span>• "${invite.title}" from {invite.fromUsername}</span>
                                    <span>${(invite.platformFee || 0).toFixed(2)}</span>
                                  </div>
                                ))}
                                <div className="fee-subtotal">
                                  <strong>Subtotal: ${selectedInvite.pendingFeesBreakdown.totalPlatformFees.toFixed(2)}</strong>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        
                        <div className="debt-clarification">
                          <p><strong>💡 Important:</strong> These are <em>your debts to the platform</em>, not to your pal. Your pal will receive only the incentive amount (${incentiveAmount.toFixed(2)}). The outstanding fees (${pendingFees.toFixed(2)}) are settled with the platform administration.</p>
                        </div>
                      </div>
                    )}

                    <div className="payment-instructions">
                      <h4>Instructions:</h4>
                      <ul>
                        <li>Please pay the total amount in cash to your pal</li>
                        <li>Ensure both parties are satisfied with the experience</li>
                        <li>Mark payment as done only after completing the cash transaction</li>
                        <li>Your pal will then confirm they received the payment</li>
                        {pendingFees > 0 && (
                          <li>Outstanding fees will be automatically cleared after this payment</li>
                        )}
                      </ul>
                    </div>
                  </>
                );
              })()}
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