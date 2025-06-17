'use client';

import "./globals.css";
import Nav from './components/Nav';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import Main from './main/Main';
import Pals from './pals/Pals';
import Profile from './profile/Profile';
import Messages from './messages/Messages';

import { auth, db, storage } from '../lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';

import { doc, setDoc } from "firebase/firestore";

export default function Home() {
  const router = useRouter();
  const currentUserUid = auth.currentUser?.uid;
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedSection, setSelectedSection] = useState('main');
  const [profileUserId, setProfileUserId] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        await checkVerificationStatus(user);
        setShowLoginModal(false);
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const checkVerificationStatus = async (user) => {
    await user.reload();
    setUser(auth.currentUser);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    if (!email || !password || (!isLogin && !name)) {
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
          console.log('Verification email sent!');

          const myCollection = doc(db, 'users', newUser.uid);
          const myDocumentData = {
            name: name,
            email: email,
            lastName: lastName,
          };

          await setDoc(myCollection, myDocumentData);
          console.log('Document added or updated successfully!');
          setErrorMessage('Please verify your email before proceeding.');
        } else {
          console.error('User authentication failed.');
          setErrorMessage('User authentication failed.');
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
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error.message);
      setErrorMessage('Error signing out. Please try again later.');
    }
  };

  const handleResendVerification = async () => {
    if (user && !user.emailVerified) {
      try {
        await sendEmailVerification(user);
        setErrorMessage('Verification email has been sent again.');
      } catch (error) {
        console.error('Error resending verification email:', error.message);
        setErrorMessage('Failed to resend the verification email.');
      }
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
      setForgotPassword(false); // Close forgot password view
    } catch (error) {
      console.error('Error sending password reset email:', error.message);
      setErrorMessage('Failed to send reset email. Please try again.');
    }
  };

  useEffect(() => {
    if (selectedSection === 'login') {
      setShowLoginModal(true);
      setSelectedSection('main');
    }
  }, [selectedSection]);

  const handleOpenModal = () => {
    // setShowNewReportModal(true);
  };

  const navigateToProfile = (userId) => {
    if (setProfileUserId) {
      setProfileUserId(userId);
    }
    setSelectedSection('profile');
  };

  const renderSelectedSection = () => {
    const renderSection = () => {
      switch (selectedSection) {
        case 'main':
          return <Main router={router} setSelectedSection={setSelectedSection} user={user} profileUserId={profileUserId} setProfileUserId={setProfileUserId}/>;
        case 'pals':
          return <Pals router={router} setSelectedSection={setSelectedSection} user={user} profileUserId={profileUserId} setProfileUserId={setProfileUserId}/>;
        case 'contribute':
          return <Contribute setSelectedSection={setSelectedSection} />;
        case 'profile':
          return <Profile userId={profileUserId} setSelectedSection={setSelectedSection} />;
        case 'messages':
          return <Messages setSelectedSection={setSelectedSection} />;
        case 'login':
          return <Main router={router} setSelectedSection={setSelectedSection} user={user} profileUserId={profileUserId} setProfileUserId={setProfileUserId}/>;
        default:
          return <Main router={router} setSelectedSection={setSelectedSection} user={user} profileUserId={profileUserId} setProfileUserId={setProfileUserId}/>;
      }
    };

    return (
      <>
        {user && !user.emailVerified && (
          <div style={{ 
            padding: '16px', 
            background: '#fef3c7', 
            color: '#92400e',
            textAlign: 'center',
            fontSize: '14px'
          }}>
            <p>📧 Please verify your email to report incidents</p>
            <button 
              onClick={handleResendVerification}
              style={{
                background: 'none',
                border: 'none',
                color: '#dc2626',
                textDecoration: 'underline',
                cursor: 'pointer',
                marginTop: '4px'
              }}
            >
              Resend verification email
            </button>
          </div>
        )}
        {renderSection()}
      </>
    );
  };


  return (
    <div className="page">
      <Nav setSelectedSection={setSelectedSection} handleLogout={handleLogout} user={user} />

      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowLoginModal(false)}>×</button>

            <div className='main-form'>
              <form onSubmit={handleAuth}>
                <div className='main-form-head'>
                  <h2>{isLogin ? 'Login or\u00A0' : 'Register or\u00A0'}</h2>
                  <button onClick={() => setIsLogin(!isLogin)}>
                    {isLogin ? 'Register' : 'Login'}
                  </button>
                </div>
                {!isLogin && (
                  <>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="First Name"
                      required
                    />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last Name"
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
                <div>
                  <button type="submit" disabled={loading}>
                    {loading ? 'Loading...' : isLogin ? 'Login' : 'Register'}
                  </button>
                </div>
                {isLogin && !forgotPassword && (
                  <button type="button" onClick={() => setForgotPassword(true)}>
                    Forgot Password?
                  </button>
                )}
                {forgotPassword && (
                  <div>
                    <h3>Reset Your Password</h3>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                    />
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
        {renderSelectedSection()}
      </main>

            {/* Bottom Action Bar */}
      <div className="bottom-action-bar">
        {user?.emailVerified ? (
          <>
            <button onClick={() => setSelectedSection('main')} className="report-btn">
              Home
            </button>
            <button onClick={() => setSelectedSection('pals')} className="report-btn">
              Find Pals
            </button>
            <button onClick={handleOpenModal} className="report-btn">
              New Report
            </button>
            <button className="report-btn">
              Explore
            </button>
            <button onClick={() => navigateToProfile(currentUserUid)} className="report-btn">
              My Profile
            </button>
          </>
        ) : (
          <button onClick={() => setSelectedSection('login')} className="login-action-btn">
            Login to Report
          </button>
        )}
      </div>

      {/* {!user && (
        <footer className="footer">
          <p>Ask a Pal - 2025</p>
        </footer>
      )} */}

    </div>
  );
}