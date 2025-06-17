'use client';  // Marks the component as a Client Component

import '../globals.css';

const Nav = ({ setSelectedSection, handleLogout, user}) => {
  const handleSectionChange = (section) => {
    setSelectedSection(section);  // Update the selected section state in the parent component
  };

  return (
    <nav className="navigation">
      <div className="navigation-logo">
        <button onClick={() => handleSectionChange('main')}>
          <h1>Ask a Pal</h1>
        </button>
      </div>
      {user && 
        <div className="navigation-options">
          {/* Uncomment and customize the navigation buttons as needed */}
          {/* 
          <button onClick={() => handleSectionChange('main')}>Inicio</button>
          <button onClick={() => handleSectionChange('contribute')}>Apóyanos</button>
          <button onClick={() => handleSectionChange('login')}>Ingresar</button>
          <button onClick={() => handleSectionChange('signin')}>Registro</button>
          <button onClick={() => handleSectionChange('profile')}>Mi Perfíl</button>
          */}
          <button>Notifications</button>
          <button>Messages</button>
          <button onClick={handleLogout}>Salir</button>
        </div>
      }
    </nav>
  );
};

export default Nav;