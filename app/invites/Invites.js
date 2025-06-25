'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, orderBy, addDoc, onSnapshot, getDoc } from 'firebase/firestore';

// Component to show outstanding fees notice for finished invites
const OutstandingFeesNotice = ({ invite, user, userProfile }) => {
  const [senderFeesBreakdown, setSenderFeesBreakdown] = useState(null);
  const [ownFeesBreakdown, setOwnFeesBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (invite.type === 'received' && (invite.status === 'in_progress' || invite.status === 'finished')) {
      calculateSenderOutstandingFees();
    }
    if (invite.type === 'sent' && (invite.status === 'in_progress' || invite.status === 'finished')) {
      calculateOwnOutstandingFees();
    }
  }, [invite, user, userProfile]);

  const calculateOwnOutstandingFees = async () => {
    if (!user?.uid) return;

    setLoading(true);
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

      // Calculate platform fees owed (for public profiles only)
      let platformFeesOwed = 0;
      if (userProfile?.profileType === 'public') {
        const completedAsPal = receivedInvites.filter(inv => 
          inv.status === 'completed' && inv.paymentConfirmed === true
        );

        const cancelledAsPal = receivedInvites.filter(inv => 
          inv.status === 'cancelled' && 
          inv.palCompensation && inv.palCompensation > 0
        );

        const allEarningInvites = [...completedAsPal, ...cancelledAsPal];

        allEarningInvites.forEach(inv => {
          const amount = inv.incentiveAmount || inv.palCompensation || inv.price || 0;
          const platformFee = inv.platformFee || (amount * 0.05);
          if (!inv.platformFeePaid) {
            platformFeesOwed += platformFee;
          }
        });
      }

      // Calculate outstanding amounts for sent invites (excluding current invite)
      const completedInvites = sentInvites.filter(inv => 
        ['finished', 'payment_done', 'completed'].includes(inv.status) && inv.id !== invite.id
      );
      const totalIssuedByCompletedInvites = completedInvites.reduce((total, sentInvite) => {
        return total + (sentInvite.price || 0);
      }, 0);

      const paidCompletedInvites = sentInvites.filter(inv => 
        inv.status === 'completed' && inv.paymentConfirmed === true
      );
      const totalPaidByCompletedInvites = paidCompletedInvites.reduce((total, inv) => {
        return total + (inv.price || 0);
      }, 0);

      const cancelledInvitesWithFees = sentInvites.filter(inv => 
        inv.status === 'cancelled' && 
        inv.cancellationFee && inv.cancellationFee > 0
      );
      const totalIssuedByCancellationFees = cancelledInvitesWithFees.reduce((total, inv) => {
        return total + (inv.cancellationFee || 0);
      }, 0);

      const paidCancellationFees = cancelledInvitesWithFees.filter(inv => 
        inv.cancellationFeePaid === true
      );
      const totalPaidByCancellationFees = paidCancellationFees.reduce((total, inv) => {
        return total + (inv.cancellationFee || 0);
      }, 0);

      const incentivePaymentsOwed = totalIssuedByCompletedInvites - totalPaidByCompletedInvites;
      const cancellationFeesOwed = totalIssuedByCancellationFees - totalPaidByCancellationFees;
      const totalOwed = incentivePaymentsOwed + cancellationFeesOwed + platformFeesOwed;

      setOwnFeesBreakdown({
        totalAmount: totalOwed,
        incentivePaymentsOwed,
        cancellationFeesOwed,
        platformFeesOwed
      });

    } catch (error) {
      console.error('Error calculating own outstanding fees:', error);
      setOwnFeesBreakdown(null);
    } finally {
      setLoading(false);
    }
  };

  const calculateSenderOutstandingFees = async () => {
    if (!invite.fromUserId) return;

    setLoading(true);
    try {
      // Get sender's sent invites
      const sentInvitesQuery = query(
        collection(db, 'planInvitations'),
        where('fromUserId', '==', invite.fromUserId)
      );
      const sentInvitesSnapshot = await getDocs(sentInvitesQuery);
      const sentInvites = sentInvitesSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'sent',
        ...doc.data()
      }));

      // Get sender's received invites (for platform fees calculation)
      const receivedInvitesQuery = query(
        collection(db, 'planInvitations'),
        where('toUserId', '==', invite.fromUserId)
      );
      const receivedInvitesSnapshot = await getDocs(receivedInvitesQuery);
      const receivedInvites = receivedInvitesSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'received',
        ...doc.data()
      }));

      // Get sender's user profile to check if they're public (for platform fees)
      const senderRef = doc(db, 'users', invite.fromUserId);
      const senderDoc = await getDoc(senderRef);
      const senderProfile = senderDoc.data();

      // Calculate platform fees owed (for public profiles only)
      let platformFeesOwed = 0;
      if (senderProfile?.profileType === 'public') {
        const completedAsPal = receivedInvites.filter(inv => 
          inv.status === 'completed' && inv.paymentConfirmed === true
        );

        const cancelledAsPal = receivedInvites.filter(inv => 
          inv.status === 'cancelled' && 
          inv.palCompensation && inv.palCompensation > 0
        );

        const allEarningInvites = [...completedAsPal, ...cancelledAsPal];

        allEarningInvites.forEach(inv => {
          const amount = inv.incentiveAmount || inv.palCompensation || inv.price || 0;
          const platformFee = inv.platformFee || (amount * 0.05);
          if (!inv.platformFeePaid) {
            platformFeesOwed += platformFee;
          }
        });
      }

      // Calculate outstanding amounts for sent invites (excluding current invite if applicable)
      const completedInvites = sentInvites.filter(inv => 
        ['finished', 'payment_done', 'completed'].includes(inv.status) && inv.id !== invite.id
      );
      const totalIssuedByCompletedInvites = completedInvites.reduce((total, sentInvite) => {
        return total + (sentInvite.price || 0);
      }, 0);

      const paidCompletedInvites = sentInvites.filter(inv => 
        inv.status === 'completed' && inv.paymentConfirmed === true
      );
      const totalPaidByCompletedInvites = paidCompletedInvites.reduce((total, inv) => {
        return total + (inv.price || 0);
      }, 0);

      const cancelledInvitesWithFees = sentInvites.filter(inv => 
        inv.status === 'cancelled' && 
        inv.cancellationFee && inv.cancellationFee > 0
      );
      const totalIssuedByCancellationFees = cancelledInvitesWithFees.reduce((total, inv) => {
        return total + (inv.cancellationFee || 0);
      }, 0);

      const paidCancellationFees = cancelledInvitesWithFees.filter(inv => 
        inv.cancellationFeePaid === true
      );
      const totalPaidByCancellationFees = paidCancellationFees.reduce((total, inv) => {
        return total + (inv.cancellationFee || 0);
      }, 0);

      const incentivePaymentsOwed = totalIssuedByCompletedInvites - totalPaidByCompletedInvites;
      const cancellationFeesOwed = totalIssuedByCancellationFees - totalPaidByCancellationFees;
      const totalOwed = incentivePaymentsOwed + cancellationFeesOwed + platformFeesOwed;

      console.log('Calculated sender fees for invite recipient:', {
        senderUserId: invite.fromUserId,
        senderUsername: invite.fromUsername,
        totalOwed,
        incentivePaymentsOwed,
        cancellationFeesOwed,
        platformFeesOwed
      });

      setSenderFeesBreakdown({
        totalAmount: totalOwed,
        incentivePaymentsOwed,
        cancellationFeesOwed,
        platformFeesOwed
      });

    } catch (error) {
      console.error('Error calculating sender outstanding fees:', error);
      setSenderFeesBreakdown(null);
    } finally {
      setLoading(false);
    }
  };

  if (invite.type === 'sent') {
    // For senders - use the calculated ownFeesBreakdown
    if (loading) {
      return (
        <div className="outstanding-fees-notice">
          <div className="fees-notice sender">
            <span className="fees-icon">⏳</span>
            <span className="fees-text">Checking outstanding fees...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="outstanding-fees-notice">
        {ownFeesBreakdown && ownFeesBreakdown.totalAmount > 0 ? (
          <div className="fees-warning sender">
            <span className="fees-icon">⚠️</span>
            <div className="fees-text">
              <strong>Payment will include outstanding fees:</strong>
              <br />
              Invite: ${invite.price?.toFixed(2)} + Outstanding: ${ownFeesBreakdown.totalAmount.toFixed(2)} = Total: ${(invite.price + ownFeesBreakdown.totalAmount).toFixed(2)}
              <br />
              <small className="breakdown-detail">
                {ownFeesBreakdown.incentivePaymentsOwed > 0 && `• Unpaid incentives: $${ownFeesBreakdown.incentivePaymentsOwed.toFixed(2)} `}
                {ownFeesBreakdown.cancellationFeesOwed > 0 && `• Cancellation fees: $${ownFeesBreakdown.cancellationFeesOwed.toFixed(2)} `}
                {ownFeesBreakdown.platformFeesOwed > 0 && `• Platform fees: $${ownFeesBreakdown.platformFeesOwed.toFixed(2)}`}
              </small>
            </div>
          </div>
        ) : ownFeesBreakdown && ownFeesBreakdown.totalAmount === 0 ? (
          <div className="fees-notice sender success">
            <span className="fees-icon">✅</span>
            <span className="fees-text">No outstanding fees - payment will be ${invite.price?.toFixed(2)}</span>
          </div>
        ) : !ownFeesBreakdown ? (
          <div className="fees-notice sender neutral">
            <span className="fees-icon">💰</span>
            <span className="fees-text">
              Payment will be ${invite.price?.toFixed(2)}
              <br />
              <small>Checking for outstanding fees...</small>
            </span>
          </div>
        ) : null}
      </div>
    );
  } else {
    // For receivers - show calculated sender fees
    if (loading) {
      return (
        <div className="outstanding-fees-notice">
          <div className="fees-notice receiver">
            <span className="fees-icon">⏳</span>
            <span className="fees-text">Checking {invite.fromUsername}'s outstanding fees...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="outstanding-fees-notice">
        {senderFeesBreakdown && senderFeesBreakdown.totalAmount > 0 ? (
          <div className="fees-warning receiver">
            <span className="fees-icon">💰</span>
            <div className="fees-text">
              <strong>⚠️ {invite.fromUsername} has outstanding platform fees!</strong>
              <br />
              Your Incentive: ${invite.price?.toFixed(2)} + {invite.fromUsername}'s Outstanding: ${senderFeesBreakdown.totalAmount.toFixed(2)} = <strong>Total Payment: ${(invite.price + senderFeesBreakdown.totalAmount).toFixed(2)}</strong>
              <br />
              <small>💡 You'll receive the full cash amount (${(invite.price + senderFeesBreakdown.totalAmount).toFixed(2)}), but ${senderFeesBreakdown.totalAmount.toFixed(2)} will clear {invite.fromUsername}'s platform debts</small>
              <br />
              <small className="breakdown-detail">
                {senderFeesBreakdown.incentivePaymentsOwed > 0 && `• Unpaid incentives: $${senderFeesBreakdown.incentivePaymentsOwed.toFixed(2)} `}
                {senderFeesBreakdown.cancellationFeesOwed > 0 && `• Cancellation fees: $${senderFeesBreakdown.cancellationFeesOwed.toFixed(2)} `}
                {senderFeesBreakdown.platformFeesOwed > 0 && `• Platform fees: $${senderFeesBreakdown.platformFeesOwed.toFixed(2)}`}
              </small>
            </div>
          </div>
        ) : senderFeesBreakdown && senderFeesBreakdown.totalAmount === 0 ? (
          <div className="fees-notice receiver success">
            <span className="fees-icon">✅</span>
            <span className="fees-text">
              <strong>Great!</strong> {invite.fromUsername} has no outstanding fees - you'll receive exactly ${invite.price?.toFixed(2)}
            </span>
          </div>
        ) : !senderFeesBreakdown ? (
          <div className="fees-notice receiver neutral">
            <span className="fees-icon">💰</span>
            <span className="fees-text">
              You will receive ${invite.price?.toFixed(2)} for this invite
              <br />
              <small>Checking if payment includes sender's outstanding platform fees...</small>
            </span>
          </div>
        ) : null}
      </div>
    );
  }
};

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
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);
  const [paymentToConfirm, setPaymentToConfirm] = useState(null);

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
      const platformFee = originalPrice * 0.05; // 5% platform fee of original price
      palCompensation = cancellationFee - platformFee; // Pal gets the difference
      confirmMessage = `Are you sure you want to cancel this accepted invite?\n\n⚠️ CANCELLATION FEE: $${cancellationFee.toFixed(2)} (50% of the original incentive $${originalPrice.toFixed(2)})\n\n💰 PAL COMPENSATION: $${palCompensation.toFixed(2)} (cancellation fee minus platform fee)\n🏛️ PLATFORM FEE: $${platformFee.toFixed(2)} (5% of original price)\n\nThis fee will be added to your pending balance.\n\nThis action cannot be undone.`;
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
          const palPlatformFee = originalPrice * 0.05; // 5% platform fee on original price

          await updateDoc(palRef, {
            totalEarnings: currentPalEarnings + palCompensation, // Pal gets full compensation (already net of platform fee)
            pendingBalance: currentPalPendingBalance + palPlatformFee
          });

          // Create platform fee record for cancellation compensation
          await addDoc(collection(db, 'platformFees'), {
            userId: invite.toUserId,
            username: invite.toUsername,
            inviteId: inviteId,
            inviteTitle: invite.title,
            feeType: 'cancellation_compensation',
            amount: palPlatformFee,
            status: 'issued',
            issuedAt: new Date(),
            paidAt: null,
            receivedByPlatform: false,
            description: `5% platform fee for cancellation compensation on "${invite.title}"`
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

  const finishInvite = async (inviteId) => {
    setFinishInviteId(inviteId);

    // Calculate pending fees to show in finish modal
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

      // Calculate platform fees owed (for public profiles only)
      let platformFeesOwed = 0;
      if (userProfile.profileType === 'public') {
        const completedAsPal = receivedInvites.filter(invite => 
          invite.status === 'completed' && invite.paymentConfirmed === true
        );

        const cancelledAsPal = receivedInvites.filter(invite => 
          invite.status === 'cancelled' && 
          invite.palCompensation && invite.palCompensation > 0
        );

        const allEarningInvites = [...completedAsPal, ...cancelledAsPal];

        allEarningInvites.forEach(invite => {
          const amount = invite.incentiveAmount || invite.palCompensation || invite.price || 0;
          const platformFee = invite.platformFee || (amount * 0.05);
          if (!invite.platformFeePaid) {
            platformFeesOwed += platformFee;
          }
        });
      }

      // Calculate outstanding amounts for sent invites (excluding current invite)
      const completedInvites = sentInvites.filter(inv => 
        ['finished', 'payment_done', 'completed'].includes(inv.status) && inv.id !== finishInviteId
      );
      const totalIssuedByCompletedInvites = completedInvites.reduce((total, sentInvite) => {
        return total + (sentInvite.price || 0);
      }, 0);

      const paidCompletedInvites = sentInvites.filter(inv => 
        inv.status === 'completed' && invite.paymentConfirmed === true
      );
      const totalPaidByCompletedInvites = paidCompletedInvites.reduce((total, invite) => {
        return total + (invite.price || 0);
      }, 0);

      const cancelledInvitesWithFees = sentInvites.filter(inv => 
        inv.status === 'cancelled' && 
        inv.cancellationFee && inv.cancellationFee > 0
      );
      const totalIssuedByCancellationFees = cancelledInvitesWithFees.reduce((total, invite) => {
        return total + (invite.cancellationFee || 0);
      }, 0);

      const paidCancellationFees = cancelledInvitesWithFees.filter(inv => 
        inv.cancellationFeePaid === true
      );
      const totalPaidByCancellationFees = paidCancellationFees.reduce((total, invite) => {
        return total + (invite.cancellationFee || 0);
      }, 0);

      const incentivePaymentsOwed = totalIssuedByCompletedInvites - totalPaidByCompletedInvites;
      const cancellationFeesOwed = totalIssuedByCancellationFees - totalPaidByCancellationFees;
      const totalOwed = incentivePaymentsOwed + cancellationFeesOwed + platformFeesOwed;

      setPendingFeesBreakdown({
        totalAmount: totalOwed,
        incentivePaymentsOwed,
        cancellationFeesOwed,
        platformFeesOwed
      });
    } catch (error) {
      console.error('Error calculating pending fees for finish modal:', error);
      setPendingFeesBreakdown(null);
    }

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

    // Replicate the exact pending balance calculation from Profile.js
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

      // Calculate platform fees owed (for public profiles only)
      let platformFeesOwed = 0;
      if (userProfile.profileType === 'public') {
        // Completed invites where user was the pal
        const completedAsPal = receivedInvites.filter(invite => 
          invite.status === 'completed' && invite.paymentConfirmed === true
        );

        // Cancelled invites where user received compensation as pal
        const cancelledAsPal = receivedInvites.filter(invite =>           inv.status === 'cancelled' && 
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

      // Calculate outstanding amounts for sent invites (excluding current invite if applicable)
      // 1. Total issued by completed invites (finished, payment_done, completed status)
      const completedInvites = sentInvites.filter(invite => 
        ['finished', 'payment_done', 'completed'].includes(invite.status) && invite.id !== inviteId
      );
      const totalIssuedByCompletedInvites = completedInvites.reduce((total, sentInvite) => {
        return total + (sentInvite.price || 0);
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
      const incentivePaymentsOwed = totalIssuedByCompletedInvites - totalPaidByCompletedInvites;
      const cancellationFeesOwed = totalIssuedByCancellationFees - totalPaidByCancellationFees;

      // Total amount user owes (from sent invites + platform fees from received invites)
      const totalOwed = incentivePaymentsOwed + cancellationFeesOwed + platformFeesOwed;

      // Build pending payments list just like in Profile.js
      const pendingPayments = [];

      // Add unpaid incentive payments (completed but not confirmed by pal) - EXCLUDING current invite
      const unpaidCompletedInvites = sentInvites.filter(inv => 
        ['finished', 'payment_done'].includes(inv.status) && 
        inv.status !== 'completed' && 
        inv.id !== inviteId
      );
      unpaidCompletedInvites.forEach(inv => {
        pendingPayments.push({
          id: inv.id,
          type: 'incentive_payment',
          amount: inv.price || 0,
          description: `Incentive payment for "${inv.title}" to ${inv.toUsername}`,
          date: inv.finishedAt?.toDate?.() || inv.paymentDoneAt?.toDate?.() || new Date(),
          status: inv.status
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

      console.log('Calculated pending balance:', totalOwed);
      console.log('Incentive payments owed:', incentivePaymentsOwed);
      console.log('Cancellation fees owed:', cancellationFeesOwed);
      console.log('Platform fees owed:', platformFeesOwed);
      console.log('Pending payments:', pendingPayments);

      let breakdown = null;
      if (totalOwed > 0) {
        breakdown = {
          note: "Outstanding fees breakdown",
          totalAmount: totalOwed,
          incentivePaymentsOwed,
          cancellationFeesOwed,
          platformFeesOwed,
          pendingPayments: pendingPayments.sort((a, b) => b.date - a.date)
        };
        setPendingFeesBreakdown(breakdown);
      } else {
        setPendingFeesBreakdown(null);
      }

      // Calculate the total payment amount: current invite + outstanding fees
      const currentInviteAmount = invite.price || 0;
      const totalPaymentAmount = currentInviteAmount + totalOwed;

      console.log('Current invite price:', currentInviteAmount);
      console.log('Total outstanding balance calculated:', totalOwed);
      console.log('Total payment amount:', totalPaymentAmount);

      setSelectedInvite({...invite, pendingFeesBreakdown: breakdown});
      setPaymentAmount(totalPaymentAmount);
      setShowPaymentModal(true);

    } catch (error) {
      console.error('Error calculating pending balance:', error);
      // Fallback to simple calculation
      const incentiveAmount = invite.price || 0;
      setPaymentAmount(incentiveAmount);
      setShowPaymentModal(true);
    }
  };

  const confirmPaymentDone = async () => {
    if (!selectedInvite) return;

    try {
      // Get current pending balance
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      const pendingBalance = userDoc.data()?.pendingBalance || 0;

      const incentiveAmount = selectedInvite.incentiveAmount || selectedInvite.price;
      // Use the calculated total owed amount instead of user's stored pending balance
      const pendingFeesIncluded = paymentAmount - incentiveAmount;
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

      // Clear pending fees from user profile and mark related fees as paid
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

        // Mark specific fees as paid based on the pending payments breakdown
        if (pendingFeesBreakdown && pendingFeesBreakdown.pendingPayments) {
          let remainingPaymentAmount = pendingFeesIncluded;

          // Process fees in chronological order (oldest first)
          const sortedPendingPayments = pendingFeesBreakdown.pendingPayments.sort((a, b) => a.date - b.date);

          for (const payment of sortedPendingPayments) {
            if (remainingPaymentAmount <= 0) break;

            const paymentAmount = Math.min(payment.amount, remainingPaymentAmount);

            if (payment.type === 'cancellation_fee') {
              // Mark cancellation fee as paid
              await updateDoc(doc(db, 'planInvitations', payment.inviteId), {
                cancellationFeePaid: true,
                cancellationFeePaidAt: new Date(),
                cancellationFeePaidInInvite: selectedInvite.id,
                cancellationFeeRecipient: selectedInvite.toUserId,
                cancellationFeeRecipientUsername: selectedInvite.toUsername,
                cancellationFeePaymentReceived: false, // Will be confirmed by recipient
                cancellationFeeAmountPaid: paymentAmount
              });
            } else if (payment.type === 'incentive_payment') {
              // Mark incentive payment as paid
              await updateDoc(doc(db, 'planInvitations', payment.id), {
                incentivePaymentPaid: true,
                incentivePaymentPaidAt: new Date(),
                incentivePaymentPaidInInvite: selectedInvite.id,
                incentivePaymentRecipient: payment.id === selectedInvite.id ? selectedInvite.toUserId : null,
                incentivePaymentPaymentReceived: false, // Will be confirmed by recipient
                incentivePaymentAmountPaid: paymentAmount
              });
            } else if (payment.type === 'platform_fee') {
              // Mark platform fee as paid in the invite
              await updateDoc(doc(db, 'planInvitations', payment.inviteId), {
                platformFeePaid: true,
                platformFeePaidAt: new Date(),
                platformFeePaidInInvite: selectedInvite.id,
                platformFeeRecipient: 'platform',
                platformFeePaymentReceived: true, // Platform fees are automatically confirmed
                platformFeeAmountPaid: paymentAmount
              });

              // Update platform fee record as paid and received
              const platformFeesQuery = query(
                collection(db, 'platformFees'),
                where('inviteId', '==', payment.inviteId),
                where('userId', '==', user.uid),
                where('status', '==', 'issued')
              );
              const platformFeesSnapshot = await getDocs(platformFeesQuery);

              if (!platformFeesSnapshot.empty) {
                const platformFeeDoc = platformFeesSnapshot.docs[0];
                await updateDoc(doc(db, 'platformFees', platformFeeDoc.id), {
                  status: 'paid_and_received',
                  paidAt: new Date(),
                  receivedByPlatform: true,
                  paymentMethod: 'cash_through_invite',
                  paidInInviteId: selectedInvite.id
                });
              }
            }

            remainingPaymentAmount -= paymentAmount;
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
    const invite = [...invites.payment_done].find(inv => inv.id === inviteId);
    if (!invite) return;

    // Check if this payment included pending fees and show warning
    if (invite.pendingFeesIncluded && invite.pendingFeesIncluded > 0) {
      // Calculate the base incentive amount (what the pal should actually receive)
      const baseIncentiveAmount = invite.incentiveAmount || selectedInvite.price;
      invite.calculatedBaseAmount = baseIncentiveAmount;
      invite.calculatedTotalReceived = invite.totalPaidAmount || (baseIncentiveAmount + invite.pendingFeesIncluded);
      setPaymentToConfirm(invite);
      setShowPaymentConfirmModal(true);
    } else {
      // Proceed directly if no pending fees were included
      await processPaymentConfirmation(inviteId);
    }
  };

  const processPaymentConfirmation = async (inviteId) => {
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

      // Add platform fee to pal's pending balance and create platform fee record
      const palRef = doc(db, 'users', invite.toUserId);
      const palDoc = await getDoc(palRef);
      const currentPendingBalance = palDoc.data()?.pendingBalance || 0;

      await updateDoc(palRef, {
        pendingBalance: currentPendingBalance + platformFee,
        totalEarnings: (palDoc.data()?.totalEarnings || 0) + (invite.netAmountToPal || (invite.incentiveAmount || invite.price) - platformFee)
      });

      // Create platform fee record for admin tracking
      await addDoc(collection(db, 'platformFees'), {
        userId: invite.toUserId,
        username: invite.toUsername,
        inviteId: inviteId,
        inviteTitle: invite.title,
        feeType: 'incentive_completion',
        amount: platformFee,
        status: 'issued',
        issuedAt: new Date(),
        paidAt: null,
        receivedByPlatform: false,
        description: `5% platform fee for completed invite "${invite.title}"`
      });

      // Mark any fee payments that were paid through this invite as received
      const allInvitesQuery = query(collection(db, 'planInvitations'));
      const allInvitesSnapshot = await getDocs(allInvitesQuery);
      const allInvites = allInvitesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Find invites where fees were paid through this invite and mark as received
      for (const otherInvite of allInvites) {
        let updateData = {};

        // Mark cancellation fee payment as received
        if (otherInvite.cancellationFeePaidInInvite === inviteId && 
            otherInvite.cancellationFeeRecipient === user.uid && 
            !otherInvite.cancellationFeePaymentReceived) {
          updateData.cancellationFeePaymentReceived = true;
          updateData.cancellationFeePaymentReceivedAt = new Date();
        }

        // Mark incentive payment as received
        if (otherInvite.incentivePaymentPaidInInvite === inviteId && 
            otherInvite.incentivePaymentRecipient === user.uid && 
            !otherInvite.incentivePaymentPaymentReceived) {
          updateData.incentivePaymentPaymentReceived = true;
          updateData.incentivePaymentPaymentReceivedAt = new Date();
        }

        // Update if there are changes
        if (Object.keys(updateData).length > 0) {
          await updateDoc(doc(db, 'planInvitations', otherInvite.id), updateData);
        }
      }

      // Update platform fee records for this invite as received by platform
      const platformFeesQuery = query(
        collection(db, 'platformFees'),
        where('inviteId', '==', inviteId),
        where('status', '==', 'issued')
      );
      const platformFeesSnapshot = await getDocs(platformFeesQuery);

      for (const platformFeeDoc of platformFeesSnapshot.docs) {
        await updateDoc(doc(db, 'platformFees', platformFeeDoc.id), {
          status: 'received_by_platform',
          receivedByPlatform: true,
          receivedAt: new Date(),
          receivedThroughInviteId: inviteId
        });
      }

      setShowPaymentConfirmModal(false);
      setPaymentToConfirm(null);
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
                  {invite.status === 'payment_done' && invite.pendingFeesIncluded > 0 && (
                    <span className="pending-fees-included">
                      ⚠️ Includes ${(invite.pendingFeesIncluded || 0).toFixed(2)} outstanding fees
                    </span>
                  )}
                  {invite.status === 'finished' && (
                    <span className="finished-status">
                      🏁 Ready for payment
                    </span>
                  )}
                </div>
              </div>

              {/* Outstanding fees notice for in_progress and finished invites */}
              {(invite.status === 'in_progress' || invite.status === 'finished') && (
                <OutstandingFeesNotice invite={invite} user={user} userProfile={userProfile} />
              )}

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
                value={editFormData.date ||''}
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
                    <h4>Next Steps:</h4>

                    {isAuthor && pendingFeesBreakdown && pendingFeesBreakdown.totalAmount > 0 && (
                      <div className="pending-fees-preview">
                        <div className="pending-fees-alert">
                          <h5>⚠️ Outstanding Fees Notice</h5>
                          <p>You have <strong>${pendingFeesBreakdown.totalAmount.toFixed(2)}</strong> in outstanding fees that will be included in your payment:</p>

                          <div className="fees-breakdown-preview">
                            {pendingFeesBreakdown.incentivePaymentsOwed > 0 && (
                              <div className="fee-item">
                                <span>Outstanding Incentive Payments:</span>
                                <span>${pendingFeesBreakdown.incentivePaymentsOwed.toFixed(2)}</span>
                              </div>
                            )}
                            {pendingFeesBreakdown.cancellationFeesOwed > 0 && (
                              <div className="fee-item">
                                <span>Outstanding Cancellation Fees:</span>
                                <span>${pendingFeesBreakdown.cancellationFeesOwed.toFixed(2)}</span>
                              </div>
                            )}
                            {pendingFeesBreakdown.platformFeesOwed > 0 && (
                              <div className="fee-item">
                                <span>Outstanding Platform Fees:</span>
                                <span>${pendingFeesBreakdown.platformFeesOwed.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="fee-total">
                              <span>Total Payment Required:</span>
                              <span>${(invite.price + pendingFeesBreakdown.totalAmount).toFixed(2)}</span>
                            </div>
                          </div>

                          <p className="payment-note">💡 Your pal will receive ${invite.price.toFixed(2)} (the invite amount), and ${pendingFeesBreakdown.totalAmount.toFixed(2)} will clear your outstanding platform debts.</p>
                        </div>
                      </div>
                    )}

                    {isAuthor && (!pendingFeesBreakdown || pendingFeesBreakdown.totalAmount === 0) && (
                      <div className="no-fees-notice">
                        <p>✅ Great! You have no outstanding fees. Your payment will only include the invite amount of ${invite.price.toFixed(2)}.</p>
                      </div>
                    )}

                    {/* Outstanding fees notice for recipients */}
                    {!isAuthor && (
                      <OutstandingFeesNotice invite={invite} user={user} userProfile={userProfile} />
                    )}

                    <h4>Instructions:</h4>
                    <ul>
                      {isAuthor ? (
                        <>
                          <li>Ensure both parties are satisfied with the experience</li>
                          <li>After finishing, you will be able to mark payment as done</li>
                          {pendingFeesBreakdown && pendingFeesBreakdown.totalAmount > 0 && (
                            <li>Your payment will include the invite amount plus outstanding fees shown above</li>
                          )}
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

      {/* Payment Received Confirmation Modal */}
      {showPaymentConfirmModal && paymentToConfirm && (
        <div className="modal-overlay" onClick={() => setShowPaymentConfirmModal(false)}>
          <div className="modal-content payment-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPaymentConfirmModal(false)}>×</button>

            <div className="payment-confirm-header">
              <h2>💰 Payment Received Confirmation</h2>
              <p>Please review the payment details before confirming</p>
            </div>

            <div className="payment-confirm-details">
              <div className="invite-summary">
                <h4>📋 Invite Details:</h4>
                <p><strong>Title:</strong> {paymentToConfirm.title}</p>
                <p><strong>From:</strong> {paymentToConfirm.fromUsername}</p>
                <p><strong>Base Incentive:</strong> ${(paymentToConfirm.incentiveAmount || paymentToConfirm.price).toFixed(2)}</p>
              </div>

              {paymentToConfirm.pendingFeesIncluded > 0 && (
                <div className="pending-fees-notice">
                  <h4>⚠️ Outstanding Fees Included:</h4>
                  <p>This payment includes <strong>${paymentToConfirm.pendingFeesIncluded.toFixed(2)}</strong> in outstanding fees that {paymentToConfirm.fromUsername} owed to the platform.</p>


                <div className="payment-breakdown-confirm">
                <div className="breakdown-row">
                  <span>Your Incentive Amount:</span>
                  <span>${(paymentToConfirm.calculatedBaseAmount || paymentToConfirm.incentiveAmount || paymentToConfirm.price).toFixed(2)}</span>
                </div>
                <div className="breakdown-row outstanding">
                  <span>Outstanding Fees (Platform):</span>
                  <span>${(paymentToConfirm.pendingFeesIncluded || 0).toFixed(2)}</span>
                </div>
                <div className="breakdown-total">
                  <span>Total Payment Received:</span>
                  <span>${(paymentToConfirm.calculatedTotalReceived || paymentToConfirm.totalPaidAmount || ((paymentToConfirm.incentiveAmount || paymentToConfirm.price) + (paymentToConfirm.pendingFeesIncluded || 0))).toFixed(2)}</span>
                </div>
              </div>



                <div className="important-notice">
                  <p><strong>💡 Important:</strong> The outstanding fees (${(paymentToConfirm.pendingFeesIncluded || 0).toFixed(2)}) are debts that {paymentToConfirm.fromUsername} owed to the platform administration, not to you. You should only receive the incentive amount (${(paymentToConfirm.calculatedBaseAmount || paymentToConfirm.incentiveAmount || paymentToConfirm.price).toFixed(2)}) for your time.</p>
                  <p><strong>📋 Confirm Receipt:</strong> By clicking "Yes", you confirm that you received the full payment of ${(paymentToConfirm.calculatedTotalReceived || paymentToConfirm.totalPaidAmount || ((paymentToConfirm.incentiveAmount || paymentToConfirm.price) + (paymentToConfirm.pendingFeesIncluded || 0))).toFixed(2)} in cash, which includes both your incentive and {paymentToConfirm.fromUsername}'s outstanding platform fees.</p>
                </div>

                </div>
              )}

              <div className="confirmation-instructions">
                <h4>✅ Confirmation Instructions:</h4>
                <ul>
                  <li>Verify you received the correct total cash amount: <strong>${(paymentToConfirm.calculatedTotalReceived || paymentToConfirm.totalPaidAmount || ((paymentToConfirm.incentiveAmount || paymentToConfirm.price) + (paymentToConfirm.pendingFeesIncluded || 0))).toFixed(2)}</strong></li>
                  <li>This includes your incentive (${(paymentToConfirm.calculatedBaseAmount || paymentToConfirm.incentiveAmount || paymentToConfirm.price).toFixed(2)}) + outstanding fees (${(paymentToConfirm.pendingFeesIncluded || 0).toFixed(2)})</li>
                  <li>Only confirm if you have physically received the full payment amount</li>
                  <li>This action will mark the invite as completed and clear the outstanding fees</li>
                </ul>
              </div>
            </div>

            <div className="payment-confirm-actions">
              <button 
                onClick={() => processPaymentConfirmation(paymentToConfirm.id)}
                className="confirm-received-btn"
              >
                ✅ Yes, I Received ${(paymentToConfirm.calculatedTotalReceived || paymentToConfirm.totalPaidAmount || ((paymentToConfirm.incentiveAmount || paymentToConfirm.price) + (paymentToConfirm.pendingFeesIncluded || 0))).toFixed(2)}
              </button>
              <button 
                onClick={() => setShowPaymentConfirmModal(false)}
                className="cancel-confirm-btn"
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
                        <span className="breakdown-label">This Invite Amount:</span>
                        <span className="breakdown-value">${incentiveAmount.toFixed(2)}</span>
                      </div>
                      {pendingFeesBreakdown && pendingFeesBreakdown.incentivePaymentsOwed > 0 && (
                        <div className="breakdown-item">
                          <span className="breakdown-label">Outstanding Incentive Payments:</span>
                          <span className="breakdown-value">${pendingFeesBreakdown.incentivePaymentsOwed.toFixed(2)}</span>
                        </div>
                      )}
                      {pendingFeesBreakdown && pendingFeesBreakdown.cancellationFeesOwed > 0 && (
                        <div className="breakdown-item">
                          <span className="breakdown-label">Outstanding Cancellation Fees:</span>
                          <span className="breakdown-value">${pendingFeesBreakdown.cancellationFeesOwed.toFixed(2)}</span>
                        </div>
                      )}
                      {pendingFeesBreakdown && pendingFeesBreakdown.platformFeesOwed > 0 && (
                        <div className="breakdown-item">
                          <span className="breakdown-label">Outstanding Platform Fees:</span>
                          <span className="breakdown-value">${pendingFeesBreakdown.platformFeesOwed.toFixed(2)}</span>
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

                    {pendingFees > 0 && pendingFeesBreakdown && (
                      <div className="pending-fees-notice">
                        <h4>⚠️ Outstanding Fees Notice:</h4>
                        <p>You have ${pendingFees.toFixed(2)} in outstanding fees that will be included in this payment.</p>

                        <div className="fees-breakdown-detail">
                          {pendingFeesBreakdown.incentivePaymentsOwed > 0 && (
                            <div className="fee-category">
                              <span className="fee-type">Outstanding Incentive Payments:</span>
                              <span className="fee-amount">${pendingFeesBreakdown.incentivePaymentsOwed.toFixed(2)}</span>
                            </div>
                          )}
                          {pendingFeesBreakdown.cancellationFeesOwed > 0 && (
                            <div className="fee-category">
                              <span className="fee-type">Outstanding Cancellation Fees:</span>
                              <span className="fee-amount">${pendingFeesBreakdown.cancellationFeesOwed.toFixed(2)}</span>
                            </div>
                          )}
                          {pendingFeesBreakdown.platformFeesOwed > 0 && (
                            <div className="fee-category">
                              <span className="fee-type">Platform Fees Owed:</span>
                              <span className="fee-amount">${pendingFeesBreakdown.platformFeesOwed.toFixed(2)}</span>
                            </div>
                          )}
                        </div>

                        {pendingFeesBreakdown.pendingPayments && pendingFeesBreakdown.pendingPayments.length > 0 && (
                          <div className="pending-payments-detail">
                            <h5>Detailed Breakdown:</h5>
                            <div className="payments-list-modal">
                              {pendingFeesBreakdown.pendingPayments.map(payment => (
                                <div key={`${payment.type}-${payment.id}`} className={`payment-item-modal ${payment.type}`}>
                                  <div className="payment-info-modal">
                                    <span className="payment-description-modal">{payment.description}</span>
                                    <span className="payment-date-modal">{payment.date.toLocaleDateString()}</span>
                                  </div>
                                  <span className={`payment-amount-modal ${payment.type}`}>
                                    ${(payment.amount || 0).toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="debt-clarification">
                          <p><strong>💡 Important:</strong> These are <em>your debts to the platform</em>, not to your pal. Your pal will receive only the incentive amount (${(selectedInvite.price || 0).toFixed(2)}). The outstanding fees (${pendingFees.toFixed(2)}) are settled with the platform administration.</p>
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