
# Ask a Pal - Application Requirements

## Overview
Ask a Pal is a social task and event platform that connects users for paid activities and experiences. Users can discover others ("pals"), send invites for activities, and complete transactions through a structured workflow.

## Core Features

### 1. User Authentication & Profiles
- **User Registration/Login**: Firebase Authentication with email/password
- **Profile Management**:
  - Username, location (city/country), profile picture
  - Profile visibility: Public (discoverable) or Private
  - Activity preferences (tags like "hiking", "coffee", "movies")
  - Language preferences
  - Email verification status
- **Profile Statistics**:
  - Sent/received invites count
  - Accepted/cancelled invites count
  - Favorites count
  - Total earnings (for public profiles)

### 2. Pal Discovery System
- **Browse Pals**: View all public profiles
- **Filtering**: 
  - All pals vs. Favorites only
  - Geographic filtering (currently disabled)
- **Pal Cards Display**:
  - Profile picture, username, location
  - Activity and language preferences preview
  - Favorite/unfavorite functionality
- **Profile Modal**: Detailed view with posts, activities, and interaction options

### 3. Invite System
#### Invite Creation
- **Event Details**: Title, description, meeting location
- **Scheduling**: Start/end date and time
- **Pricing**: Incentive amount (what sender pays recipient)
- **Pending Fees Integration**: Automatic inclusion of user's pending balance

#### Invite Workflow States
1. **Pending**: Awaiting recipient response
2. **Accepted**: Recipient agreed to participate
3. **Declined**: Recipient rejected invite
4. **Cancelled**: Sender cancelled (with potential fees)
5. **In Progress**: Activity started
6. **Finished**: Activity completed
7. **Payment Done**: Sender marked payment as complete
8. **Completed**: Recipient confirmed payment received

#### Invite Management
- **Edit**: Modify pending invites (title, description, location, time, price)
- **Cancel**: Cancel with fee structure:
  - Pending invites: No fee
  - Accepted invites: 50% cancellation fee + 30% pal compensation
- **Real-time Messaging**: Chat system within invite details
- **Status Tracking**: Complete audit trail of invite lifecycle

### 4. Financial System
#### Fee Structure
- **Platform Fee**: 5% on all transactions
- **Cancellation Fees**: 50% of invite price for accepted invites
- **Pal Compensation**: 30% of original price when invite cancelled

#### Payment Tracking
- **Pending Balance**: Tracks unpaid fees (cancellations, platform fees)
- **Total Earnings**: Lifetime earnings for pals
- **Payment Workflow**:
  - Cash-based transactions
  - Sender marks payment done
  - Recipient confirms receipt
  - Automatic fee calculations and balance updates

#### Balance Management
- **Incentive Payments**: Outstanding payments for accepted invites
- **Unpaid Cancellation Fees**: Fees from cancelled accepted invites
- **Payment History**: Detailed breakdown of all pending payments
- **Fee Payment**: Automatic inclusion in next invite payment

### 5. Content Management
#### Posts System
- **Post Creation**: Title, description, media (images/videos)
- **Media Upload**: Firebase Storage integration with 50MB limit
- **Post Display**: Author info, timestamp, location, engagement metrics
- **User Posts**: Profile section showing user's post history

#### Media Management
- **Profile Pictures**: Upload and display user avatars
- **Post Media**: Support for images and videos
- **Storage Cleanup**: Track and manage deleted media

### 6. Social Features
#### Favorites System
- **Add/Remove Favorites**: Bookmark preferred pals
- **Favorites Filter**: View only favorited pals
- **Profile Integration**: Favorites count in user statistics

#### Messaging System (Placeholder)
- **Conversations**: Direct messaging between users
- **Message History**: Persistent chat records
- **Real-time Updates**: Live message delivery
- **Read Status**: Message read/unread tracking

### 7. Navigation & UI
#### Main Navigation
- **Home**: Social feed with posts from all users
- **Pals**: Discover and browse public profiles
- **Invites**: Manage sent/received invites with filtering
- **New**: Create posts with media upload
- **Messages**: Direct messaging interface
- **Profile**: User profile management and statistics

#### Responsive Design
- **Mobile-First**: Optimized for mobile devices
- **Touch-Friendly**: Appropriate button sizes and spacing
- **Progressive Web App**: PWA capabilities with manifest

### 8. Data Architecture
#### Firebase Integration
- **Firestore Collections**:
  - `users`: User profiles and settings
  - `planInvitations`: All invite data and status tracking
  - `posts`: User-generated content
  - `inviteMessages`: Chat messages within invites
  - `messages`: Direct messages between users

#### Data Relationships
- **User-Invite**: Many-to-many (sent/received)
- **User-Post**: One-to-many
- **User-Favorites**: Many-to-many
- **Invite-Messages**: One-to-many

### 9. Security & Privacy
#### Profile Privacy
- **Public Profiles**: Discoverable, can receive invites
- **Private Profiles**: Not discoverable, can still send invites
- **Data Protection**: User data secured through Firebase rules

#### Content Moderation
- **User-Generated Content**: Posts and messages
- **Profile Information**: Username uniqueness validation
- **Media Content**: File type and size restrictions

### 10. Performance Features
#### Optimization
- **Image Optimization**: Automatic compression and sizing
- **Lazy Loading**: Efficient content loading
- **Caching**: Firebase offline capabilities
- **Real-time Updates**: Live data synchronization

#### Scalability
- **Firebase Backend**: Serverless architecture
- **CDN Integration**: Firebase Storage for media delivery
- **Efficient Queries**: Optimized database operations

## Technical Requirements

### Frontend
- **Framework**: Next.js 15.3.3 with React 19
- **Styling**: Custom CSS with CSS Variables
- **State Management**: React hooks and context
- **Responsive Design**: Mobile-first approach

### Backend
- **Authentication**: Firebase Auth
- **Database**: Cloud Firestore
- **Storage**: Firebase Storage
- **Hosting**: Suitable for Replit deployment

### Development
- **Environment**: Node.js with npm
- **Development Server**: Next.js dev server on port 3000
- **Build System**: Next.js with Turbopack
- **Version Control**: Git integration

## Future Enhancements
- **Payment Integration**: Stripe/PayPal for automated transactions
- **Geographic Search**: Location-based pal discovery
- **Rating System**: User feedback and ratings
- **Notification System**: Push notifications for invites/messages
- **Advanced Filtering**: More sophisticated search capabilities
- **Group Invites**: Multiple participant events
- **Calendar Integration**: Sync with external calendars
- **Video Chat**: Built-in video calling for remote activities

## Success Metrics
- **User Engagement**: Active users, invite completion rate
- **Transaction Volume**: Total invite value processed
- **User Retention**: Monthly/weekly active users
- **Platform Revenue**: Commission from completed transactions
- **User Satisfaction**: Completion rate, repeat usage

## Compliance & Legal
- **Data Privacy**: GDPR/CCPA compliance considerations
- **Terms of Service**: User agreement and platform rules
- **Payment Processing**: Financial transaction regulations
- **Content Policy**: Community guidelines and moderation
