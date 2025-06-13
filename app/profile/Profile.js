
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';

const Profile = ({ userId, setSelectedSection, user }) => {
  const router = useRouter();
  const currentUserUid = auth.currentUser?.uid;
  const [profileUser, setProfileUser] = useState(null);
  const [userReports, setUserReports] = useState([]);
  const [collaboratedReports, setCollaboratedReports] = useState([]);
  const [favoriteReports, setFavoriteReports] = useState([]);
  const [activeTab, setActiveTab] = useState('reports');
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');

  const targetUserId = userId || currentUserUid;
  const isOwnProfile = targetUserId === currentUserUid;

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!targetUserId) return;

      try {
        // Fetch user data
        const userDoc = await getDoc(doc(db, "users", targetUserId));
        if (userDoc.exists()) {
          setProfileUser(userDoc.data());
          setFavoriteReports(userDoc.data().favoriteReports || []);
        }

        // Fetch user's reports
        const reportsQuery = query(
          collection(db, "reports"), 
          where("sender", "==", targetUserId)
        );
        const reportsSnapshot = await getDocs(reportsQuery);
        const reports = reportsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUserReports(reports);

        // Fetch collaborated reports
        const allReportsSnapshot = await getDocs(collection(db, "reports"));
        const collaboratedReports = allReportsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(report => 
            report.collaborators?.some(collaborator => collaborator.id === targetUserId)
          );
        setCollaboratedReports(collaboratedReports);

      } catch (error) {
        console.error("Error fetching profile data:", error);
      }
    };

    fetchProfileData();
  }, [targetUserId]);

  const sendMessage = async () => {
    if (!messageText.trim() || !currentUserUid || !profileUser) return;

    try {
      await addDoc(collection(db, "messages"), {
        senderId: currentUserUid,
        receiverId: targetUserId,
        senderEmail: user.email,
        senderName: user.displayName || user.email,
        receiverEmail: profileUser.email,
        receiverName: profileUser.displayName || profileUser.email,
        message: messageText.trim(),
        timestamp: serverTimestamp(),
        read: false
      });

      setMessageText('');
      setShowMessageModal(false);
      alert('Message sent successfully!');
    } catch (error) {
      console.error("Error sending message:", error);
      alert('Failed to send message');
    }
  };

  const navigateToReport = (reportId) => {
    router.push(`/report/${reportId}`);
  };

  if (!profileUser) {
    return (
      <div className="profile-loading">
        <div className="loading-spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="profile-section">
      <div className="profile-header">
        <div className="profile-info">
          <div className="profile-avatar">
            {profileUser.photoURL ? (
              <img src={profileUser.photoURL} alt="Profile" />
            ) : (
              <div className="avatar-placeholder">
                {(profileUser.displayName || profileUser.email).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="profile-details">
            <h2>{profileUser.displayName || 'Anonymous User'}</h2>
            <p className="profile-email">{profileUser.email}</p>
            <div className="profile-stats">
              <span>{userReports.length} Reports</span>
              <span>{collaboratedReports.length} Collaborations</span>
              <span>{favoriteReports.length} Favorites</span>
            </div>
          </div>
        </div>
        
        {!isOwnProfile && currentUserUid && (
          <button 
            className="message-btn"
            onClick={() => setShowMessageModal(true)}
          >
            💬 Send Message
          </button>
        )}
      </div>

      <div className="profile-tabs">
        <button 
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          My Reports
        </button>
        <button 
          className={`tab-btn ${activeTab === 'collaborated' ? 'active' : ''}`}
          onClick={() => setActiveTab('collaborated')}
        >
          Collaborated
        </button>
        {isOwnProfile && (
          <button 
            className={`tab-btn ${activeTab === 'favorites' ? 'active' : ''}`}
            onClick={() => setActiveTab('favorites')}
          >
            Favorites
          </button>
        )}
      </div>

      <div className="profile-content">
        {activeTab === 'reports' && (
          <div className="reports-grid">
            {userReports.length === 0 ? (
              <div className="empty-state">
                <p>No reports yet</p>
              </div>
            ) : (
              userReports.map(report => (
                <div 
                  key={report.id} 
                  className="report-card"
                  onClick={() => navigateToReport(report.id)}
                >
                  <div className="report-image">
                    {report.filename?.match(/\.(mp4|webm|ogg)$/i) ? (
                      <video src={report.fileUrl} />
                    ) : (
                      <img src={report.fileUrl} alt="Report" />
                    )}
                  </div>
                  <div className="report-info">
                    <div className={`report-type ${report.reportType}`}>
                      {report.reportType === 'problem' ? '🚨' : '✅'}
                    </div>
                    <p>{report.message}</p>
                    <span className="report-date">
                      {report.timestamp?.toDate?.()?.toLocaleDateString() || 'Recently'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'collaborated' && (
          <div className="reports-grid">
            {collaboratedReports.length === 0 ? (
              <div className="empty-state">
                <p>No collaborations yet</p>
              </div>
            ) : (
              collaboratedReports.map(report => (
                <div 
                  key={report.id} 
                  className="report-card"
                  onClick={() => navigateToReport(report.id)}
                >
                  <div className="report-image">
                    {report.filename?.match(/\.(mp4|webm|ogg)$/i) ? (
                      <video src={report.fileUrl} />
                    ) : (
                      <img src={report.fileUrl} alt="Report" />
                    )}
                  </div>
                  <div className="report-info">
                    <div className={`report-type ${report.reportType}`}>
                      {report.reportType === 'problem' ? '🚨' : '✅'}
                    </div>
                    <p>{report.message}</p>
                    <span className="report-date">
                      {report.timestamp?.toDate?.()?.toLocaleDateString() || 'Recently'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'favorites' && isOwnProfile && (
          <div className="favorites-list">
            {favoriteReports.length === 0 ? (
              <div className="empty-state">
                <p>No favorite reports yet</p>
              </div>
            ) : (
              favoriteReports.map(favorite => (
                <div 
                  key={favorite.id} 
                  className="favorite-item"
                  onClick={() => navigateToReport(favorite.id)}
                >
                  <div className="favorite-icon">⭐</div>
                  <div className="favorite-info">
                    <h4>{favorite.title}</h4>
                    <span>{favorite.link}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Message Modal */}
      {showMessageModal && (
        <div className="modal-overlay" onClick={() => setShowMessageModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowMessageModal(false)}>×</button>
            <h3>Send Message to {profileUser.displayName || profileUser.email}</h3>
            <textarea
              placeholder="Type your message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="message-textarea"
            />
            <button 
              onClick={sendMessage}
              disabled={!messageText.trim()}
              className="send-message-btn"
            >
              Send Message
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
