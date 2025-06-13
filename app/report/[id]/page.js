import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import ReportPageClient from './ReportPageClient';

// Required for static export
export async function generateStaticParams() {
  try {
    const snapshot = await getDocs(collection(db, 'reports'));
    return snapshot.docs.map(doc => ({ id: doc.id }));
  } catch (error) {
    console.error("Error generating static params:", error);
    return [];
  }
}

// Helper to convert Firestore data to plain JSON
function serializeReportData(data) {
  return {
    ...data,
    timestamp: data.timestamp?.toDate().toISOString() || null,
  };
}

// Server component to fetch report data
export default async function ReportPage({ params }) {
  try {
    const reportDoc = await getDoc(doc(db, 'reports', params.id));
    if (!reportDoc.exists()) {
      return (
        <div className="report-not-found">
          <h2>Report not found</h2>
          <p>This report doesn’t exist or has been removed.</p>
        </div>
      );
    }

    const report = {
      id: reportDoc.id,
      ...serializeReportData(reportDoc.data()),
    };

    return <ReportPageClient report={report} />;
  } catch (error) {
    console.error("Error loading report:", error);
    return (
      <div className="report-error">
        <h2>Error loading report</h2>
        <p>Something went wrong.</p>
      </div>
    );
  }
}