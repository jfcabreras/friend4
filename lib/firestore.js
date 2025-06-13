// src/lib/firestore.js

import { db } from './firebase';
import { getFirestore } from "firebase/firestore";
import { collection, addDoc, setDoc, getDoc, doc } from 'firebase/firestore';

export const createBooking = async (userId, rentalId, hours, transportationFee) => {
  try {
    const bookingRef = await addDoc(collection(db, 'bookings'), {
      userId,
      rentalId,
      hours,
      transportationFee,
      timestamp: new Date(),
    });
    return bookingRef.id;
  } catch (error) {
    console.error('Error creating booking: ', error);
  }
};

export const getUserData = async (userId) => {
  const userDoc = await getDoc(doc(db, 'users', userId));
  return userDoc.data();
};