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

const Pals = ({ router, setSelectedSection, user, setProfileUserId }) => {

  return(
    <div className="main-section">
      {/* Filter Controls */}
      <div className="filter-controls">
        <button 
          // className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          // onClick={() => setFilter('all')}
        >
          All
        </button>
        <button 
          // className={`filter-btn ${filter === 'problem' ? 'active' : ''}`}
          // onClick={() => setFilter('problem')}
        >
          Following
        </button>
      </div>

      <div className='report-feed'>
        <p>Pal</p>
        <p>Pal</p>
        <p>Pal</p>
        <p>Pal</p>
        <p>Pal</p>
        <p>Pal</p>
        <p>Pal</p>
        <p>Pal</p>
        <p>Pal</p>
      </div>

    </div>
  )
}

export default Pals;