
'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot, addDoc, orderBy } from 'firebase/firestore';
import InviteModal from '../components/InviteModal';

const Invites = ({ user, userProfile }) => {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedPal, setSelectedPal] = useState(null);
  const [expandedInvite, setExpandedInvite] = useState(null);
  const [messages, setMessages] = useState({});
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    if (user) {
      loadInvites();
    }
  }, [user, filter]);

  const loadInvites = async () => {
    if (!user) return;

    setLoading(true);
    try {
      let allInvites = [];

      // Get sent invites
      const sentQuery = query(
        collection(db, 'planInvitations'),
        where('fromUserId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const sentSnapshot = await getDocs(sentQuery);
      const sentInvites = sentSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'sent',
        ...doc.data()
      }));

      // Get received invites
      const receivedQuery = query(
        collection(db, 'planInvitations'),
        where('toUserId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const receivedSnapshot = await getDocs(receivedQuery);
      const receivedInvites = receivedInvitesSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'received',
        ...doc.data()
      }));

      allInvites = [...sentInvites, ...receivedInvites];

      // Apply filter
      let filteredInvites = allInvites;
      if (filter !== 'all') {
        filteredInvites = allInvites.filter(invite => {
          switch (filter) {
            case 'pending':
              return invite.status === 'pending';
            case 'accepted':
              return invite.status === 'accepted';
            case 'in_progress':
              return invite.status === 'in_progress';
            case 'finished':
              return ['finished', 'payment_done', 'completed'].includes(invite.status);
            case 'cancelled':
              return invite.status === 'cancelled';
            default:
              return true;
          }
        });
      }

      // Sort by creation date (newest first)
      filteredInvites.sort((a, b) => {
        const aDate = a.createdAt?.toDate?.() || new Date(0);
        const bDate = b.createdAt?.toDate?.() || new Date(0);
        return bDate - aDate;
      });

      setInvites(filteredInvites);
    } catch (error) {
      console.error('Error loading invites:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (inviteId) => {
    try {
      await updateDoc(doc(db, 'planInvitations', inviteId), {
        status: 'accepted',
        acceptedAt: new Date(),
        respondedAt: new Date()
      });
      loadInvites();
    } catch (error) {
      console.error('Error accepting invite:', error);
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    try {
      await updateDoc(doc(db, 'planInvitations', inviteId), {
        status: 'declined',
        declinedAt: new Date(),
        respondedAt: new Date()
      });
      loadInvites();
    } catch (error) {
      console.error('Error declining invite:', error);
    }
  };

  const handleStartActivity = async (inviteId) => {
    try {
      await updateDoc(doc(db, 'planInvitations', inviteId), {
        status: 'in_progress',
        startedAt: new Date()
      });
      loadInvites();
    } catch (error) {
      console.error('Error starting activity:', error);
    }
  };

  const handleFinishActivity = async (inviteId) => {
    try {
      await updateDoc(doc(db, 'planInvitations', inviteId), {
        status: 'finished',
        finishedAt: new Date()
      });
      loadInvites();
    } catch (error) {
      console.error('Error finishing activity:', error);
    }
  };

  const handleMarkPaymentDone = async (inviteId, invite) => {
    try {
      // Calculate outstanding fees to include in payment
      const sentInvitesQuery = query(
        collection(db, 'planInvitations'),
        where('fromUserId', '==', user.uid)
      );
      const sentInvitesSnapshot = await getDocs(sentInvitesQuery);
      const userSentInvites = sentInvitesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate pending incentive payments
      const pendingIncentivePayments = userSentInvites
        .filter(inv => ['finished', 'payment_done'].includes(inv.status) && inv.status !== 'completed')
        .reduce((total, inv) => total + (inv.price || 0), 0);

      // Calculate pending cancellation fees
      const pendingCancellationFees = userSentInvites
        .filter(inv => inv.status === 'cancelled' && inv.cancellationFee && inv.cancellationFee > 0 && !inv.cancellationFeePaid)
        .reduce((total, inv) => total + (inv.cancellationFee || 0), 0);

      // Get received invites to calculate platform fees
      const receivedInvitesQuery = query(
        collection(db, 'planInvitations'),
        where('toUserId', '==', user.uid)
      );
      const receivedInvitesSnapshot = await getDocs(receivedInvitesQuery);
      const userReceivedInvites = receivedInvitesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate platform fees owed
      let platformFeesOwed = 0;
      if (userProfile.profileType === 'public') {
        userReceivedInvites.forEach(inv => {
          if (inv.status === 'completed' && inv.paymentConfirmed === true && !inv.platformFeePaid) {
            platformFeesOwed += inv.platformFee || ((inv.price || 0) * 0.05);
          }
          if (inv.status === 'cancelled' && inv.palCompensation && inv.palCompensation > 0 && inv.cancellationFeePaid && !inv.platformFeePaid) {
            platformFeesOwed += inv.platformFee || ((inv.price || 0) * 0.05);
          }
        });
      }

      const totalOutstandingFees = pendingIncentivePayments + pendingCancellationFees + platformFeesOwed;

      // Discriminate between different types of outstanding fees
      let pendingInviteFeesIncluded = 0;
      let pendingCancelledInviteFeesIncluded = 0;

      // Add pending incentive payments and platform fees to invite fees
      pendingInviteFeesIncluded = pendingIncentivePayments + platformFeesOwed;
      
      // Add pending cancellation fees to cancellation fees
      pendingCancelledInviteFeesIncluded = pendingCancellationFees;

      const totalPaidAmount = (invite.price || 0) + totalOutstandingFees;

      await updateDoc(doc(db, 'planInvitations', inviteId), {
        status: 'payment_done',
        paymentDoneAt: new Date(),
        totalPaidAmount: totalPaidAmount,
        pendingFeesIncluded: totalOutstandingFees,
        pendingInviteFeesIncluded: pendingInviteFeesIncluded,
        pendingCancelledInviteFeesIncluded: pendingCancelledInviteFeesIncluded,
        outstandingFeesBreakdown: {
          incentivePayments: pendingIncentivePayments,
          cancellationFees: pendingCancellationFees,
          platformFees: platformFeesOwed
        }
      });

      loadInvites();
    } catch (error) {
      console.error('Error marking payment done:', error);
    }
  };

  const handleConfirmPaymentReceived = async (inviteId, invite) => {
    try {
      await updateDoc(doc(db, 'planInvitations', inviteId), {
        status: 'completed',
        paymentReceivedAt: new Date(),
        paymentConfirmed: true
      });
      loadInvites();
    } catch (error) {
      console.error('Error confirming payment received:', error);
    }
  };

  const handleCancelInvite = async (inviteId, invite) => {
    try {
      let cancellationFee = 0;
      let palCompensation = 0;

      if (invite.status === 'accepted') {
        const price = invite.price || 0;
        cancellationFee = price * 0.5;
        palCompensation = price * 0.3;
      }

      await updateDoc(doc(db, 'planInvitations', inviteId), {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationFee: cancellationFee,
        palCompensation: palCompensation
      });

      loadInvites();
    } catch (error) {
      console.error('Error cancelling invite:', error);
    }
  };

  const loadMessages = (inviteId) => {
    try {
      const messagesQuery = query(
        collection(db, 'planInvitations', inviteId, 'messages'),
        orderBy('createdAt', 'asc')
      );

      const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const messagesList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMessages(prev => ({
          ...prev,
          [inviteId]: messagesList
        }));
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error loading messages:', error);
      return () => {};
    }
  };

  const sendMessage = async (inviteId, messageText) => {
    if (!messageText.trim() || !user) return;

    try {
      await addDoc(collection(db, 'planInvitations', inviteId, 'messages'), {
        text: messageText.trim(),
        senderId: user.uid,
        senderUsername: userProfile.username,
        createdAt: new Date()
      });

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const toggleInviteExpansion = (inviteId) => {
    if (expandedInvite === inviteId) {
      setExpandedInvite(null);
    } else {
      setExpandedInvite(inviteId);
      if (!messages[inviteId]) {
        loadMessages(inviteId);
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#f39c12';
      case 'accepted': return '#27ae60';
      case 'declined': return '#e74c3c';
      case 'cancelled': return '#e74c3c';
      case 'in_progress': return '#3498db';
      case 'finished': return '#9b59b6';
      case 'payment_done': return '#16a085';
      case 'completed': return '#2ecc71';
      default: return '#95a5a6';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'Pending Response';
      case 'accepted': return 'Accepted';
      case 'declined': return 'Declined';
      case 'cancelled': return 'Cancelled';
      case 'in_progress': return 'In Progress';
      case 'finished': return 'Finished';
      case 'payment_done': return 'Payment Done';
      case 'completed': return 'Completed';
      default: return status;
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'No date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (!user) {
    return (
      <div className="invites-container">
        <h2>Please log in to view your invites</h2>
      </div>
    );
  }

  return (
    <div className="invites-container">
      <div className="invites-header">
        <h2>My Invites</h2>
        <div className="filter-controls">
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Invites</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="in_progress">In Progress</option>
            <option value="finished">Finished</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading invites...</div>
      ) : invites.length === 0 ? (
        <div className="no-invites">
          <p>No invites found.</p>
        </div>
      ) : (
        <div className="invites-list">
          {invites.map(invite => (
            <div key={invite.id} className={`invite-card ${invite.type}`}>
              <div className="invite-header" onClick={() => toggleInviteExpansion(invite.id)}>
                <div className="invite-info">
                  <h3>{invite.title}</h3>
                  <p className="invite-meta">
                    {invite.type === 'sent' ? `To: ${invite.toUsername}` : `From: ${invite.fromUsername}`} 
                    • {formatDate(invite.createdAt)}
                  </p>
                  <div className="invite-details">
                    <span>📍 {invite.meetingLocation}</span>
                    <span>💰 ${invite.price}</span>
                    <span>📅 {new Date(invite.startDate).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="invite-status">
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(invite.status) }}
                  >
                    {getStatusText(invite.status)}
                  </span>
                </div>
              </div>

              {expandedInvite === invite.id && (
                <div className="invite-expanded">
                  <div className="invite-description">
                    <h4>Description</h4>
                    <p>{invite.description}</p>
                  </div>

                  <div className="invite-timeline">
                    <h4>Activity Timeline</h4>
                    <p><strong>Start:</strong> {new Date(invite.startDate).toLocaleDateString()} at {invite.startTime}</p>
                    <p><strong>End:</strong> {new Date(invite.endDate).toLocaleDateString()} at {invite.endTime}</p>
                  </div>

                  {invite.cancellationFee > 0 && (
                    <div className="cancellation-info">
                      <h4>Cancellation Details</h4>
                      <p><strong>Cancellation Fee:</strong> ${invite.cancellationFee}</p>
                      <p><strong>Pal Compensation:</strong> ${invite.palCompensation}</p>
                    </div>
                  )}

                  {invite.totalPaidAmount && (
                    <div className="payment-info">
                      <h4>Payment Details</h4>
                      <p><strong>Base Amount:</strong> ${invite.price}</p>
                      {invite.pendingFeesIncluded > 0 && (
                        <>
                          <p><strong>Outstanding Fees Included:</strong> ${invite.pendingFeesIncluded}</p>
                          {invite.pendingInviteFeesIncluded > 0 && (
                            <p className="fee-breakdown"><strong>• Invite-related fees:</strong> ${invite.pendingInviteFeesIncluded}</p>
                          )}
                          {invite.pendingCancelledInviteFeesIncluded > 0 && (
                            <p className="fee-breakdown"><strong>• Cancellation-related fees:</strong> ${invite.pendingCancelledInviteFeesIncluded}</p>
                          )}
                        </>
                      )}
                      <p><strong>Total Paid:</strong> ${invite.totalPaidAmount}</p>
                    </div>
                  )}

                  <div className="invite-actions">
                    {invite.type === 'received' && invite.status === 'pending' && (
                      <>
                        <button 
                          onClick={() => handleAcceptInvite(invite.id)}
                          className="action-btn accept"
                        >
                          Accept
                        </button>
                        <button 
                          onClick={() => handleDeclineInvite(invite.id)}
                          className="action-btn decline"
                        >
                          Decline
                        </button>
                      </>
                    )}

                    {invite.status === 'accepted' && (
                      <>
                        <button 
                          onClick={() => handleStartActivity(invite.id)}
                          className="action-btn start"
                        >
                          Start Activity
                        </button>
                        {invite.type === 'sent' && (
                          <button 
                            onClick={() => handleCancelInvite(invite.id, invite)}
                            className="action-btn cancel"
                          >
                            Cancel Invite
                          </button>
                        )}
                      </>
                    )}

                    {invite.status === 'in_progress' && (
                      <button 
                        onClick={() => handleFinishActivity(invite.id)}
                        className="action-btn finish"
                      >
                        Finish Activity
                      </button>
                    )}

                    {invite.type === 'sent' && invite.status === 'finished' && (
                      <button 
                        onClick={() => handleMarkPaymentDone(invite.id, invite)}
                        className="action-btn payment"
                      >
                        Mark Payment Done
                      </button>
                    )}

                    {invite.type === 'received' && invite.status === 'payment_done' && (
                      <button 
                        onClick={() => handleConfirmPaymentReceived(invite.id, invite)}
                        className="action-btn confirm"
                      >
                        Confirm Payment Received
                      </button>
                    )}
                  </div>

                  <div className="messages-section">
                    <h4>Messages</h4>
                    <div className="messages-list">
                      {messages[invite.id]?.map(message => (
                        <div 
                          key={message.id} 
                          className={`message ${message.senderId === user.uid ? 'own' : 'other'}`}
                        >
                          <div className="message-content">
                            <span className="message-sender">{message.senderUsername}</span>
                            <span className="message-text">{message.text}</span>
                            <span className="message-time">
                              {formatDate(message.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="message-input">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            sendMessage(invite.id, newMessage);
                          }
                        }}
                      />
                      <button 
                        onClick={() => sendMessage(invite.id, newMessage)}
                        className="send-btn"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showInviteModal && (
        <InviteModal
          showModal={showInviteModal}
          onClose={() => {
            setShowInviteModal(false);
            setSelectedPal(null);
          }}
          selectedPal={selectedPal}
          user={user}
          userProfile={userProfile}
        />
      )}
    </div>
  );
};

export default Invites;
