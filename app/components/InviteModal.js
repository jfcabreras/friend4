
'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';

const InviteModal = ({ 
  showModal, 
  onClose, 
  selectedPal, 
  user, 
  userProfile 
}) => {
  const [inviteData, setInviteData] = useState({
    title: '',
    description: '',
    meetingLocation: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    price: ''
  });
  const [pendingPaymentsData, setPendingPaymentsData] = useState(null);
  const [loadingPendingPayments, setLoadingPendingPayments] = useState(false);

  useEffect(() => {
    if (showModal && selectedPal) {
      loadPendingPayments();
    }
  }, [showModal, selectedPal]);

  const loadPendingPayments = async () => {
    setLoadingPendingPayments(true);
    try {
      // Get sent invites to calculate what user owes
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

      // Get received invites to calculate platform fees owed (for public profiles)
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

      let totalOwed = 0;
      let incentivePaymentsOwed = 0;
      let cancellationFeesOwed = 0;
      let platformFeesOwed = 0;
      let pendingPayments = [];

      // Calculate platform fees owed (for public profiles only)
      if (userProfile.profileType === 'public') {
        // Completed invites where user was the pal
        const completedAsPal = receivedInvites.filter(invite =>
          invite.status === 'completed' && invite.paymentConfirmed === true
        );

        // Cancelled invites where user received compensation as pal
        const cancelledAsPal = receivedInvites.filter(invite =>
          invite.status === 'cancelled' &&
          invite.palCompensation && invite.palCompensation > 0
        );

        const allEarningInvites = [...completedAsPal, ...cancelledAsPal];

        allEarningInvites.forEach(invite => {
          const amount = invite.incentiveAmount || invite.palCompensation || invite.price || 0;
          const platformFee = invite.platformFee || (amount * 0.05);
          // Only add to owed if not already paid to platform
          if (!invite.platformFeePaid) {
            platformFeesOwed += platformFee;
          }
        });
      }

      // Calculate outstanding amounts for sent invites
      // 1. Total issued by completed invites (finished, payment_done, completed status)
      const completedInvites = sentInvites.filter(invite =>
        ['finished', 'payment_done', 'completed'].includes(invite.status)
      );
      const totalIssuedByCompletedInvites = completedInvites.reduce((total, invite) => {
        return total + (invite.price || 0);
      }, 0);

      // 2. Total paid by completed invites (only those confirmed by pal)
      const paidCompletedInvites = sentInvites.filter(invite =>
        invite.status === 'completed' && invite.paymentConfirmed === true
      );
      const totalPaidByCompletedInvites = paidCompletedInvites.reduce((total, invite) => {
        return total + (invite.price || 0);
      }, 0);

      // 3. Total issued by cancellation fees
      const cancelledInvitesWithFees = sentInvites.filter(invite =>
        invite.status === 'cancelled' &&
        invite.cancellationFee && invite.cancellationFee > 0
      );
      const totalIssuedByCancellationFees = cancelledInvitesWithFees.reduce((total, invite) => {
        return total + (invite.cancellationFee || 0);
      }, 0);

      // 4. Total paid by cancellation fees (marked as paid)
      const paidCancellationFees = cancelledInvitesWithFees.filter(invite =>
        invite.cancellationFeePaid === true
      );
      const totalPaidByCancellationFees = paidCancellationFees.reduce((total, invite) => {
        return total + (invite.cancellationFee || 0);
      }, 0);

      // Calculate outstanding amounts
      incentivePaymentsOwed = totalIssuedByCompletedInvites - totalPaidByCompletedInvites;
      cancellationFeesOwed = totalIssuedByCancellationFees - totalPaidByCancellationFees;

      // Total amount user owes (from sent invites + platform fees from received invites)
      totalOwed = incentivePaymentsOwed + cancellationFeesOwed + platformFeesOwed;

      // Build pending payments list
      // Add unpaid incentive payments (completed but not confirmed by pal)
      const unpaidCompletedInvites = sentInvites.filter(invite =>
        ['finished', 'payment_done'].includes(invite.status) &&
        invite.status !== 'completed'
      );
      unpaidCompletedInvites.forEach(invite => {
        pendingPayments.push({
          id: invite.id,
          type: 'incentive_payment',
          amount: invite.price || 0,
          description: `Incentive payment for "${invite.title}" to ${invite.toUsername}`,
          date: invite.finishedAt?.toDate?.() || invite.paymentDoneAt?.toDate?.() || new Date(),
          status: invite.status
        });
      });

      // Add unpaid cancellation fees
      const unpaidCancellationFees = cancelledInvitesWithFees.filter(invite =>
        !invite.cancellationFeePaid
      );
      unpaidCancellationFees.forEach(cancelledInvite => {
        pendingPayments.push({
          id: `cancel_fee_${cancelledInvite.id}`,
          type: 'cancellation_fee',
          amount: cancelledInvite.cancellationFee,
          description: `Unpaid cancellation fee for "${cancelledInvite.title}" to ${cancelledInvite.toUsername}`,
          date: cancelledInvite.cancelledAt?.toDate?.() || new Date(),
          inviteId: cancelledInvite.id
        });
      });

      // Add platform fees as individual pending items if user has public profile
      if (userProfile.profileType === 'public' && platformFeesOwed > 0) {
        // Get completed and cancelled invites where user was pal with unpaid platform fees
        const completedAsPal = receivedInvites.filter(invite =>
          invite.status === 'completed' && invite.paymentConfirmed === true && !invite.platformFeePaid
        );
        const cancelledAsPal = receivedInvites.filter(invite =>
          invite.status === 'cancelled' && invite.palCompensation && invite.palCompensation > 0 && !invite.platformFeePaid
        );

        [...completedAsPal, ...cancelledAsPal].forEach(invite => {
          const amount = invite.incentiveAmount || invite.palCompensation || invite.price || 0;
          const platformFee = invite.platformFee || (amount * 0.05);
          pendingPayments.push({
            id: `platform_fee_${invite.id}`,
            type: 'platform_fee',
            amount: platformFee,
            description: `Platform fee (5%) for "${invite.title}" from ${invite.fromUsername}`,
            date: invite.status === 'completed' ? (invite.completedAt?.toDate?.() || new Date()) : (invite.cancelledAt?.toDate?.() || new Date()),
            inviteId: invite.id
          });
        });
      }

      setPendingPaymentsData({
        totalOwed,
        incentivePaymentsOwed,
        cancellationFeesOwed,
        platformFeesOwed,
        pendingPayments
      });

    } catch (error) {
      console.error('Error calculating pending payments:', error);
      setPendingPaymentsData({
        totalOwed: userProfile.pendingBalance || 0,
        incentivePaymentsOwed: 0,
        cancellationFeesOwed: 0,
        platformFeesOwed: 0,
        pendingPayments: []
      });
    } finally {
      setLoadingPendingPayments(false);
    }
  };

  const sendInvite = async () => {
    if (!inviteData.title || !inviteData.description || !inviteData.meetingLocation || 
        !inviteData.startDate || !inviteData.startTime || !inviteData.endDate || 
        !inviteData.endTime || !inviteData.price) {
      alert('Please fill in all fields');
      return;
    }

    // Validate that end date/time is after start date/time
    const startDateTime = new Date(`${inviteData.startDate}T${inviteData.startTime}`);
    const endDateTime = new Date(`${inviteData.endDate}T${inviteData.endTime}`);

    if (endDateTime <= startDateTime) {
      alert('End date and time must be after start date and time');
      return;
    }

    const incentiveAmount = parseFloat(inviteData.price);
    const totalOwed = pendingPaymentsData?.totalOwed || 0;

    // Warn user about pending fees if any exist
    if (totalOwed > 0) {
      let confirmMessage = `⚠️ OUTSTANDING FEES NOTICE\n\n`;
      confirmMessage += `This Invite Amount: $${incentiveAmount.toFixed(2)}\n`;
      confirmMessage += `Outstanding Fees: $${totalOwed.toFixed(2)}\n\n`;

      confirmMessage += `BREAKDOWN OF OUTSTANDING FEES:\n`;
      if (pendingPaymentsData.incentivePaymentsOwed > 0) {
        confirmMessage += `• Unpaid Incentive Payments: $${pendingPaymentsData.incentivePaymentsOwed.toFixed(2)}\n`;
      }
      if (pendingPaymentsData.cancellationFeesOwed > 0) {
        confirmMessage += `• Unpaid Cancellation Fees: $${pendingPaymentsData.cancellationFeesOwed.toFixed(2)}\n`;
      }
      if (pendingPaymentsData.platformFeesOwed > 0) {
        confirmMessage += `• Platform Fees Owed: $${pendingPaymentsData.platformFeesOwed.toFixed(2)}\n`;
      }

      if (pendingPaymentsData.pendingPayments.length > 0) {
        confirmMessage += `\nDETAILED PENDING PAYMENTS:\n`;
        pendingPaymentsData.pendingPayments.sort((a, b) => b.date - a.date).slice(0, 3).forEach(payment => {
          confirmMessage += `• ${payment.description}: $${payment.amount.toFixed(2)}\n`;
        });
        if (pendingPaymentsData.pendingPayments.length > 3) {
          confirmMessage += `... and ${pendingPaymentsData.pendingPayments.length - 3} more items\n`;
        }
      }

      confirmMessage += `\n💡 Important: When you make the payment for this invite, your outstanding fees of $${totalOwed.toFixed(2)} will be automatically added to the payment.\n`;
      confirmMessage += `Total you'll pay: $${incentiveAmount.toFixed(2)} (invite) + $${totalOwed.toFixed(2)} (fees) = $${(incentiveAmount + totalOwed).toFixed(2)}\n\n`;
      confirmMessage += `Do you want to continue creating this invite?`;

      const confirmed = window.confirm(confirmMessage);

      if (!confirmed) {
        return;
      }
    }

    try {
      await addDoc(collection(db, 'planInvitations'), {
        fromUserId: user.uid,
        fromUsername: userProfile.username,
        toUserId: selectedPal.id,
        toUsername: selectedPal.username,
        title: inviteData.title,
        description: inviteData.description,
        meetingLocation: inviteData.meetingLocation,
        startDate: new Date(inviteData.startDate),
        startTime: inviteData.startTime,
        endDate: new Date(inviteData.endDate),
        endTime: inviteData.endTime,
        price: parseFloat(inviteData.price),
        incentiveAmount: parseFloat(inviteData.price),
        status: 'pending',
        createdAt: new Date()
      });

      alert('Invite sent successfully!');
      onClose();
      setInviteData({
        title: '',
        description: '',
        meetingLocation: '',
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
        price: ''
      });
    } catch (error) {
      console.error('Error sending invite:', error);
      alert('Failed to send invite');
    }
  };

  const handleClose = () => {
    onClose();
    setInviteData({
      title: '',
      description: '',
      meetingLocation: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      price: ''
    });
  };

  if (!showModal) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>×</button>
        <div className="invite-form-header">
          <h3>Invite {selectedPal?.username}</h3>
          <p className="invite-form-subtitle">Create a hangout plan and set your incentive</p>
        </div>

        {/* Pending Payments Warning */}
        {loadingPendingPayments ? (
          <div className="pending-payments-warning loading">
            <div className="warning-icon">⏳</div>
            <div className="warning-content">
              <p>Checking for outstanding fees...</p>
            </div>
          </div>
        ) : pendingPaymentsData && pendingPaymentsData.totalOwed > 0 ? (
          <div className="pending-payments-warning">
            <div className="warning-icon">⚠️</div>
            <div className="warning-content">
              <h4>Outstanding Fees Notice</h4>
              <p>You have <strong>${pendingPaymentsData.totalOwed.toFixed(2)}</strong> in outstanding fees that will be automatically added to this payment.</p>

              <div className="pending-breakdown">
                {pendingPaymentsData.incentivePaymentsOwed > 0 && (
                  <div className="breakdown-item">
                    <span>Unpaid Incentive Payments:</span>
                    <span>${pendingPaymentsData.incentivePaymentsOwed.toFixed(2)}</span>
                  </div>
                )}
                {pendingPaymentsData.cancellationFeesOwed > 0 && (
                  <div className="breakdown-item">
                    <span>Unpaid Cancellation Fees:</span>
                    <span>${pendingPaymentsData.cancellationFeesOwed.toFixed(2)}</span>
                  </div>
                )}
                {pendingPaymentsData.platformFeesOwed > 0 && (
                  <div className="breakdown-item">
                    <span>Platform Fees Owed:</span>
                    <span>${pendingPaymentsData.platformFeesOwed.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {pendingPaymentsData.pendingPayments.length > 0 && (
                <details className="pending-details">
                  <summary>View detailed breakdown ({pendingPaymentsData.pendingPayments.length} items)</summary>
                  <div className="pending-payments-list">
                    {pendingPaymentsData.pendingPayments.slice(0, 5).map(payment => (
                      <div key={`${payment.type}-${payment.id}`} className={`pending-payment-item ${payment.type}`}>
                        <div className="payment-info">
                          <span className="payment-desc">{payment.description}</span>
                          <span className="payment-date">{payment.date.toLocaleDateString()}</span>
                        </div>
                        <span className="payment-amount">${payment.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    {pendingPaymentsData.pendingPayments.length > 5 && (
                      <p className="more-items">... and {pendingPaymentsData.pendingPayments.length - 5} more items</p>
                    )}
                  </div>
                </details>
              )}

              <p className="warning-note">
                💡 Note: When you pay for this invite, your outstanding fees of <strong>${pendingPaymentsData.totalOwed.toFixed(2)}</strong> will be automatically added to the payment.
              </p>
            </div>
          </div>
        ) : pendingPaymentsData && pendingPaymentsData.totalOwed === 0 ? (
          <div className="pending-payments-warning success">
            <div className="warning-icon">✅</div>
            <div className="warning-content">
              <p>Great! You have no outstanding fees. Your payment will only include the invite amount.</p>
            </div>
          </div>
        ) : null}

        <div className="invite-form">
          <div className="form-row">
            <div className="form-group full-width">
              <label>Event Title *</label>
              <input
                type="text"
                placeholder="e.g., Coffee & Chat, Movie Night, Gym Session"
                value={inviteData.title}
                onChange={(e) => setInviteData(prev => ({ ...prev, title: e.target.value }))}
                className="form-input"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group full-width">
              <label>Description *</label>
              <textarea
                placeholder="Describe what you'd like to do together..."
                value={inviteData.description}
                onChange={(e) => setInviteData(prev => ({ ...prev, description: e.target.value }))}
                className="form-textarea"
                rows="3"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group full-width">
              <label>Meeting Location *</label>
              <input
                type="text"
                placeholder="e.g., Central Park, Starbucks on 5th Ave"
                value={inviteData.meetingLocation}
                onChange={(e) => setInviteData(prev => ({ ...prev, meetingLocation: e.target.value }))}
                className="form-input"
                required
              />
            </div>
          </div>

          <div className="datetime-section">
            <h4>📅 Event Schedule</h4>

            <div className="form-row">
              <div className="form-group half-width">
                <label>Start Date *</label>
                <input
                  type="date"
                  value={inviteData.startDate}
                  onChange={(e) => setInviteData(prev => ({ ...prev, startDate: e.target.value }))}
                  className="form-input"
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              <div className="form-group half-width">
                <label>Start Time *</label>
                <input
                  type="time"
                  value={inviteData.startTime}
                  onChange={(e) => setInviteData(prev => ({ ...prev, startTime: e.target.value }))}
                  className="form-input"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group half-width">
                <label>End Date *</label>
                <input
                  type="date"
                  value={inviteData.endDate}
                  onChange={(e) => setInviteData(prev => ({ ...prev, endDate: e.target.value }))}
                  className="form-input"
                  min={inviteData.startDate || new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              <div className="form-group half-width">
                <label>End Time *</label>
                <input
                  type="time"
                  value={inviteData.endTime}
                  onChange={(e) => setInviteData(prev => ({ ...prev, endTime: e.target.value }))}
                  className="form-input"
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group full-width">
              <label>💰 Your Incentive ($) *</label>
              <input
                type="number"
                placeholder="How much are you offering?"
                value={inviteData.price}
                onChange={(e) => setInviteData(prev => ({ ...prev, price: e.target.value }))}
                className="form-input"
                min="0"
                step="0.01"
                required
              />
              <small className="form-hint">This is what you're willing to pay for their time</small>
            </div>
          </div>

          <button onClick={sendInvite} className="send-invite-btn">
            🚀 Send Invite
          </button>
        </div>
      </div>
    </div>
  );
};

export default InviteModal;
