'use client';

import "./globals.css";
import Nav from './components/Nav';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import Home from './home/Home';
import Pals from './pals/Pals';
import Invites from './invites/Invites';
import Profile from './profile/Profile';

import { auth, db } from '../lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc } from "firebase/firestore";

export default function App() {
  const router = useRouter();
  const currentUserUid = auth.currentUser?.uid;
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedSection, setSelectedSection] = useState('home');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [profileType, setProfileType] = useState('public');
  const [isLogin, setIsLogin] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        await loadUserProfile(user.uid);
        setShowLoginModal(false);
      } else {
        setUser(null);
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadUserProfile = async (uid) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        setUserProfile(userDoc.data());
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    if (!email || !password || (!isLogin && (!username || !country || !city))) {
      setErrorMessage('Please fill in all fields');
      setLoading(false);
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = userCredential.user;

        if (newUser) {
          await sendEmailVerification(newUser);

          const userData = {
            username: username,
            email: email,
            profileType: profileType,
            country: country,
            city: city,
            favorites: [],
            createdAt: new Date(),
            emailVerified: false
          };

          await setDoc(doc(db, 'users', newUser.uid), userData);
          setErrorMessage('Please verify your email before proceeding.');
        }
      }
    } catch (error) {
      console.error('Error authenticating:', error.message);
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSelectedSection('home');
    } catch (error) {
      console.error('Error signing out:', error.message);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setErrorMessage('Please enter your email address to reset your password.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setErrorMessage('Password reset email sent! Check your inbox.');
      setForgotPassword(false);
    } catch (error) {
      console.error('Error sending password reset email:', error.message);
      setErrorMessage('Failed to send reset email. Please try again.');
    }
  };

  const handleSectionChange = (section) => {
    if (!user && section !== 'home') {
      setShowLoginModal(true);
      return;
    }
    setSelectedSection(section);
  };

  const renderSelectedSection = () => {
    switch (selectedSection) {
      case 'home':
        return <Home user={user} userProfile={userProfile} />;
      case 'pals':
        return <Pals user={user} userProfile={userProfile} />;
      case 'invites':
        return <Invites user={user} userProfile={userProfile} />;
      case 'profile':
        return <Profile user={user} userProfile={userProfile} />;
      default:
        return <Home user={user} userProfile={userProfile} />;
    }
  };

  return (
    <div className="page">
      <Nav selectedSection={selectedSection} setSelectedSection={handleSectionChange} user={user} />

      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowLoginModal(false)}>×</button>

            <div className='main-form'>
              <form onSubmit={handleAuth}>
                <div className='main-form-head'>
                  <h2>{isLogin ? 'Login or\u00A0' : 'Register or\u00A0'}</h2>
                  <button type="button" onClick={() => setIsLogin(!isLogin)}>
                    {isLogin ? 'Register' : 'Login'}
                  </button>
                </div>

                {!isLogin && (
                  <>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Username"
                      required
                    />
                    <select
                      value={profileType}
                      onChange={(e) => setProfileType(e.target.value)}
                      required
                    >
                      <option value="public">Public Profile (Visible for receiving invites)</option>
                      <option value="private">Private Profile (Not discoverable)</option>
                    </select>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Country"
                      required
                    />
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      required
                    />
                  </>
                )}

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                />

                {!isLogin && (
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm Password"
                    required
                  />
                )}

                <button type="submit" disabled={loading}>
                  {loading ? 'Loading...' : isLogin ? 'Login' : 'Register'}
                </button>

                {isLogin && !forgotPassword && (
                  <button type="button" onClick={() => setForgotPassword(true)}>
                    Forgot Password?
                  </button>
                )}

                {forgotPassword && (
                  <div>
                    <button type="button" onClick={handleForgotPassword}>
                      Send Reset Link
                    </button>
                    <button type="button" onClick={() => setForgotPassword(false)}>
                      Back to Login
                    </button>
                  </div>
                )}
              </form>
              {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
            </div>
          </div>
        </div>
      )}

      <main className="main">
        {user && !user.emailVerified && (
          <div className="verification-banner">
            <p>📧 Please verify your email to access all features</p>
          </div>
        )}
        {renderSelectedSection()}
      </main>

      <div className="bottom-nav">
        <button 
          onClick={() => handleSectionChange('home')} 
          className={selectedSection === 'home' ? 'active' : ''}
        >
          🏠 Home
        </button>
        <button 
          onClick={() => handleSectionChange('pals')} 
          className={selectedSection === 'pals' ? 'active' : ''}
        >
          👥 Pals
        </button>
        <button 
          onClick={() => handleSectionChange('invites')} 
          className={selectedSection === 'invites' ? 'active' : ''}
        >
          📨 Invites
        </button>
        <button 
          onClick={() => handleSectionChange('profile')} 
          className={selectedSection === 'profile' ? 'active' : ''}
        >
          👤 Profile
        </button>
        {user && (
          <button onClick={handleLogout} className="logout-btn">
            🚪 Logout
          </button>
        )}
      </div>
    </div>
  );
}