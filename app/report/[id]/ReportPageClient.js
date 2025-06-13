'use client';

import React from 'react';

export default function ReportPageClient({ report }) {
  if (!report) {
    return (
      <div className="report-not-found">
        <h2>Report not found</h2>
        <p>The report you're looking for doesn't exist or has been removed.</p>
      </div>
    );
  }

  return (
    <div className="report-page">
      <div className="report-header">
        <h1>Report Details</h1>
        <div className={`report-type-badge ${report.reportType}`}>
          {report.reportType === 'problem' ? '🚨 PROBLEM' : '✅ action'}
        </div>
      </div>

      <div className="report-content">
        <div className="report-media">
          {report.filename?.match(/\.(mp4|webm|ogg)$/i) ? (
            <video src={report.fileUrl} controls className="report-video" />
          ) : (
            <img src={report.fileUrl} alt="Report media" className="report-image" />
          )}
        </div>

        <div className="report-details">
          <div className="report-meta">
            <span className="report-author">
              By: {report.senderName || report.senderEmail}
            </span>
            <span className="report-date">
              {report.timestamp ? new Date(report.timestamp).toLocaleString() : 'Recently'}
            </span>
          </div>

          <h2 className="report-message">{report.message}</h2>

          {report.reportType === 'action' && (
            <div className="action-info">
              {report.linkedProblems?.length > 0 && (
                <div className="linked-problems">
                  <h3>Problems Solved:</h3>
                  {report.linkedProblems.map((problemId) => (
                    <div key={problemId} className="linked-problem">
                      📋 Problem ID: {problemId}
                    </div>
                  ))}
                </div>
              )}

              {report.collaborators?.length > 0 && (
                <div className="collaborators">
                  <h3>Contributors:</h3>
                  <div className="collaborator-list">
                    {report.collaborators.map((collaborator) => (
                      <span key={collaborator.id} className="collaborator">
                        👤 {collaborator.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="report-comments">
            <h3>Comments ({report.comments?.length || 0})</h3>
            {report.comments?.map((comment) => (
              <div key={comment.id} className="comment">
                <div className="comment-header">
                  <span className="comment-author">
                    {comment.authorName || comment.author}
                  </span>
                  <span className="comment-date">
                    {new Date(comment.timestamp).toLocaleDateString()}
                  </span>
                </div>
                {comment.text && <p className="comment-text">{comment.text}</p>}
                {comment.imageUrl && (
                  <img
                    src={comment.imageUrl}
                    alt="Comment attachment"
                    className="comment-image"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}