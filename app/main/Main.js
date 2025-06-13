
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db, storage } from '../../lib/firebase';
import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
  query,
  orderBy,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
  where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';

const Main = ({ router, setSelectedSection, user, setProfileUserId }) => {
  const currentUserUid = auth.currentUser?.uid;
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [showNewReportModal, setShowNewReportModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [currentReportIndex, setCurrentReportIndex] = useState(0);
  const [showReportDetails, setShowReportDetails] = useState(false);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [location, setLocation] = useState(null);
  const [expandedComments, setExpandedComments] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [users, setUsers] = useState({});
  const [favoriteReports, setFavoriteReports] = useState([]);
  
  // New state for report creation system
  const [reportType, setReportType] = useState('problem'); // 'problem' or 'action'
  const [linkedProblems, setLinkedProblems] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [collaboratorInput, setCollaboratorInput] = useState('');
  const [problemReports, setProblemReports] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all', 'problem', 'action'
  const [showLinkProblemsModal, setShowLinkProblemsModal] = useState(false);
  const [showCollaboratorsModal, setShowCollaboratorsModal] = useState(false);
  
  const fileInputRef = useRef(null);
  const fullscreenRef = useRef(null);
  const touchStartY = useRef(null);
  const isScrolling = useRef(false);

  // Fetch users data
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, "users"));
        const usersData = {};
        usersSnapshot.docs.forEach(doc => {
          usersData[doc.id] = doc.data();
        });
        setUsers(usersData);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    fetchUsers();
  }, []);

  // Fetch reports and favorites on mount
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const q = query(collection(db, "reports"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        const j_reports = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setReports(j_reports);
        setFilteredReports(j_reports);
        
        // Filter problem reports for linking
        const problems = j_reports.filter(report => report.reportType === 'problem');
        setProblemReports(problems);
      } catch (error) {
        console.error("Error fetching reports:", error);
      }
    };

    const fetchFavorites = async () => {
      if (currentUserUid) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUserUid));
          if (userDoc.exists()) {
            setFavoriteReports(userDoc.data().favoriteReports || []);
          }
        } catch (error) {
          console.error("Error fetching favorites:", error);
        }
      }
    };

    fetchReports();
    fetchFavorites();
  }, [currentUserUid]);

  // Apply filters
  useEffect(() => {
    let filtered = reports;
    if (filter === 'problem') {
      filtered = reports.filter(report => report.reportType === 'problem');
    } else if (filter === 'action') {
      filtered = reports.filter(report => report.reportType === 'action');
    }
    setFilteredReports(filtered);
  }, [reports, filter]);

  // Handle file input change
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    const MAX_SIZE = 1073741824; // 1GB in bytes

    if (selectedFile.size > MAX_SIZE) {
      alert("File size exceeds 1GB. Please upload a smaller file.");
      e.target.value = "";
      return;
    }

    setFile(selectedFile);
    setFilePreviewUrl(URL.createObjectURL(selectedFile));
  };

  // Upload file to Firebase
  const uploadToStorage = useCallback(async (file, pathPrefix) => {
    const filename = `${pathPrefix}/${currentUserUid}/${uuidv4()}`;
    const fileRef = ref(storage, filename);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
  }, [currentUserUid]);

  // Submit new report
  const handleSubmitReport = async (e) => {
    e.preventDefault();

    if (!file || !message.trim()) {
      alert("Please provide a file and summary.");
      return;
    }

    try {
      const uploadedUrl = await uploadToStorage(file, 'files');

      const newReportData = {
        sender: currentUserUid,
        senderEmail: user.email,
        senderName: user.displayName || user.email,
        type: 'file',
        message,
        fileUrl: uploadedUrl,
        filename: file.name,
        category: 'undefined',
        timestamp: serverTimestamp(),
        location,
        comments: [],
        reportType,
        linkedProblems: reportType === 'action' ? linkedProblems : [],
        collaborators: reportType === 'action' ? collaborators : [],
        favorites: []
      };

      const newReport = await addDoc(collection(db, "reports"), newReportData);

      // Add to local state immediately for better UX
      setReports(prev => [{
        id: newReport.id,
        ...newReportData,
        timestamp: { toDate: () => new Date() }
      }, ...prev]);

      // Reset form
      setMessage('');
      setFile(null);
      setFilePreviewUrl('');
      setLocation(null);
      setReportType('problem');
      setLinkedProblems([]);
      setCollaborators([]);
      setShowNewReportModal(false);
    } catch (error) {
      console.error("Error submitting report:", error);
    }
  };

  // Toggle favorite report
  const toggleFavorite = async (reportId) => {
    if (!currentUserUid) return;

    try {
      const userRef = doc(db, "users", currentUserUid);
      const reportData = reports.find(r => r.id === reportId);
      const favoriteItem = {
        id: reportId,
        title: reportData.message,
        link: `/report/${reportId}`
      };

      if (favoriteReports.some(fav => fav.id === reportId)) {
        // Remove from favorites
        await updateDoc(userRef, {
          favoriteReports: arrayRemove(favoriteItem)
        });
        setFavoriteReports(prev => prev.filter(fav => fav.id !== reportId));
      } else {
        // Add to favorites
        await updateDoc(userRef, {
          favoriteReports: arrayUnion(favoriteItem)
        });
        setFavoriteReports(prev => [...prev, favoriteItem]);
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  // Navigate to user profile
  const navigateToProfile = (userId) => {
    if (setProfileUserId) {
      setProfileUserId(userId);
    }
    setSelectedSection('profile');
  };

  // Add collaborator
  const addCollaborator = async () => {
    if (!collaboratorInput.trim()) return;
    
    try {
      // Find user by email
      const usersQuery = query(collection(db, "users"), where("email", "==", collaboratorInput.trim()));
      const usersSnapshot = await getDocs(usersQuery);
      
      if (usersSnapshot.empty) {
        alert("User not found with this email address.");
        return;
      }

      const userData = usersSnapshot.docs[0].data();
      const collaborator = {
        id: usersSnapshot.docs[0].id,
        email: userData.email,
        name: userData.displayName || userData.email
      };

      if (!collaborators.some(c => c.id === collaborator.id)) {
        setCollaborators(prev => [...prev, collaborator]);
      }
      setCollaboratorInput('');
    } catch (error) {
      console.error("Error adding collaborator:", error);
    }
  };

  // Add comment with image support
  const handleAddComment = async (reportId, commentImage = null) => {
    const commentText = commentInputs[reportId];
    if ((!commentText?.trim() && !commentImage) || !user?.emailVerified) return;

    try {
      let imageUrl = null;
      if (commentImage) {
        imageUrl = await uploadToStorage(commentImage, 'comment-images');
      }

      const reportRef = doc(db, "reports", reportId);
      const newComment = {
        id: uuidv4(),
        text: commentText?.trim() || '',
        author: user.email,
        authorName: user.displayName || user.email,
        timestamp: new Date().toISOString(),
        userId: currentUserUid,
        imageUrl
      };

      await updateDoc(reportRef, {
        comments: arrayUnion(newComment)
      });

      // Update local state
      setReports(prev => prev.map(report => 
        report.id === reportId 
          ? { ...report, comments: [...(report.comments || []), newComment] }
          : report
      ));

      // Clear input
      setCommentInputs(prev => ({ ...prev, [reportId]: '' }));
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  // Delete comment
  const handleDeleteComment = async (reportId, commentId) => {
    try {
      const report = reports.find(r => r.id === reportId);
      const updatedComments = report.comments.filter(comment => comment.id !== commentId);
      
      const reportRef = doc(db, "reports", reportId);
      await updateDoc(reportRef, {
        comments: updatedComments
      });

      // Update local state
      setReports(prev => prev.map(r => 
        r.id === reportId 
          ? { ...r, comments: updatedComments }
          : r
      ));
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };

  // Toggle comments visibility
  const toggleComments = (reportId) => {
    setExpandedComments(prev => ({
      ...prev,
      [reportId]: !prev[reportId]
    }));
  };

  // Handle comment input change
  const handleCommentInputChange = (reportId, value) => {
    setCommentInputs(prev => ({
      ...prev,
      [reportId]: value
    }));
  };

  // Open image in full screen modal
  const openFullScreenImage = (report) => {
    const reportIndex = filteredReports.findIndex(r => r.id === report.id);
    setCurrentReportIndex(reportIndex);
    setSelectedReport(report);
    setShowImageModal(true);
    setShowReportDetails(false);
  };

  // Close full screen modal
  const closeFullScreenModal = () => {
    setShowImageModal(false);
    setSelectedReport(null);
    setShowReportDetails(false);
  };

  // Navigation functions
  const navigateToNextReport = () => {
    if (currentReportIndex < filteredReports.length - 1) {
      const nextIndex = currentReportIndex + 1;
      setCurrentReportIndex(nextIndex);
      setSelectedReport(filteredReports[nextIndex]);
      setShowReportDetails(false);
    }
  };

  const navigateToPreviousReport = () => {
    if (currentReportIndex > 0) {
      const prevIndex = currentReportIndex - 1;
      setCurrentReportIndex(prevIndex);
      setSelectedReport(filteredReports[prevIndex]);
      setShowReportDetails(false);
    }
  };

  // Touch and wheel event handlers
  const handleTouchStart = (e) => {
    if (showReportDetails) return;
    touchStartY.current = e.touches[0].clientY;
    isScrolling.current = false;
  };

  const handleTouchMove = (e) => {
    if (showReportDetails || !touchStartY.current || isScrolling.current) return;
    
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY.current - touchY;
    
    if (Math.abs(deltaY) > 50) {
      isScrolling.current = true;
      
      if (deltaY > 0) {
        navigateToNextReport();
      } else {
        navigateToPreviousReport();
      }
      
      touchStartY.current = null;
    }
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
    setTimeout(() => {
      isScrolling.current = false;
    }, 100);
  };

  const handleWheel = (e) => {
    if (showReportDetails || isScrolling.current) return;
    
    e.preventDefault();
    isScrolling.current = true;
    
    if (e.deltaY > 0) {
      navigateToNextReport();
    } else {
      navigateToPreviousReport();
    }
    
    setTimeout(() => {
      isScrolling.current = false;
    }, 300);
  };

  const handleOpenModal = () => {
    setShowNewReportModal(true);
  };

  const copyReportLink = (reportId) => {
    const link = `${window.location.origin}/report/${reportId}`;
    navigator.clipboard.writeText(link);
    alert('Report link copied to clipboard!');
  };

  return (
    <div className="main-section">
      {/* Filter Controls */}
      <div className="filter-controls">
        <button 
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Reports
        </button>
        <button 
          className={`filter-btn ${filter === 'problem' ? 'active' : ''}`}
          onClick={() => setFilter('problem')}
        >
          Problems
        </button>
        <button 
          className={`filter-btn ${filter === 'action' ? 'active' : ''}`}
          onClick={() => setFilter('action')}
        >
          actions
        </button>
      </div>

      <div className='report-feed'>
        {filteredReports.length < 1 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📱</div>
            <h3>No Reports Yet</h3>
            <p>Be the first to report something in your area</p>
          </div>
        ) : (
          filteredReports.map((report) => (
            <div key={report.id} className="feed-item">
              <div className="feed-image-container" onClick={() => openFullScreenImage(report)}>
                {report.filename?.match(/\.(mp4|webm|ogg)$/i) ? (
                  <video
                    src={report.fileUrl}
                    className="feed-image"
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                ) : (
                  <img
                    src={report.fileUrl}
                    alt={report.filename || 'Report image'}
                    className="feed-image"
                  />
                )}
                <div className="feed-overlay">
                  <div className="feed-meta">
                    <div className={`report-type-badge ${report.reportType}`}>
                      {report.reportType === 'problem' 
                        ? '🚨 PROBLEM' 
                        : report.reportType === 'action' 
                          ? '✅ action' 
                          : 'report type not defined yet'}
                    </div>
                    <div className="feed-time">
                      {report.timestamp?.toDate ? report.timestamp.toDate().toLocaleString() : 'Just now'}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="feed-content">
                <div className="feed-header">
                  <span 
                    className="feed-author"
                    onClick={() => navigateToProfile(report.sender)}
                  >
                    By: {report.senderName || report.senderEmail}
                  </span>
                  <button
                    className={`favorite-btn ${favoriteReports.some(fav => fav.id === report.id) ? 'favorited' : ''}`}
                    onClick={() => toggleFavorite(report.id)}
                  >
                    {favoriteReports.some(fav => fav.id === report.id) ? '⭐' : '☆'}
                  </button>
                </div>
                
                <h3 className="feed-message">{report.message}</h3>
                
                {/* Show linked problems for action reports */}
                {report.reportType === 'action' && report.linkedProblems?.length > 0 && (
                  <div className="linked-problems">
                    <p><strong>Solves:</strong></p>
                    {report.linkedProblems.map(problemId => {
                      const problem = reports.find(r => r.id === problemId);
                      return problem ? (
                        <div key={problemId} className="linked-problem">
                          <span onClick={() => openFullScreenImage(problem)}>
                            📋 {problem.message.substring(0, 50)}...
                          </span>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                
                {/* Show collaborators for action reports */}
                {report.reportType === 'action' && report.collaborators?.length > 0 && (
                  <div className="collaborators">
                    <p><strong>Contributors:</strong></p>
                    <div className="collaborator-list">
                      {report.collaborators.map(collaborator => (
                        <span 
                          key={collaborator.id} 
                          className="collaborator"
                          onClick={() => navigateToProfile(collaborator.id)}
                        >
                          👤 {collaborator.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="feed-actions">
                  <button 
                    className="feed-action-btn"
                    onClick={() => toggleComments(report.id)}
                  >
                    💬 {report.comments?.length || 0}
                  </button>
                  <button 
                    className="feed-action-btn"
                    onClick={() => copyReportLink(report.id)}
                  >
                    🔗 Share
                  </button>
                  <button className="feed-action-btn">
                    📍 Location
                  </button>
                </div>
                
                {/* Comments Section */}
                {expandedComments[report.id] && (
                  <div className="feed-comments">
                    {report.comments?.slice(0, 2).map((comment) => (
                      <div key={comment.id} className="feed-comment">
                        <span 
                          className="feed-comment-author"
                          onClick={() => navigateToProfile(comment.userId)}
                        >
                          {comment.authorName || comment.author}
                        </span>
                        {comment.text && <span className="feed-comment-text">{comment.text}</span>}
                        {comment.imageUrl && (
                          <img src={comment.imageUrl} alt="Comment attachment" className="comment-image" />
                        )}
                        {currentUserUid === comment.userId && (
                          <button
                            className="feed-comment-delete"
                            onClick={() => handleDeleteComment(report.id, comment.id)}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    ))}
                    
                    {report.comments?.length > 2 && (
                      <button 
                        className="feed-view-more"
                        onClick={() => openFullScreenImage(report)}
                      >
                        View all {report.comments.length} comments
                      </button>
                    )}

                    {user?.emailVerified ? (
                      <div className="feed-comment-form">
                        <input
                          type="text"
                          placeholder="Add a comment..."
                          value={commentInputs[report.id] || ''}
                          onChange={(e) => handleCommentInputChange(report.id, e.target.value)}
                          className="feed-comment-input"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleAddComment(report.id);
                            }
                          }}
                        />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files[0]) {
                              handleAddComment(report.id, e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                          className="comment-image-input"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddComment(report.id)}
                          className="feed-comment-submit"
                          disabled={!commentInputs[report.id]?.trim()}
                        >
                          Post
                        </button>
                      </div>
                    ) : (
                      <button 
                        className="feed-login-btn"
                        onClick={() => setSelectedSection('login')}
                      >
                        Login to comment
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Full Screen Image Modal */}
      {showImageModal && selectedReport && (
        <div 
          className="fullscreen-modal"
          ref={fullscreenRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          <button className="fullscreen-close" onClick={closeFullScreenModal}>×</button>
          
          <div className="fullscreen-nav-indicators">
            <div className="nav-indicator">
              {currentReportIndex + 1} / {filteredReports.length}
            </div>
            {currentReportIndex > 0 && (
              <div className="nav-hint nav-hint-up">↑ Swipe up for previous</div>
            )}
            {currentReportIndex < filteredReports.length - 1 && (
              <div className="nav-hint nav-hint-down">↓ Swipe down for next</div>
            )}
          </div>

          <div className="fullscreen-image-container">
            {selectedReport.filename?.match(/\.(mp4|webm|ogg)$/i) ? (
              <video
                key={selectedReport.id}
                src={selectedReport.fileUrl}
                className="fullscreen-image"
                controls
                autoPlay
                playsInline
              />
            ) : (
              <img
                key={selectedReport.id}
                src={selectedReport.fileUrl}
                alt="Full size"
                className="fullscreen-image"
              />
            )}
          </div>
          
          {/* Report Details Tab */}
          <div className={`report-details-tab ${showReportDetails ? 'expanded' : ''}`}>
            <div className="tab-handle" onClick={() => setShowReportDetails(!showReportDetails)}>
              <div className="tab-indicator"></div>
              <div className="tab-preview">
                <h4>{selectedReport.message}</h4>
                <span>{selectedReport.comments?.length || 0} comments</span>
              </div>
              <div className="tab-arrow">{showReportDetails ? '▼' : '▲'}</div>
            </div>
            
            {showReportDetails && (
              <div className="tab-content">
                <div className="report-full-details">
                  <div className="report-meta">
                    <div className="report-timestamp">
                      {selectedReport.timestamp?.toDate ? selectedReport.timestamp.toDate().toLocaleString() : 'Just now'}
                    </div>
                    <span className={`report-status-full ${selectedReport.reportType}`}>
                      {selectedReport.reportType === 'problem' ? '🚨 PROBLEM REPORT' : '✅ action REPORT'}
                    </span>
                  </div>
                  
                  <div className="report-author-full">
                    <span onClick={() => navigateToProfile(selectedReport.sender)}>
                      👤 {selectedReport.senderName || selectedReport.senderEmail}
                    </span>
                  </div>
                  
                  <h3 className="report-message-full">{selectedReport.message}</h3>
                  
                  {/* Show linked problems and collaborators in full view */}
                  {selectedReport.reportType === 'action' && (
                    <div className="action-details">
                      {selectedReport.linkedProblems?.length > 0 && (
                        <div className="linked-problems-full">
                          <h4>Problems Solved:</h4>
                          {selectedReport.linkedProblems.map(problemId => {
                            const problem = reports.find(r => r.id === problemId);
                            return problem ? (
                              <div key={problemId} className="linked-problem-full">
                                📋 {problem.message}
                              </div>
                            ) : null;
                          })}
                        </div>
                      )}
                      
                      {selectedReport.collaborators?.length > 0 && (
                        <div className="collaborators-full">
                          <h4>Contributors:</h4>
                          <div className="collaborator-list-full">
                            {selectedReport.collaborators.map(collaborator => (
                              <span 
                                key={collaborator.id} 
                                className="collaborator-full"
                                onClick={() => navigateToProfile(collaborator.id)}
                              >
                                👤 {collaborator.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* All Comments */}
                  <div className="comments-section-full">
                    <h4>Comments ({selectedReport.comments?.length || 0})</h4>
                    {selectedReport.comments?.map((comment) => (
                      <div key={comment.id} className="comment-full">
                        <div className="comment-header-full">
                          <span 
                            className="comment-author-full"
                            onClick={() => navigateToProfile(comment.userId)}
                          >
                            {comment.authorName || comment.author}
                          </span>
                          <span className="comment-time-full">
                            {new Date(comment.timestamp).toLocaleDateString()}
                          </span>
                          {currentUserUid === comment.userId && (
                            <button
                              className="comment-delete-full"
                              onClick={() => handleDeleteComment(selectedReport.id, comment.id)}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                        {comment.text && <p className="comment-text-full">{comment.text}</p>}
                        {comment.imageUrl && (
                          <img src={comment.imageUrl} alt="Comment attachment" className="comment-image-full" />
                        )}
                      </div>
                    ))}
                    
                    {user?.emailVerified ? (
                      <div className="comment-form-full">
                        <input
                          type="text"
                          placeholder="Add a comment..."
                          value={commentInputs[selectedReport.id] || ''}
                          onChange={(e) => handleCommentInputChange(selectedReport.id, e.target.value)}
                          className="comment-input-full"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleAddComment(selectedReport.id);
                            }
                          }}
                        />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files[0]) {
                              handleAddComment(selectedReport.id, e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                          className="comment-image-input-full"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddComment(selectedReport.id)}
                          className="comment-submit-full"
                          disabled={!commentInputs[selectedReport.id]?.trim()}
                        >
                          Post
                        </button>
                      </div>
                    ) : (
                      <button 
                        className="login-prompt-full"
                        onClick={() => setSelectedSection('login')}
                      >
                        Login to comment
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Report Modal */}
      {showNewReportModal && (
        <div className="modal-overlay" onClick={() => setShowNewReportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowNewReportModal(false)}>×</button>
            <h3 className="modal-title">Create New Report</h3>

            {/* Report Type Selection */}
            <div className="report-type-selection">
              <label>
                <input
                  type="radio"
                  value="problem"
                  checked={reportType === 'problem'}
                  onChange={(e) => setReportType(e.target.value)}
                />
                🚨 Problem Report
              </label>
              <label>
                <input
                  type="radio"
                  value="action"
                  checked={reportType === 'action'}
                  onChange={(e) => setReportType(e.target.value)}
                />
                ✅ action Report
              </label>
            </div>

            {/* action-specific fields */}
            {reportType === 'action' && (
              <div className="action-fields">
                <div className="form-group">
                  <label>Problems this solves:</label>
                  <button 
                    type="button" 
                    onClick={() => setShowLinkProblemsModal(true)}
                    className="link-problems-btn"
                  >
                    Link Problems ({linkedProblems.length})
                  </button>
                </div>
                
                <div className="form-group">
                  <label>Add Collaborators:</label>
                  <button 
                    type="button" 
                    onClick={() => setShowCollaboratorsModal(true)}
                    className="add-collaborators-btn"
                  >
                    Add Collaborators ({collaborators.length})
                  </button>
                </div>
              </div>
            )}

            {/* File Preview */}
            {filePreviewUrl && (
              <div className="file-preview">
                {file?.type.startsWith('image/') && (
                  <img src={filePreviewUrl} alt="preview" />
                )}
                {file?.type.startsWith('video/') && (
                  <video controls src={filePreviewUrl} />
                )}
              </div>
            )}

            <form onSubmit={handleSubmitReport}>
              <div className="form-group">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <textarea
                  placeholder={reportType === 'problem' ? "Describe the problem..." : "Describe your action..."}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="form-textarea"
                  required
                />
              </div>
              <button 
                type="submit" 
                disabled={!file || !message.trim()}
                className="form-button"
              >
                Submit {reportType === 'problem' ? 'Problem' : 'action'} Report
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Link Problems Modal */}
      {showLinkProblemsModal && (
        <div className="modal-overlay" onClick={() => setShowLinkProblemsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowLinkProblemsModal(false)}>×</button>
            <h3>Link Problem Reports</h3>
            <div className="problem-list">
              {problemReports.map(problem => (
                <div key={problem.id} className="problem-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={linkedProblems.includes(problem.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setLinkedProblems(prev => [...prev, problem.id]);
                        } else {
                          setLinkedProblems(prev => prev.filter(id => id !== problem.id));
                        }
                      }}
                    />
                    {problem.message}
                  </label>
                </div>
              ))}
            </div>
            <button onClick={() => setShowLinkProblemsModal(false)}>Done</button>
          </div>
        </div>
      )}

      {/* Add Collaborators Modal */}
      {showCollaboratorsModal && (
        <div className="modal-overlay" onClick={() => setShowCollaboratorsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCollaboratorsModal(false)}>×</button>
            <h3>Add Collaborators</h3>
            <div className="collaborator-input">
              <input
                type="email"
                placeholder="Enter collaborator's email"
                value={collaboratorInput}
                onChange={(e) => setCollaboratorInput(e.target.value)}
              />
              <button onClick={addCollaborator}>Add</button>
            </div>
            <div className="collaborator-list">
              {collaborators.map(collaborator => (
                <div key={collaborator.id} className="collaborator-item">
                  <span>{collaborator.name} ({collaborator.email})</span>
                  <button onClick={() => setCollaborators(prev => prev.filter(c => c.id !== collaborator.id))}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowCollaboratorsModal(false)}>Done</button>
          </div>
        </div>
      )}

    </div>
  );
};

export default Main;
