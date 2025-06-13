
'use client';

import React, { useEffect, useState } from 'react';
import { auth, db } from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';

const Messages = ({ user }) => {
  const currentUserUid = auth.currentUser?.uid;
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserUid) return;

    const fetchConversations = async () => {
      try {
        // Get all messages where user is sender or receiver
        const sentQuery = query(
          collection(db, "messages"),
          where("senderId", "==", currentUserUid)
        );
        const receivedQuery = query(
          collection(db, "messages"),
          where("receiverId", "==", currentUserUid)
        );

        const [sentSnapshot, receivedSnapshot] = await Promise.all([
          getDocs(sentQuery),
          getDocs(receivedQuery)
        ]);

        const allMessages = [
          ...sentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
          ...receivedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        ];

        // Group messages by conversation partner
        const conversationMap = new Map();
        
        allMessages.forEach(message => {
          const partnerId = message.senderId === currentUserUid ? message.receiverId : message.senderId;
          const partnerName = message.senderId === currentUserUid ? message.receiverName : message.senderName;
          const partnerEmail = message.senderId === currentUserUid ? message.receiverEmail : message.senderEmail;
          
          if (!conversationMap.has(partnerId)) {
            conversationMap.set(partnerId, {
              partnerId,
              partnerName,
              partnerEmail,
              lastMessage: message,
              unreadCount: 0,
              messages: []
            });
          }
          
          const conversation = conversationMap.get(partnerId);
          conversation.messages.push(message);
          
          // Update last message if this one is newer
          if (message.timestamp?.toDate?.() > conversation.lastMessage.timestamp?.toDate?.()) {
            conversation.lastMessage = message;
          }
          
          // Count unread messages
          if (message.receiverId === currentUserUid && !message.read) {
            conversation.unreadCount++;
          }
        });

        // Sort conversations by last message timestamp
        const sortedConversations = Array.from(conversationMap.values()).sort((a, b) => {
          const aTime = a.lastMessage.timestamp?.toDate?.() || new Date(0);
          const bTime = b.lastMessage.timestamp?.toDate?.() || new Date(0);
          return bTime - aTime;
        });

        setConversations(sortedConversations);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching conversations:", error);
        setLoading(false);
      }
    };

    fetchConversations();

    // Set up real-time listener for new messages
    const messagesQuery = query(
      collection(db, "messages"),
      where("receiverId", "==", currentUserUid)
    );

    const unsubscribe = onSnapshot(messagesQuery, () => {
      fetchConversations();
    });

    return () => unsubscribe();
  }, [currentUserUid]);

  const selectConversation = async (conversation) => {
    setSelectedConversation(conversation);
    
    // Sort messages by timestamp
    const sortedMessages = conversation.messages.sort((a, b) => {
      const aTime = a.timestamp?.toDate?.() || new Date(0);
      const bTime = b.timestamp?.toDate?.() || new Date(0);
      return aTime - bTime;
    });
    
    setMessages(sortedMessages);

    // Mark messages as read
    try {
      const unreadMessages = conversation.messages.filter(
        msg => msg.receiverId === currentUserUid && !msg.read
      );
      
      for (const message of unreadMessages) {
        await updateDoc(doc(db, "messages", message.id), { read: true });
      }
      
      // Update local state
      setConversations(prev => prev.map(conv => 
        conv.partnerId === conversation.partnerId 
          ? { ...conv, unreadCount: 0 }
          : conv
      ));
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      const messageData = {
        senderId: currentUserUid,
        receiverId: selectedConversation.partnerId,
        senderEmail: user.email,
        senderName: user.displayName || user.email,
        receiverEmail: selectedConversation.partnerEmail,
        receiverName: selectedConversation.partnerName,
        message: newMessage.trim(),
        timestamp: serverTimestamp(),
        read: false
      };

      await addDoc(collection(db, "messages"), messageData);

      // Add message to local state immediately
      setMessages(prev => [...prev, {
        ...messageData,
        id: 'temp-' + Date.now(),
        timestamp: { toDate: () => new Date() }
      }]);

      setNewMessage('');
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  if (loading) {
    return (
      <div className="messages-loading">
        <div className="loading-spinner"></div>
        <p>Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="messages-section">
      <div className="messages-sidebar">
        <h3>Conversations</h3>
        {conversations.length === 0 ? (
          <div className="no-conversations">
            <p>No conversations yet</p>
          </div>
        ) : (
          <div className="conversations-list">
            {conversations.map(conversation => (
              <div 
                key={conversation.partnerId}
                className={`conversation-item ${selectedConversation?.partnerId === conversation.partnerId ? 'active' : ''}`}
                onClick={() => selectConversation(conversation)}
              >
                <div className="conversation-avatar">
                  {conversation.partnerName.charAt(0).toUpperCase()}
                </div>
                <div className="conversation-info">
                  <div className="conversation-header">
                    <span className="conversation-name">{conversation.partnerName}</span>
                    {conversation.unreadCount > 0 && (
                      <span className="unread-badge">{conversation.unreadCount}</span>
                    )}
                  </div>
                  <p className="last-message">
                    {conversation.lastMessage.message}
                  </p>
                  <span className="message-time">
                    {conversation.lastMessage.timestamp?.toDate?.()?.toLocaleDateString() || 'Recently'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="messages-main">
        {selectedConversation ? (
          <>
            <div className="messages-header">
              <h3>{selectedConversation.partnerName}</h3>
              <span>{selectedConversation.partnerEmail}</span>
            </div>
            
            <div className="messages-container">
              {messages.map(message => (
                <div 
                  key={message.id}
                  className={`message ${message.senderId === currentUserUid ? 'sent' : 'received'}`}
                >
                  <div className="message-content">
                    <p>{message.message}</p>
                    <span className="message-timestamp">
                      {message.timestamp?.toDate?.()?.toLocaleString() || 'Sending...'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={sendMessage} className="message-input-form">
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="message-input"
              />
              <button 
                type="submit"
                disabled={!newMessage.trim()}
                className="send-btn"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="no-conversation-selected">
            <h3>Select a conversation to start messaging</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default Messages;
